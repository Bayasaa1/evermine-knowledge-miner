import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";
import { findMind } from "@/lib/minds";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/languages";
import { getPublicProjectMind } from "@/lib/project-mind.server";

/**
 * Native voice dubbing: speaks the reply in the listener's own language using the
 * Primary Owner's cloned voice model (timbre + accent + emotion captured in the
 * Mind Vault's Voice Sample Data). Streams raw PCM over SSE so the client can
 * play it and drive lip-sync from the live waveform.
 */
export const Route = createFileRoute("/api/mind-voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Paid AI call: signed-in users only, with a per-user request budget.
        const auth = await guardApi(request, "mind-voice", 30);
        if (auth instanceof Response) return auth;
        let body: {
          mindId?: string;
          text?: string;
          lang?: string;
          emotion?: {
            primary_emotion?: string;
            expression_intensity?: number;
            facial_trigger?: string;
            vocal_tone_marker?: string;
          };
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        const mind = body.mindId ? findMind(body.mindId) : null;
        const projectMind = !mind && body.mindId ? await getPublicProjectMind(body.mindId) : null;
        const text = (body.text ?? "").trim();
        if (!mind && !projectMind) return new Response(JSON.stringify({ error: "Unknown mind" }), { status: 400 });
        if (!text) return new Response(JSON.stringify({ error: "No text" }), { status: 400 });

        const lang: LangCode = isLangCode(body.lang) ? body.lang : "en";
        const language = LANGUAGES[lang];
        const vp = mind?.voiceProfile ?? {
          voice: "alloy",
          timbre: "Natural, warm, conversational",
          accent: "Preserve the source creator's language and phrasing",
          emotion: "Responsive and authentic",
          pace: "Natural",
          speed: 1,
        };

        // Dynamic emotion drives pitch, pace and delivery on top of the cloned voice.
        const allowed = ["HAPPY", "EXCITED", "SERIOUS", "SAD", "EMPATHETIC", "NEUTRAL"] as const;
        const raw = String(body.emotion?.primary_emotion ?? "").toUpperCase();
        const primary = (allowed as readonly string[]).includes(raw) ? raw : "NEUTRAL";
        const intensity = Math.min(
          1,
          Math.max(0, typeof body.emotion?.expression_intensity === "number" ? body.emotion.expression_intensity : 0),
        );
        const clean = (s: unknown) =>
          typeof s === "string" ? s.replace(/[^A-Za-z_ -]/g, "").slice(0, 40) : "";
        const facial = clean(body.emotion?.facial_trigger) || "Neutral_Face";
        const vocal = clean(body.emotion?.vocal_tone_marker) || "Flat_Even";
        const delivery: Record<string, string> = {
          HAPPY: "Lift the pitch slightly and let a warm smile colour the voice.",
          EXCITED: "Raise the pitch and energy, speak faster and with clear enthusiasm.",
          SERIOUS: "Lower the pitch, steady and measured, with no smile in the voice.",
          SAD: "Lower and soften the pitch, slower and quieter, with gentle heaviness.",
          EMPATHETIC: "Soften and warm the voice, slower and caring, as if comforting someone.",
          NEUTRAL: "Keep an even, natural delivery.",
        };
        const speedDelta: Record<string, number> = {
          HAPPY: 0.06,
          EXCITED: 0.12,
          SERIOUS: -0.04,
          SAD: -0.1,
          EMPATHETIC: -0.06,
          NEUTRAL: 0,
        };
        const speed = Math.min(
          1.4,
          Math.max(0.6, (vp.speed ?? 1) + (speedDelta[primary] ?? 0) * intensity),
        );

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "Voice is not configured" }), { status: 500 });
        }

        const instructions = [
          `You are performing the AI Mind voice of ${mind?.name ?? projectMind?.name ?? "this creator"}.`,
          `Timbre and delivery: ${vp.timbre}`,
          `Accent characteristics to preserve: ${vp.accent}`,
          `Emotional signature: ${vp.emotion}`,
          `Pace: ${vp.pace}`,
          `ACTIVE EMOTION for this line: ${primary} (intensity ${intensity.toFixed(2)}, facial cue ${facial}, vocal marker ${vocal}). ${delivery[primary]}`,
          `Blend that emotion into the speaker's own voice — never replace their timbre or accent with a generic performance.`,
          `Speak fluent, natural ${language.name} (${language.native}) as a native speaker would — correct pronunciation and prosody for that language — while keeping the speaker's own timbre, accent colour and emotion completely unchanged.`,
          `This is dubbing, not narration: it must sound like this same person genuinely speaking ${language.name}. Never add commentary, translation notes or subtitles.`,
        ].join("\n");

        let res: Response;
        try {
          res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "openai/gpt-4o-mini-tts",
              input: text.slice(0, 4000),
              voice: vp.voice,
              instructions,
              speed,
              stream_format: "sse",
              response_format: "pcm",
            }),
          });
        } catch {
          return new Response(JSON.stringify({ error: "Could not reach the voice service" }), {
            status: 502,
          });
        }

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          console.error("mind-voice gateway error", res.status, detail.slice(0, 500));
          const message =
            res.status === 429
              ? "Voice dubbing is rate limited — try again in a moment."
              : res.status === 402
                ? "AI credits are exhausted for this workspace."
                : res.status === 403
                  ? "AI access is blocked for this workspace."
                  : `Voice dubbing failed (${res.status}).`;
          return new Response(JSON.stringify({ error: message }), { status: res.status });
        }

        return new Response(res.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
