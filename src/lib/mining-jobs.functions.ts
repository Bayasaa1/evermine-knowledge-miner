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
  last_error: string | null;
  retry_after: string | null;
  updated_at: string;
};

const SELECT =
  "id, source_url, source_label, playlist_id, queue_position, video_context, primary_focus, custom_instructions, chunks, results, next_index, total_chunks, status, last_error, retry_after, updated_at";

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
    const { playlistId, fetchPlaylistVideoIds, fetchVideoMeta } = await import("@/lib/youtube-meta.server");
    const { youtubeId } = await import("@/lib/import-sources");

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

    const rows = [];
    for (let i = 0; i < videoIds.length; i++) {
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
      });
    }

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
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<ChunkStepResult> => {
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

    if (job.nextIndex >= job.chunks.length) {
      return { job: { ...job, status: "done" }, chunk: null, merged: mergeChunkResults(results), done: true };
    }

    const chunk = job.chunks[job.nextIndex]!;
    const { analyzeYoutubeVideo } = await import("@/lib/youtube-mine.server");

    try {
      const mined = await analyzeYoutubeVideo({
        url: job.sourceUrl,
        startSec: chunk.start,
        endSec: chunk.end,
        assessment: job.assessment,
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
