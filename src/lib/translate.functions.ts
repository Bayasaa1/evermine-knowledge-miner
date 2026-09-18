import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  texts: z.array(z.string().max(4000)).min(1).max(60),
  target: z.string().min(2).max(8),
  targetName: z.string().min(2).max(40),
  /** Optional hint so the model keeps product terminology consistent. */
  domain: z.string().max(200).optional(),
});

/**
 * Display-layer translation. The Core Brain JSON stays English in the database;
 * this only renders English source strings into the viewer's active language.
 *
 * Translation runs on the viewer's selected account AI key. Without one, the original text
 * comes back with `blocked: "no_key"` so the app can say why instead of
 * silently showing untranslated strings.
 */
export const translateTexts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(
    async ({ data, context }): Promise<{ texts: string[]; blocked?: "no_key" | "quota"; retry?: boolean; failed?: string; via?: "key"; provider?: string; tail?: string }> => {
    // Abuse guard for repeated translation requests.
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { rateLimit } = await import("@/lib/api-guard.server");
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (rateLimit("translate", ip, 120)) return { texts: data.texts, retry: true };

    const system = [
      `You are a UI and subtitle localisation engine for Evermind, a video-mining AI platform.`,
      `Each input string may be in ANY language (English, Mongolian, Korean, Japanese, …).`,
      `Translate every string into ${data.targetName}, whatever its source language is.`,
      `If a string is already in ${data.targetName}, return it unchanged.`,
      data.domain ? `Context: ${data.domain}.` : "",
      `Rules: keep the meaning and tone; keep product names (Evermind, YouTube, Gemini, JSON, Mind Vault) untranslated;`,
      `keep numbers, timestamps, URLs, emoji and placeholder tokens such as {n} exactly as they are;`,
      `never add explanations. Reply with ONLY a JSON array of translated strings, same length and order as the input array.`,
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const { generateRoleText } = await import("@/lib/user-ai.server");
      const result = await generateRoleText({
          userId: context.userId,
          role: "translate",
          system,
          json: true,
          maxTokens: 4096,
          prompt: JSON.stringify(data.texts),
          subjectKind: "other",
          subjectLabel: `Translating into ${data.targetName}`,
      });
      const raw = result.text;
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) {
        console.error("translate unparsable reply", raw.slice(0, 300));
        return { texts: data.texts };
      }
      const parsed = JSON.parse(match[0]) as unknown;
      if (!Array.isArray(parsed) || parsed.length !== data.texts.length) return { texts: data.texts };
      const out = parsed.map((v, i) => (typeof v === "string" && v.trim() ? v : data.texts[i]!));
       return { texts: out, provider: result.provider, tail: result.tail };
    } catch (err) {
      const { UserAiError } = await import("@/lib/user-ai.server");
      if (err instanceof UserAiError) {
        // A per-minute burst is transient: return the originals quietly and let
        // the client re-queue the strings for the next batch instead of
        // scaring the viewer with a quota warning.
         if (err.code === "rate_minute") return { texts: data.texts, retry: true };
        if (err.code === "quota")
          return { texts: data.texts, blocked: "quota" as const, via: "key" as const };
        return { texts: data.texts, blocked: "no_key" as const };
      }
       return { texts: data.texts, failed: err instanceof Error ? err.message.slice(0, 180) : "Translation failed." };
    }
  },
  );
