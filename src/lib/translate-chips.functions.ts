import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NAMES = { en: "English", mn: "Mongolian (Cyrillic)", ko: "Korean" } as const;

/** Translates short chat-suggestion chips on the viewer's own translate key. Never drops items. */
export const translateChips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ lang: z.enum(["en", "mn", "ko"]), items: z.array(z.string().max(300)).max(30) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<string[]> => {
    if (!data.items.length) return [];
    const { generateRoleText } = await import("./user-ai.server");
    const { text } = await generateRoleText({
      userId: context.userId,
      role: "translate",
      json: true,
      maxTokens: 2000,
      subjectKind: "other",
      subjectLabel: "chat suggestions",
      system: `Translate each item into natural ${NAMES[data.lang]}. Keep proper names (people, brands, products) as-is. Items already in the target language stay unchanged. Return ONLY a JSON array of strings, same length and order.`,
      prompt: JSON.stringify(data.items),
    });
    const m = text.match(/\[[\s\S]*\]/);
    const arr = m ? (JSON.parse(m[0]) as unknown[]) : [];
    return data.items.map((orig, i) => (typeof arr[i] === "string" && (arr[i] as string).trim() ? (arr[i] as string).trim() : orig));
  });
