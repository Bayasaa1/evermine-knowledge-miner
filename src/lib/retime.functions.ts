import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyzeTiming, findMineProblems, type MineProblem, type PartPlan, type TimingHealth, type TranscriptLine } from "@/lib/subtitle-health";
import { repairTimingsLocal } from "@/lib/repair-timings";
import { relistenTranscript } from "@/lib/retime.server";

export type SubtitleHealthRow = {
  contentId: string;
  title: string;
  youtubeId: string;
  sourceUrl: string;
  updatedAt: string;
  /** Persona this video is filed under; null when it was never filed. */
  personaId: string | null;
  /** Concrete problems, each pinned to the mined part it came from. */
  problems: MineProblem[];
  /** True when a mining record exists, so the Gemini fix can re-mine parts. */
  canRemine: boolean;
} & TimingHealth;

type JobLite = { id: string; source_url: string; chunks: unknown; next_index: number };

function videoIdOf(url: string): string {
  return /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/.exec(url ?? "")?.[1] ?? "";
}

function planOf(job: JobLite | undefined): PartPlan[] {
  return (Array.isArray(job?.chunks) ? (job!.chunks as PartPlan[]) : []).filter(
    (c) => typeof c?.start === "number" && typeof c?.end === "number",
  );
}

function healthOf(transcript: TranscriptLine[], job: JobLite | undefined) {
  const timing = analyzeTiming(transcript);
  const problems = job ? findMineProblems(transcript, planOf(job), job.next_index) : [];
  // A single stray clock used to read as "in sync" while every later caption vanished.
  const status: TimingHealth["status"] = problems.some((p) => p.kind !== "unfinished") && timing.status === "synced" ? "drifting" : timing.status;
  return { ...timing, status, problems, canRemine: Boolean(job) };
}

async function jobsByVideo(context: Ctx): Promise<Map<string, JobLite>> {
  const { data } = await context.supabase
    .from("mining_jobs")
    .select("id, source_url, chunks, next_index, created_at")
    .eq("user_id", context.userId)
    .order("created_at", { ascending: false });
  const map = new Map<string, JobLite>();
  for (const j of (data ?? []) as JobLite[]) {
    const vid = videoIdOf(j.source_url);
    if (vid && !map.has(vid)) map.set(vid, j);
  }
  return map;
}

function lines(value: unknown): TranscriptLine[] {
  return Array.isArray(value) ? (value as TranscriptLine[]) : [];
}

/** Timing report for every mined video the signed-in creator owns. */
export const listSubtitleHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubtitleHealthRow[]> => {
    const { data, error } = await context.supabase
      .from("project_content")
      .select("id, title, youtube_id, source_url, transcript, updated_at, projects(persona_id)")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const jobs = await jobsByVideo(context as unknown as Ctx);

    return (data ?? []).map((row) => {
      const project = (row as unknown as { projects?: { persona_id?: string | null } | null }).projects;
      return {
        contentId: row.id,
        title: row.title,
        youtubeId: row.youtube_id ?? "",
        sourceUrl: row.source_url ?? "",
        updatedAt: row.updated_at,
        personaId: project?.persona_id ?? null,
        ...healthOf(lines(row.transcript), jobs.get(row.youtube_id ?? "")),
      };
    });
  });

async function loadContent(context: Ctx, contentId: string) {
  const { data: row, error } = await context.supabase
    .from("project_content")
    .select("id, title, youtube_id, source_url, transcript, updated_at")
    .eq("id", contentId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("That video is not in your vault.");
  return row;
}

async function saveTimings(context: Ctx, row: any, repaired: TranscriptLine[]): Promise<SubtitleHealthRow> {
  const { error: writeError } = await context.supabase
    .from("project_content")
    .update({ transcript: repaired as never })
    .eq("id", row.id)
    .eq("user_id", context.userId);
  if (writeError) throw new Error(writeError.message);

  await syncVaults(context, row.youtube_id ?? "", row.title, repaired);

  return {
    contentId: row.id,
    title: row.title,
    youtubeId: row.youtube_id ?? "",
    sourceUrl: row.source_url ?? "",
    updatedAt: new Date().toISOString(),
    personaId: row.persona_id ?? null,
    ...healthOf(repaired, (await jobsByVideo(context)).get(row.youtube_id ?? "")),
  };
}

/**
 * Free repair (no AI credits): fills zero-time lines by spreading them across
 * the gaps between timed neighbours, weighted by speech length.
 */
export const repairTimings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SubtitleHealthRow> => {
    const row = await loadContent(context, data.contentId);
    const original = lines(row.transcript);
    if (!original.length) throw new Error("There is no transcript to repair — mine this video first.");
    return saveTimings(context, row, repairTimingsLocal(original));
  });

