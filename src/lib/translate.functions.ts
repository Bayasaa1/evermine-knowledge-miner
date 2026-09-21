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
    async ({ data, context }): Promise<{
      texts: string[];
      blocked?: "no_key" | "quota";
      retry?: boolean;
      failed?: string;
      via?: "key";
      provider?: string;
      tail?: string;
      untranslated?: number[];
      /** The engine the user picked, when another one had to answer instead. */
      skipped?: { provider: string; tail: string; reason: string; until: string | null };
    }> => {
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
      let provider: string | undefined;
      let tail: string | undefined;
      let skipped: { provider: string; tail: string; reason: string; until: string | null } | undefined;

      /**
       * Translates one batch. A reply that comes back cut in half (the engine
       * ran out of room) or in the wrong shape is not usable, so the batch is
       * halved and tried again. Whatever half DID come back is kept: a part
       * that fails no longer throws away the lines that succeeded.
       */
      // Hard ceiling on how many engine calls one request may cost, so a badly
      // behaved engine can never quietly burn a page's worth of quota.
      let calls = 0;
      const MAX_CALLS = 6;
      const blank = (texts: string[]) => texts.map(() => "");

      const run = async (texts: string[], depth = 0): Promise<string[]> => {
        if (calls >= MAX_CALLS) return blank(texts);
        calls += 1;
        const result = await generateRoleText({
          userId: context.userId,
          role: "translate",
          system,
          json: true,
          // Translated text is longer than the source, but a huge budget also
          // invites huge (and expensive) replies. Keep it proportional.
          maxTokens: 6144,
          prompt: JSON.stringify(texts),
          subjectKind: "other",
          subjectLabel: `Translating into ${data.targetName}`,
        });
        provider = result.provider;
        tail = result.tail;
        if (result.skippedAssigned) skipped = result.skippedAssigned;
        const match = result.text.match(/\[[\s\S]*\]/);
        let parsed: unknown = null;
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {
            parsed = null;
          }
        }
        if (Array.isArray(parsed) && parsed.length === texts.length) {
          return parsed.map((v) => (typeof v === "string" && v.trim() ? v : ""));
        }
        // One split only: a reply that is cut in half usually succeeds on a
        // smaller batch, but deeper splitting just multiplies the cost.
        if (texts.length === 1 || depth >= 1) {
          console.error("translate unparsable reply", result.text.slice(0, 300));
          return blank(texts);
        }
        const mid = Math.ceil(texts.length / 2);
        const left = await run(texts.slice(0, mid), depth + 1);
        const right = await run(texts.slice(mid), depth + 1);
        return [...left, ...right];
      };

      const translated = await run(data.texts);

      // Track which items came back empty so the client does not cache the
      // untouched source string for them.
      const untranslated: number[] = [];
      const out = translated.map((v, i) => {
        if (v) return v;
        untranslated.push(i);
        return data.texts[i]!;
      });
      // Nothing usable at all: ask the client to try again rather than
      // pretending the original text is a translation.
      if (untranslated.length === data.texts.length) {
        return {
          texts: data.texts,
          retry: true,
          ...(provider ? { provider } : {}),
          ...(tail ? { tail } : {}),
          ...(skipped ? { skipped } : {}),
        };
      }
      return {
        texts: out,
        ...(provider ? { provider } : {}),
        ...(tail ? { tail } : {}),
        ...(skipped ? { skipped } : {}),
        untranslated,
      };
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
