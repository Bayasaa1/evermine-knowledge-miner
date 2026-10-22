import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { splitIntoChunks, type Chunk } from "@/lib/chunking";
import { mergeChunkResults } from "@/lib/merge-results";
import type { ChunkResult } from "@/lib/gemini";
import { isQuotaMessage, packInstructions, quotaRetryAfter, unpackInstructions } from "@/lib/mining-jobs";
import type { ChunkStepResult, MiningJob, MiningJobStatus } from "@/lib/mining-jobs";

const assessmentSchema = z.object({
  videoContext: z.string().max(120).default("Podcast"),
  primaryFocus: z.string().max(120).default("Knowledge / QA"),
  customInstructions: z.string().max(2_000).default(""),
  speakerIdentity: z.string().max(300).default(""),
  sourceTitle: z.string().max(300).default(""),
  sourceDescription: z.string().max(4_000).default(""),
  sourcePublishedAt: z.string().max(64).default(""),
  sourceDurationLabel: z.string().max(32).default(""),
  sourceChannel: z.string().max(200).default(""),
  outputLanguage: z.string().max(8).default("en"),
  /** Read the subtitles ("fast"), watch the video ("watch"), or decide from the video type. */
  miningMode: z.enum(["auto", "fast", "watch"]).default("auto"),
});

const startSchema = z.object({
  url: z.string().min(5).max(2_048),
  assessment: assessmentSchema,
  // Where the finished Mind must be filed. Stored on the job so the background
  // worker can save the result without the creator's tab being open.
  personaId: z.string().uuid().nullable().default(null),
  projectId: z.string().uuid().nullable().default(null),
  contentKind: z.string().max(32).default("VISUAL_CONTENT"),
  /** Creation type picked in the "+" hub — kept with the video for good. */
  category: z.string().max(32).default("knowledge"),
  // Private unless the creator explicitly asked to share this one.
  publishToFeed: z.boolean().default(false),
  /** Only true when the creator deliberately asks to mine a finished video again. */
  force: z.boolean().default(false),
  /**
   * The creator's own Gemini key from their device vault. Saved on the job so
   * the background worker keeps mining on the creator's own free quota while
   * their tab is closed. Never returned to any client.
   */
  apiKey: z.string().max(200).optional(),
  /** Last characters of the saved Gemini key the creator picked for this run. */
  apiKeyTail: z.string().max(8).optional(),
});

type JobRow = {
  id: string;
  source_url: string;
  source_label: string;
  playlist_id: string | null;
  queue_position: number;
  video_context: string;
  primary_focus: string;
  custom_instructions: string;
  chunks: unknown;
  /** Absent in list responses (see SELECT_LIST); present for single-job reads. */
  results?: unknown;
  next_index: number;
  total_chunks: number;
  persona_id?: string | null;
  status: string;
  vault_id: string | null;
  last_error: string | null;
  retry_after: string | null;
  updated_at: string;
  created_at: string;
};

const SELECT =
  "id, source_url, source_label, playlist_id, queue_position, video_context, primary_focus, custom_instructions, chunks, results, next_index, total_chunks, status, vault_id, last_error, retry_after, updated_at, created_at, persona_id";

/**
 * List view without the huge `results` column (full AI output per chunk).
 * Fetching it for 50 rows at once used to time out the database query; the
 * list only needs `chunks` (small per-part plan) for its progress display.
 */
const SELECT_LIST = SELECT.replace(", results", "");

function toJob(row: JobRow): MiningJob {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    sourceLabel: row.source_label,
    playlistId: row.playlist_id,
    queuePosition: row.queue_position,
    assessment: {
      videoContext: row.video_context,
      primaryFocus: row.primary_focus,
      ...unpackInstructions(row.custom_instructions ?? ""),
    },
    chunks: (Array.isArray(row.chunks) ? row.chunks : []) as Chunk[],
    nextIndex: row.next_index,
    totalChunks: row.total_chunks,
    status: row.status as MiningJobStatus,
    vaultId: row.vault_id,
    lastError: row.last_error,
    retryAfter: row.retry_after,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    personaId: row.persona_id ?? null,
  };
}

function storedResults(row: JobRow): ChunkResult[] {
  return (Array.isArray(row.results) ? row.results : []) as ChunkResult[];
}

/**
 * Plans one mining job per video (playlists expand into a sequential queue) and
 * splits every video into 5-minute chunks that are checkpointed one by one.
 */
