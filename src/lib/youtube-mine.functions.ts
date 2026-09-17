import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyzeYoutubeVideo } from "@/lib/youtube-mine.server";
import type { ChunkResult } from "@/lib/gemini";

const inputSchema = z.object({
  url: z.string().min(1).max(2_048),
  startSec: z.number().min(0).max(7_200),
  endSec: z.number().min(1).max(7_200),
  /** The creator's own Gemini key from their device vault. */
  apiKey: z.string().max(200).optional(),
});

export const mineYoutubeVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<ChunkResult> => {
    const { resolveGeminiCredential } = await import("@/lib/user-ai.server");
    const credential = await resolveGeminiCredential(context.userId, data, "mine");
    return analyzeYoutubeVideo({ ...data, credential });
  });
