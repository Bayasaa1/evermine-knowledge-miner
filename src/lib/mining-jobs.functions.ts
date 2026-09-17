import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { splitIntoChunks, type Chunk } from "@/lib/chunking";
import { mergeChunkResults } from "@/lib/merge-results";
import type { ChunkResult } from "@/lib/gemini";
import { packInstructions, unpackInstructions } from "@/lib/mining-jobs";
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
  results: unknown;
  next_index: number;
  total_chunks: number;
  status: string;
  vault_id: string | null;
  last_error: string | null;
  retry_after: string | null;
  updated_at: string;
};

const SELECT =
  "id, source_url, source_label, playlist_id, queue_position, video_context, primary_focus, custom_instructions, chunks, results, next_index, total_chunks, status, vault_id, last_error, retry_after, updated_at";

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

    // Mining always runs on the creator's own AI key — there is no shared
    // platform credit to fall back to. The key rides along on the job row so
    // the background worker can keep going after the tab closes.
    let ownerKey = (data.apiKey ?? "").trim();
    if (!ownerKey) {
      const { data: savedKeys } = await context.supabase
        .from("user_ai_keys")
        .select("api_key")
        .eq("user_id", context.userId)
        .eq("provider", "gemini")
        .order("updated_at", { ascending: false });
      const rows = savedKeys ?? [];
      // The creator can own several Gemini keys. When they picked one by its
      // last characters, that exact key runs the job; otherwise the key they
      // assigned to mining in the API Manager, else the newest one.
      let tail = (data.apiKeyTail ?? "").trim();
      if (!tail) {
        const { data: role } = await context.supabase
          .from("user_ai_roles")
          .select("provider, key_tail")
          .eq("user_id", context.userId)
          .eq("role", "mine")
          .maybeSingle();
        if (role?.provider === "gemini" && role.key_tail) tail = role.key_tail;
      }
      const chosen = tail ? rows.find((r) => r.api_key.endsWith(tail)) : undefined;
      ownerKey = ((chosen ?? rows[0])?.api_key ?? "").trim();
    }
    if (!ownerKey) {
      throw new Error(
        "Add your free Gemini key in Engines first — mining runs on your own free quota, and it takes a minute to set up.",
      );
    }
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
    z.object({ jobId: z.string().uuid(), apiKey: z.string().max(200).optional() }).parse(input),
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

    const job = toJob(row as JobRow);
    const results = storedResults(row as JobRow);

    // A creator stop/pause wins over any tab still driving the job.
    if (job.status === "stopped" || job.status === "paused_user") {
      return { job, chunk: null, merged: mergeChunkResults(results), done: false };
    }

    if (job.nextIndex >= job.chunks.length) {
      return { job: { ...job, status: "done" }, chunk: null, merged: mergeChunkResults(results), done: true };
    }

    const chunk = job.chunks[job.nextIndex]!;
    const { analyzeYoutubeVideo } = await import("@/lib/youtube-mine.server");

    // The chunk is mined on the creator's own key: the one their tab sent, the
    // one saved on the job, or the one saved on their account.
    const sentKey = (data.apiKey ?? "").trim();
    const { data: credRow } = await context.supabase
      .from("mining_jobs")
      .select("ai_credential")
      .eq("id", data.jobId)
      .maybeSingle();
    const jobKey = ((credRow as { ai_credential?: string | null } | null)?.ai_credential ?? "").trim();
    let accountKey = "";
    if (!sentKey && !jobKey) {
      const { data: savedKey } = await context.supabase
        .from("user_ai_keys")
        .select("api_key")
        .eq("user_id", context.userId)
        .eq("provider", "gemini")
        .order("updated_at", { ascending: false })
        .limit(1);
      accountKey = (savedKey?.[0]?.api_key ?? "").trim();
    }
    const activeKey = sentKey || jobKey || accountKey;
    if (!activeKey) {
      throw new Error(
        "Add your free Gemini key in Engines first — mining runs on your own free quota, and it takes a minute to set up.",
      );
    }

    try {
      const mined = await analyzeYoutubeVideo({
        url: job.sourceUrl,
        startSec: chunk.start,
        endSec: chunk.end,
        assessment: job.assessment,
        credential: { kind: "gemini_key", value: activeKey },
        usage: { userId: context.userId, videoLabel: job.sourceLabel, videoId: job.sourceUrl, jobId: job.id },
      });
      const nextResults = [...results, mined];
      const nextIndex = job.nextIndex + 1;
      const status: MiningJobStatus = nextIndex >= job.chunks.length ? "done" : "running";
      const { error: upErr } = await context.supabase
        .from("mining_jobs")
        .update({
          results: nextResults as never,
          next_index: nextIndex,
          status,
          last_error: null,
          retry_after: null,
        })
        .eq("id", job.id)
        .eq("user_id", context.userId);
      if (upErr) throw new Error(upErr.message);

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
      const quota = /quota|rate limit|429|too many requests|resource_exhausted/i.test(message);
      const status: MiningJobStatus = quota ? "paused_quota" : "error";
      const retryAfter = quota ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
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

export const listMiningJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MiningJob[]> => {
    const { data, error } = await context.supabase
      .from("mining_jobs")
      .select(SELECT)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data as JobRow[]).map(toJob);
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
      .in("status", ["done", "stopped", "error"])
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