export const startMiningJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => startSchema.parse(input))
  .handler(async ({ data, context }): Promise<MiningJob[]> => {
    const { assertNotBanned } = await import("@/lib/api-guard.server");
    await assertNotBanned(context.supabase, context.userId);
    const { playlistId, fetchPlaylistVideoIds, fetchVideoMeta } = await import("@/lib/youtube-meta.server");
    const { youtubeId } = await import("@/lib/import-sources");

    if (!data.personaId || !data.projectId) {
      throw new Error("Choose a persona and a saved project before mining.");
    }

    // Resolve the account key assigned to Mining in API Manager. The key rides
    // on the private job row so background work can continue after the tab closes.
    const { resolveGeminiCredential } = await import("@/lib/user-ai.server");
    const credential = await resolveGeminiCredential(context.userId, data, "mine");
    const ownerKey = credential.value;
    const { data: destination } = await context.supabase
      .from("projects")
      .select("id, persona_id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .eq("persona_id", data.personaId)
      .maybeSingle();
    if (!destination) throw new Error("That project does not belong to the selected persona.");

    const list = playlistId(data.url);
    let videoIds: string[] = [];
    if (list) {
      videoIds = await fetchPlaylistVideoIds(list);
      if (videoIds.length === 0) throw new Error("That playlist is empty or private.");
    } else {
      const single = youtubeId(data.url);
      if (!single) throw new Error("That does not look like a YouTube video or playlist link.");
      videoIds = [single];
    }

    // A video that is already being mined — or already finished — must never be
    // queued again. That is what produced duplicate cards and double AI spend.
    const { data: active } = await context.supabase
      .from("mining_jobs")
      .select("id, source_url, status")
      .eq("user_id", context.userId)
      .in(
        "status",
        data.force
          ? ["queued", "running", "paused_quota", "paused_user"]
          : ["queued", "running", "paused_quota", "paused_user", "done"],
      );
    const idOf = (url: string) => /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/.exec(url ?? "")?.[1];
    const busy = new Set((active ?? []).map((row) => idOf(row.source_url ?? "")).filter(Boolean) as string[]);

    // Where the creator filed the video when saving it stays authoritative.
    // Mining started from Saved Minds carries no wizard target, and losing the
    // persona there is what made videos disappear from a profile.
    const { data: savedRows } = await context.supabase
      .from("mind_vaults")
      .select("payload, persona_id, project_id")
      .eq("user_id", context.userId)
      .eq("kind", "source");
    const filedBy = new Map<string, { persona: string | null; project: string | null }>();
    for (const row of savedRows ?? []) {
      const payload = (row as { payload?: { source?: { url?: string } } }).payload;
      const vid = /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/.exec(payload?.source?.url ?? "")?.[1];
      if (!vid || filedBy.has(vid)) continue;
      filedBy.set(vid, {
        persona: (row as { persona_id: string | null }).persona_id ?? null,
        project: (row as { project_id: string | null }).project_id ?? null,
      });
    }

    const rows = [];
    for (let i = 0; i < videoIds.length; i++) {
      if (busy.has(videoIds[i]!)) continue;
      const filed = filedBy.get(videoIds[i]!);
      const personaId: string = filed?.persona ?? data.personaId;
      const projectId: string = filed?.project ?? data.projectId;
      if (personaId !== data.personaId || projectId !== data.projectId) {
        throw new Error("This video is already filed under a different persona or project.");
      }
      const meta = await fetchVideoMeta(videoIds[i]!);
      // Chunk count is always derived from the real duration: ceil(seconds / 300).

      const chunks = splitIntoChunks(meta.durationSec);
      rows.push({
        user_id: context.userId,
        source_kind: "youtube",
        source_url: meta.url,
        source_label: meta.title,
        playlist_id: list,
        queue_position: i,
        video_context: data.assessment.videoContext,
        primary_focus: data.assessment.primaryFocus,
        custom_instructions: packInstructions(data.assessment),
        chunks: chunks as never,
        results: [] as never,
        next_index: 0,
        total_chunks: chunks.length,
        status: "queued",
        persona_id: personaId,
        project_id: projectId,
        content_kind: data.contentKind,
        category: data.category,
        publish_to_feed: data.publishToFeed,
        ai_credential: ownerKey,
      });
    }

    if (rows.length === 0) return [];
    const { data: saved, error } = await context.supabase.from("mining_jobs").insert(rows).select(SELECT);
    if (error) throw new Error(error.message);
    return (saved as JobRow[]).map(toJob);
  });

/**
 * Mines exactly one 5-minute chunk and checkpoints it. Quota errors pause the
 * job instead of failing it, so the background worker can resume it later.
 */
export const runNextChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        jobId: z.string().uuid(),
        apiKey: z.string().max(200).optional(),
        // Playlist auto-resume: skip a job another tab or the background
        // worker touched in the last 3 minutes.
        respectLease: z.boolean().optional(),
        /** Parallel lane: each lane starts on a different Gemini key. */
        lane: z.number().int().min(0).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ChunkStepResult> => {
    const { assertNotBanned } = await import("@/lib/api-guard.server");
    await assertNotBanned(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("mining_jobs")
      .select(SELECT)
      .eq("id", data.jobId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Mining job not found.");

    let job = toJob(row as JobRow);
    const results = storedResults(row as JobRow);

    // Jobs planned with the old 20-minute guess: re-read the real length and
    // add the missing parts. Mined parts stay exactly as they are.
    const lastEnd = job.chunks[job.chunks.length - 1]?.end ?? 0;
    if (job.chunks.length > 0 && Math.abs(lastEnd - 1200) < 1) {
      const vid = /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/.exec(job.sourceUrl ?? "")?.[1];
      if (vid) {
        const { fetchVideoMeta } = await import("@/lib/youtube-meta.server");
        const meta = await fetchVideoMeta(vid).catch(() => null);
        if (meta && meta.durationSec > lastEnd + 10) {
          const chunks = splitIntoChunks(meta.durationSec);
          const { error: planErr } = await context.supabase
            .from("mining_jobs")
            .update({ chunks: chunks as never, total_chunks: chunks.length })
            .eq("id", job.id)
            .eq("user_id", context.userId);
          if (!planErr) job = { ...job, chunks, totalChunks: chunks.length };
        }
      }
    }

    // A creator stop/pause wins over any tab still driving the job.
    if (job.status === "stopped" || job.status === "paused_user") {
      return { job, chunk: null, merged: mergeChunkResults(results), done: false };
    }

    if (job.nextIndex >= job.chunks.length) {
      return { job: { ...job, status: "done" }, chunk: null, merged: mergeChunkResults(results), done: true };
    }

    if (data.respectLease && job.status === "running" && Date.now() - new Date(job.updatedAt).getTime() < 3 * 60_000) {
      return { job, chunk: null, merged: null, done: false, busy: true };
    }
    if (job.retryAfter && new Date(job.retryAfter).getTime() > Date.now()) {
      // Still waiting for tokens — no call is made.
      return { job: { ...job, status: "paused_quota" }, chunk: null, merged: null, done: false };
    }

    // Atomic claim: one conditional update, so two tabs/lanes or the
    // background worker can never mine the same part at the same moment.
    let claim = context.supabase
      .from("mining_jobs")
      .update({ status: "running" })
      .eq("id", job.id)
      .eq("user_id", context.userId);
    if (data.respectLease) {
      const leaseIso = new Date(Date.now() - 3 * 60_000).toISOString();
      claim = claim.or(`status.neq.running,updated_at.lt.${leaseIso}`);
    }
    const { data: claimed } = await claim.select("id");
    if (data.respectLease && !claimed?.length) {
      return { job, chunk: null, merged: null, done: false, busy: true };
    }

    const chunk = job.chunks[job.nextIndex]!;
    if (job.personaId && !job.assessment.speakerIdentity?.trim()) {
      const { data: persona } = await context.supabase.from("creator_personas").select("name").eq("id", job.personaId).maybeSingle();
      const { withOwnerIdentity } = await import("@/lib/mining-jobs");
      job = { ...job, assessment: withOwnerIdentity(job.assessment, persona?.name) };
    }
    const { analyzeYoutubeVideo, tryTranscriptMine } = await import("@/lib/youtube-mine.server");
    const usage = {
      userId: context.userId,
      videoLabel: job.sourceLabel,
      videoId: job.sourceUrl,
      jobId: job.id,
    };

    try {
      // Reading the subtitles needs no video model, so a talking video never
      // has to own a Gemini key just to be mined.
      const fast = await tryTranscriptMine({
        url: job.sourceUrl,
        startSec: chunk.start,
        endSec: chunk.end,
        assessment: job.assessment,
        usage,
      });
      const { runGeminiRoleWithFallback } = await import("@/lib/user-ai.server");
      const { value: mined, key } = fast
        ? { value: fast, key: { apiKey: "" } }
        : await runGeminiRoleWithFallback(context.userId, "mine", (credential) =>
            analyzeYoutubeVideo({
              url: job.sourceUrl,
              startSec: chunk.start,
              endSec: chunk.end,
              assessment: job.assessment,
              credential,
              usage,
            }),
            data.lane,
          );
      const nextResults = [...results, { ...mined, window: { start: chunk.start, end: chunk.end } }];
      const nextIndex = job.nextIndex + 1;
      const status: MiningJobStatus = nextIndex >= job.chunks.length ? "done" : "running";
      const { data: savedRow, error: upErr } = await context.supabase
        .from("mining_jobs")
        .update({
          results: nextResults as never,
          next_index: nextIndex,
          status,
          last_error: null,
          retry_after: null,
          // Subtitle reading uses no video key, so the stored one is left as is.
          ...(key.apiKey ? { ai_credential: key.apiKey } : {}),
        })
        .eq("id", job.id)
        .eq("user_id", context.userId)
        // Another runner already saved this part: never append it twice.
        .eq("next_index", job.nextIndex)
        .select("id");
      if (upErr) throw new Error(upErr.message);
      if (!savedRow || savedRow.length === 0) {
        const { data: fresh } = await context.supabase.from("mining_jobs").select(SELECT).eq("id", job.id).maybeSingle();
        const fj = fresh ? toJob(fresh as JobRow) : job;
        return { job: fj, chunk: null, merged: mergeChunkResults(fresh ? storedResults(fresh as JobRow) : results), done: fj.status === "done" };
      }

      // Save what is mined so far (or the finished Mind) right away, so a
      // stop never hides mined parts.
      const { finalizeMiningJob } = await import("@/lib/finalize-job.server");
      const { data: full } = await context.supabase.from("mining_jobs").select("*").eq("id", job.id).maybeSingle();
      if (full) {
        await finalizeMiningJob(
          context.supabase,
          // A stale vault link from an earlier pass must never skip saving this one.
          { ...full, vault_id: null } as never,
          status === "done" ? {} : { partial: { done: nextIndex, total: job.totalChunks } },
        ).catch(() => null);
      }

      void context.supabase.from("activity_logs").insert({
        user_id: context.userId,
        event: "mining.chunk",
        detail: `${job.sourceLabel} · chunk ${nextIndex}/${job.totalChunks}`,
        tokens: mined.transcript.length + mined.knowledgeNodes.length,
      } as never);

      return {
        job: { ...job, nextIndex, status },
        chunk: mined,
        merged: mergeChunkResults(nextResults),
        done: status === "done",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const quota = isQuotaMessage(message);
      const status: MiningJobStatus = quota ? "paused_quota" : "error";
      const retryAfter = quota ? quotaRetryAfter(message) : new Date(Date.now() + 10 * 60_000).toISOString();
      await context.supabase
        .from("mining_jobs")
        .update({ status, last_error: message.slice(0, 500), retry_after: retryAfter })
        .eq("id", job.id)
        .eq("user_id", context.userId);
      return {
        job: { ...job, status, lastError: message, retryAfter },
        chunk: null,
        merged: mergeChunkResults(results),
        done: false,
      };
    }
  });

/** "Continue now" — e.g. after adding another key. Owner only. */
export const continueMiningNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("mining_jobs")
      .update({ status: "queued", retry_after: null, last_error: null, attempts: 0 })
      .eq("id", data.jobId)
      .eq("user_id", context.userId)
      .in("status", ["paused_quota", "error", "queued", "abandoned"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** How many mining lanes can run at once: one per healthy Gemini key (max 5). */
export const miningLaneCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const { geminiLaneKeyIds } = await import("@/lib/user-ai.server");
    const ids = await geminiLaneKeyIds(context.userId).catch(() => [] as string[]);
    return Math.max(1, Math.min(5, ids.length));
  });

export const listMiningJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MiningJob[]> => {
    const { data, error } = await context.supabase
      .from("mining_jobs")
      .select(SELECT_LIST)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data as unknown as JobRow[]).map(toJob);
  });

export const getMiningJobResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ChunkResult | null> => {
    const { data: row, error } = await context.supabase
      .from("mining_jobs")
      .select(SELECT)
      .eq("id", data.jobId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return mergeChunkResults(storedResults(row as JobRow));
  });

/**
 * Creator control over a running job. Pause and stop are stored server-side,
 * so the background worker honours them even after the tab is closed.
 */
export const setMiningJobState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ jobId: z.string().uuid(), action: z.enum(["pause", "stop", "resume"]) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ status: MiningJobStatus }> => {
    const status: MiningJobStatus =
      data.action === "pause" ? "paused_user" : data.action === "stop" ? "stopped" : "queued";
    const { error } = await context.supabase
      .from("mining_jobs")
      .update({ status, retry_after: null, last_error: null })
      .eq("id", data.jobId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { status };
  });

/**
 * Clears finished / stopped / failed mining cards. Live work is never touched,
 * and the mined Minds themselves stay in the vault — only the history rows go.
 */
export const clearMiningHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ removed: number }> => {
    const { data, error } = await context.supabase
      .from("mining_jobs")
      .delete()
      .eq("user_id", context.userId)
      .in("status", ["done", "stopped", "error", "abandoned"])
      .select("id");
    if (error) throw new Error(error.message);
    return { removed: (data ?? []).length };
  });

/** Records the Mind vault a finished job was written into (prevents double saves). */
export const attachMiningJobVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid(), vaultId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("mining_jobs")
      .update({ vault_id: data.vaultId, status: "done" })
      .eq("id", data.jobId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