/**
 * Precise repair (uses AI credits): the video is re-watched once so each
 * already-transcribed line gets its real timestamp. Only the timing layer is
 * touched — the words, story and brain stay untouched.
 */
export const retimeContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ contentId: z.string().uuid(), apiKey: z.string().max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<SubtitleHealthRow> => {
    const row = await loadContent(context, data.contentId);
    const original = lines(row.transcript);
    if (!original.length) throw new Error("There is no transcript to re-time — mine this video first.");

    const url = row.source_url || (row.youtube_id ? `https://www.youtube.com/watch?v=${row.youtube_id}` : "");
    if (!url) throw new Error("This mind has no linked YouTube source to re-watch.");

    const { resolveGeminiCredential } = await import("@/lib/user-ai.server");
    const credential = await resolveGeminiCredential(context.userId, data, "mine");
    const repaired = await relistenTranscript(url, original, credential);
    return saveTimings(context, row, repaired);
  });

type Ctx = { supabase: { from: (t: string) => any }; userId: string };

/** Mirrors repaired timings into every saved mind / version of the same video. */
async function syncVaults(context: Ctx, youtubeId: string, title: string, repaired: TranscriptLine[]) {
  const matches = (payload: any) => {
    const source = payload?.source ?? {};
    const haystack = `${source.url ?? ""} ${source.videoId ?? ""} ${source.label ?? ""}`;
    if (youtubeId && haystack.includes(youtubeId)) return true;
    return String(payload?.title ?? "").trim() === title.trim();
  };

  for (const table of ["mind_vaults", "mind_versions"] as const) {
    const { data: rows } = await context.supabase
      .from(table)
      .select("id, title, payload")
      .eq("user_id", context.userId);
    for (const item of (rows ?? []) as { id: string; title: string; payload: any }[]) {
      const payload = item.payload;
      if (!payload?.result?.transcript) continue;
      if (!matches({ ...payload, title: item.title })) continue;
      const next = { ...payload, result: { ...payload.result, transcript: repaired } };
      await context.supabase.from(table).update({ payload: next }).eq("id", item.id).eq("user_id", context.userId);
    }
  }
}

/** Problems the Gemini fix re-mines; at most this many parts per press so one press always finishes. */
const PARTS_PER_FIX = 3;

/**
 * One-press fix for a badly mined video. The parts the check flagged are mined
 * again with the current miner (captions first, Gemini when there are none),
 * only those parts are replaced, and the video's subtitles and brain are
 * rebuilt from the mining record — which also applies today's clock rules to
 * every untouched part, at no cost.
 */
