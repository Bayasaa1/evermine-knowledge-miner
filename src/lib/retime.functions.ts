import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyzeTiming, type TimingHealth, type TranscriptLine } from "@/lib/subtitle-health";
import { repairTimingsLocal } from "@/lib/repair-timings";
import { relistenTranscript } from "@/lib/retime.server";

export type SubtitleHealthRow = {
  contentId: string;
  title: string;
  youtubeId: string;
  sourceUrl: string;
  updatedAt: string;
} & TimingHealth;

function lines(value: unknown): TranscriptLine[] {
  return Array.isArray(value) ? (value as TranscriptLine[]) : [];
}

/** Timing report for every mined video the signed-in creator owns. */
export const listSubtitleHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubtitleHealthRow[]> => {
    const { data, error } = await context.supabase
      .from("project_content")
      .select("id, title, youtube_id, source_url, transcript, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => ({
      contentId: row.id,
      title: row.title,
      youtubeId: row.youtube_id ?? "",
      sourceUrl: row.source_url ?? "",
      updatedAt: row.updated_at,
      ...analyzeTiming(lines(row.transcript)),
    }));
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
    ...analyzeTiming(repaired),
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
  .inputValidator((input) => z.object({ contentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<SubtitleHealthRow> => {
    const row = await loadContent(context, data.contentId);
    const original = lines(row.transcript);
    if (!original.length) throw new Error("There is no transcript to re-time — mine this video first.");

    const url = row.source_url || (row.youtube_id ? `https://www.youtube.com/watch?v=${row.youtube_id}` : "");
    if (!url) throw new Error("This mind has no linked YouTube source to re-watch.");

    const repaired = await relistenTranscript(url, original);
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
