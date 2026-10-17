import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { JournalReview } from "@/lib/journal-review.server";

/** Reads the owner's proof-reading flags for one video. Never changes subtitles. */
export const getJournalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { contentId: string }) => ({ contentId: String(d.contentId) }))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("mind_vaults").select("payload")
      .eq("user_id", context.userId).eq("kind", "review").eq("title", `review:${data.contentId}`)
      .maybeSingle();
    return (row?.payload ?? null) as unknown as JournalReview | null;
  });
