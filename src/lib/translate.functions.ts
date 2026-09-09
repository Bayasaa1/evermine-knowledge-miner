import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
 */
export const translateTexts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }) => {
    // Abuse guard: anonymous callers share a per-IP sliding window so a script
    // cannot drain the shared AI credit balance. Over the limit we return the
    // original text instead of spending credits.
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { rateLimit } = await import("@/lib/api-guard.server");
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    if (rateLimit("translate", ip, 120)) return { texts: data.texts };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { texts: data.texts };

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
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-3.6-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(data.texts) },
          ],
        }),
      });
      if (!res.ok) return { texts: data.texts };
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content ?? "";
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return { texts: data.texts };
      const parsed = JSON.parse(match[0]) as unknown;
      if (!Array.isArray(parsed) || parsed.length !== data.texts.length) return { texts: data.texts };
      const out = parsed.map((v, i) => (typeof v === "string" && v.trim() ? v : data.texts[i]!));
      return { texts: out };
    } catch {
      return { texts: data.texts };
    }
  });
