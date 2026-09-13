import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  texts: z.array(z.string().max(4000)).min(1).max(60),
  target: z.string().min(2).max(8),
  targetName: z.string().min(2).max(40),
  /** Optional hint so the model keeps product terminology consistent. */
  domain: z.string().max(200).optional(),
  /** The viewer's own Gemini key (from their device vault) or Google token. */
  apiKey: z.string().max(200).optional(),
  googleToken: z.string().max(4096).optional(),
});

/**
 * Display-layer translation. The Core Brain JSON stays English in the database;
 * this only renders English source strings into the viewer's active language.
 *
 * Translation runs on the viewer's OWN free Gemini access — a key from their
 * device vault or their Google sign-in token. With neither, the original text
 * comes back with `blocked: "no_key"` so the app can say why instead of
 * silently showing untranslated strings.
 */
export const translateTexts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(
    async ({ data }): Promise<{ texts: string[]; blocked?: "no_key" | "quota"; via?: "key" | "google" }> => {
    // Abuse guard: anonymous callers share a per-IP sliding window.
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { rateLimit } = await import("@/lib/api-guard.server");
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (rateLimit("translate", ip, 120)) return { texts: data.texts };

    const apiKey = (data.apiKey ?? "").trim();
    const googleToken = (data.googleToken ?? "").trim();
    if (!apiKey && !googleToken) return { texts: data.texts, blocked: "no_key" as const };

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
      const { geminiGenerate, withMinuteRetry } = await import("@/lib/user-ai.server");
      const credential = apiKey
        ? ({ kind: "gemini_key", value: apiKey } as const)
        : ({ kind: "google_token", value: googleToken } as const);
      const raw = await withMinuteRetry(() =>
        geminiGenerate({
          credential,
          model: "gemini-2.5-flash",
          system,
          maxTokens: 8192,
          turns: [{ role: "user", parts: [{ text: JSON.stringify(data.texts) }] }],
        }),
      );
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) {
        console.error("translate unparsable reply", raw.slice(0, 300));
        return { texts: data.texts };
      }
      const parsed = JSON.parse(match[0]) as unknown;
      if (!Array.isArray(parsed) || parsed.length !== data.texts.length) return { texts: data.texts };
      const out = parsed.map((v, i) => (typeof v === "string" && v.trim() ? v : data.texts[i]!));
      return { texts: out };
    } catch (err) {
      const { UserAiError } = await import("@/lib/user-ai.server");
      if (err instanceof UserAiError) {
        // A per-minute burst is transient: return the originals quietly and let
        // the client re-queue the strings for the next batch instead of
        // scaring the viewer with a quota warning.
        if (err.code === "rate_minute") return { texts: data.texts };
        if (err.code === "quota")
          return { texts: data.texts, blocked: "quota" as const, via: apiKey ? ("key" as const) : ("google" as const) };
        return { texts: data.texts, blocked: "no_key" as const };
      }
      return { texts: data.texts };
    }
  },
  );
