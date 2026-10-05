import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Subtitles the creator supplies themselves for one YouTube video. Stored as a
 * private "captions" vault row (title = YouTube id). When present, the miner
 * reads these instead of asking YouTube, so blocked or missing captions never
 * stop a long video from being mined correctly.
 */
const cueSchema = z.object({ start: z.number().min(0), end: z.number().min(0), text: z.string().min(1).max(2000) });

export const saveUserCaptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ youtubeId: z.string().regex(/^[A-Za-z0-9_-]{6,20}$/), cues: z.array(cueSchema).min(3).max(40000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("mind_vaults")
      .select("id")
      .eq("user_id", context.userId)
      .eq("kind", "captions")
      .eq("title", data.youtubeId)
      .maybeSingle();
    const payload = { youtubeId: data.youtubeId, cues: data.cues };
    const res = existing
      ? await context.supabase.from("mind_vaults").update({ payload }).eq("id", existing.id)
      : await context.supabase.from("mind_vaults").insert({ user_id: context.userId, kind: "captions", title: data.youtubeId, payload });
    if (res.error) throw new Error(res.error.message);
    return { lines: data.cues.length };
  });

export const getUserCaptionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ youtubeId: z.string().max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("mind_vaults")
      .select("payload")
      .eq("user_id", context.userId)
      .eq("kind", "captions")
      .eq("title", data.youtubeId)
      .maybeSingle();
    const cues = ((row?.payload ?? {}) as { cues?: unknown[] }).cues;
    return { lines: Array.isArray(cues) ? cues.length : 0 };
  });
