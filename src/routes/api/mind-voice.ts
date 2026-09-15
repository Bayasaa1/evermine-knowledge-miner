import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";
import { findMind } from "@/lib/minds";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/languages";
import { getPublicProjectMind } from "@/lib/project-mind.server";
import { getLiveClone } from "@/lib/persona-clone.server";


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
          /** The persona's real cloned voice, when one has been built. */
          voiceId?: string;

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

        // ── Real voice clone ────────────────────────────────────────────────
        // When the persona owner has built a clone from their own mined speech,
        // the reply is spoken in THEIR voice — same timbre in every language.
        // Streams as PCM so playback and lip-sync start on the first chunk.
        // The listener's own voice key, when they added one. No platform key.
        const { resolveVoiceKey } = await import("@/lib/user-ai.server");
        const cloneKey = await resolveVoiceKey(auth.userId);
        // Resolved server-side from the persona: listeners never see clone ids.
        const liveVoice = body.mindId ? await getLiveClone(body.mindId, "voice") : null;
        const voiceId = liveVoice?.remoteId ?? "";
        if (cloneKey && liveVoice?.engine === "elevenlabs" && /^[A-Za-z0-9_-]{8,}$/.test(voiceId)) {

          try {
            const cloned = await fetch(
              `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000`,
              {
                method: "POST",
                headers: { "xi-api-key": cloneKey, "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: text.slice(0, 4000),
                  // Multilingual so the same cloned voice can answer in Mongolian,
                  // Korean or English without losing the speaker's timbre.
                  model_id: "eleven_turbo_v2_5",
                  voice_settings: {
                    stability: Math.max(0.2, 0.55 - intensity * 0.25),
                    similarity_boost: 0.85,
                    style: Math.min(0.8, intensity * 0.6),
                    use_speaker_boost: true,
                    speed,
                  },
                }),
              },
            );
            if (cloned.ok && cloned.body) {
              // Re-emit as the same SSE shape the player already understands.
              const reader = cloned.body.getReader();
              const encoder = new TextEncoder();
              const stream = new ReadableStream<Uint8Array>({
                async pull(controller) {
                  const { done, value } = await reader.read();
                  if (done) {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                    return;
                  }
                  let binary = "";
                  for (let i = 0; i < value.length; i++) binary += String.fromCharCode(value[i]!);
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "speech.audio.delta", audio: btoa(binary) })}\n\n`,
                    ),
                  );
                },
                cancel: () => void reader.cancel(),
              });
              return new Response(stream, {
                headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
              });
            }
            console.error("mind-voice clone error", cloned.status, (await cloned.text().catch(() => "")).slice(0, 300));
          } catch (e) {
            console.error("mind-voice clone unreachable", e);
          }
          // Any clone failure falls through to the stand-in voice below, so a
          // call never goes silent.
        }

        // No shared platform voice: when the owner has not built a real voice
        // clone (or the clone service is not configured), the client speaks
        // the reply with the device's own speech voice instead. The `no_clone`
        // code tells the player to take that free local path.
        void vp;
        void language;
        void speed;
        return new Response(
          JSON.stringify({
            error: "No cloned voice is built for this mind yet — using the device voice instead.",
            code: "no_clone",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
