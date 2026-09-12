import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/languages";

/**
 * Video-call eyes.
 *
 * During a video call the browser sends one still from the caller's camera
 * every few seconds. The Mind reads mood, gestures and setting so it can react
 * like a person on a call would ("you look tired", "nice setup"). Frames are
 * analysed in memory and never stored anywhere.
 */
export const Route = createFileRoute("/api/mind-vision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await guardApi(request, "mind-vision", 20);
        if (auth instanceof Response) return auth;

        let body: { image?: string; name?: string; lang?: string; apiKey?: string; googleToken?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        const image = typeof body.image === "string" ? body.image : "";
        if (!image.startsWith("data:image/jpeg;base64,") || image.length > 1_200_000) {
          return new Response(JSON.stringify({ error: "A camera frame is required." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const lang: LangCode = isLangCode(body.lang) ? body.lang : "en";
        const name = (body.name ?? "this person").slice(0, 80);

        const { resolveGeminiCredential, geminiGenerate, aiErrorResponse } = await import(
          "@/lib/user-ai.server"
        );
        try {
          const credential = await resolveGeminiCredential(auth.userId, body);
          const seen = await geminiGenerate({
            credential,
            model: "gemini-2.5-flash",
            maxTokens: 256,
            system: [
              `You are the eyes of ${name} during a live video call.`,
              `Describe ONLY what is worth reacting to: the caller's mood, energy, gestures, what they are holding or showing, and the room around them.`,
              `Two short sentences maximum, written in ${LANGUAGES[lang].name}. No speculation about identity, age, ethnicity or health.`,
              `If nothing changed or the frame is unusable, answer exactly: NOTHING`,
            ].join("\n"),
            turns: [
              {
                role: "user",
                parts: [
                  { text: "What do you see right now?" },
                  { inline_data: { mime_type: "image/jpeg", data: image.split(",", 2)[1] ?? "" } },
                ],
              },
            ],
          });
          return new Response(JSON.stringify({ seen: seen.trim() === "NOTHING" ? "" : seen.trim() }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          return aiErrorResponse(err);
        }
      },
    },
  },
});