export const fixMinedVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SubtitleHealthRow & { remined: number; remaining: number }> => {
    const ctx = context as unknown as Ctx;
    const row = await loadContent(ctx, data.contentId);
    const vid = row.youtube_id ?? "";
    const lite = (await jobsByVideo(ctx)).get(vid);
    if (!lite) throw new Error("This video has no mining record to repair from — mine it again from the start.");
    const { data: job, error } = await context.supabase.from("mining_jobs").select("*").eq("id", lite.id).eq("user_id", context.userId).maybeSingle();
    if (error || !job) throw new Error(error?.message ?? "Mining record not found.");

    const plan = planOf(lite);
    const problems = findMineProblems(lines(row.transcript), plan, lite.next_index);
    const parts = [...new Set(problems.filter((p) => p.part >= 0 && p.kind !== "unfinished").map((p) => p.part))].sort((a, b) => a - b);
    const todo = parts.slice(0, PARTS_PER_FIX);

    const results = (Array.isArray(job.results) ? [...(job.results as unknown[])] : []) as Record<string, unknown>[];
    const { unpackInstructions } = await import("@/lib/mining-jobs");
    const meta = unpackInstructions(job.custom_instructions ?? "");
    const assessment = { videoContext: job.video_context ?? undefined, primaryFocus: job.primary_focus ?? undefined, ...meta };
    const { tryTranscriptMine, analyzeYoutubeVideo } = await import("@/lib/youtube-mine.server");
    const { runGeminiRoleWithFallback } = await import("@/lib/user-ai.server");
    const usage = { userId: context.userId, videoLabel: job.source_label ?? row.title, videoId: job.source_url, jobId: job.id };

    let remined = 0;
    for (const index of todo) {
      const part = plan[index];
      if (!part || index >= results.length) continue;
      const fast = await tryTranscriptMine({ url: job.source_url, startSec: part.start, endSec: part.end, assessment, usage });
      const mined = fast
        ? fast
        : (await runGeminiRoleWithFallback(context.userId, "mine", (credential) =>
            analyzeYoutubeVideo({ url: job.source_url, startSec: part.start, endSec: part.end, assessment, credential, usage }),
          )).value;
      results[index] = { ...mined, window: { start: part.start, end: part.end } };
      remined += 1;
    }

    if (remined) {
      const { error: saveErr } = await context.supabase.from("mining_jobs").update({ results: results as never }).eq("id", job.id).eq("user_id", context.userId);
      if (saveErr) throw new Error(saveErr.message);
    }

    const { finalizeMiningJob } = await import("@/lib/finalize-job.server");
    const done = lite.next_index >= plan.length;
    await finalizeMiningJob(
      context.supabase,
      { ...job, results, vault_id: null } as never,
      done ? {} : { partial: { done: lite.next_index, total: plan.length } },
    );

    const fresh = await loadContent(ctx, data.contentId);
    const health = healthOf(lines(fresh.transcript), lite);
    return {
      contentId: fresh.id,
      title: fresh.title,
      youtubeId: fresh.youtube_id ?? "",
      sourceUrl: fresh.source_url ?? "",
      updatedAt: new Date().toISOString(),
      personaId: null,
      ...health,
      remined,
      remaining: Math.max(0, parts.length - todo.length),
    };
  });

/**
 * One press: mine the whole video again from the very first part with the
 * current miner (15-minute parts, journal). Old part results are cleared on the
 * mining record only; the saved subtitles and brain are replaced part by part as
 * the background worker finishes each new part, on the creator's own Gemini key.
 */
export const remineFromScratch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ jobId: string; parts: number }> => {
    const ctx = context as unknown as Ctx;
    const row = await loadContent(ctx, data.contentId);
    const lite = (await jobsByVideo(ctx)).get(row.youtube_id ?? "");
    if (!lite) throw new Error("This video has no mining record — mine it from the + button first.");
    const { fetchVideoMeta } = await import("@/lib/youtube-meta.server");
    const { splitIntoChunks } = await import("@/lib/chunking");
    const meta = await fetchVideoMeta(row.youtube_id ?? "");
    const chunks = splitIntoChunks(meta.durationSec);
    if (!chunks.length) throw new Error("Could not read this video's length from YouTube.");
    const { error } = await context.supabase
      .from("mining_jobs")
      .update({
        chunks: chunks as never,
        total_chunks: chunks.length,
        results: [] as never,
        next_index: 0,
        status: "queued",
        // Cleared so the finished re-mine is saved; finalize reuses the same vault by video link.
        vault_id: null,
        attempts: 0,
        last_error: null,
        retry_after: null,
      })
      .eq("id", lite.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { jobId: lite.id, parts: chunks.length };
  });
