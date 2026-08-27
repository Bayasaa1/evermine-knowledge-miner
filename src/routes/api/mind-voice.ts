import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";
import { findMind } from "@/lib/minds";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/languages";

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
        let body: { mindId?: string; text?: string; lang?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        const mind = body.mindId ? findMind(body.mindId) : null;
        const text = (body.text ?? "").trim();
        if (!mind) return new Response(JSON.stringify({ error: "Unknown mind" }), { status: 400 });
        if (!text) return new Response(JSON.stringify({ error: "No text" }), { status: 400 });

        const lang: LangCode = isLangCode(body.lang) ? body.lang : "en";
        const language = LANGUAGES[lang];
        const vp = mind.voiceProfile;

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "Voice is not configured" }), { status: 500 });
        }

        const instructions = [
          `You are performing the cloned voice model of ${mind.name}, rebuilt from their Voice Sample Data.`,
          `Timbre and delivery: ${vp.timbre}`,
          `Accent characteristics to preserve: ${vp.accent}`,
          `Emotional signature: ${vp.emotion}`,
          `Pace: ${vp.pace}`,
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
              speed: vp.speed ?? 1,
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
