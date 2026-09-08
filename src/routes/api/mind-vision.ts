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

        let body: { image?: string; name?: string; lang?: string };
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

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "Vision is not configured" }), { status: 500 });
        }

        const lang: LangCode = isLangCode(body.lang) ? body.lang : "en";
        const name = (body.name ?? "this person").slice(0, 80);

        let res: Response;
        try {
          res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": apiKey,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: "google/gemini-3.8-flash",
              messages: [
                {
                  role: "system",
                  content: [
                    `You are the eyes of ${name} during a live video call.`,
                    `Describe ONLY what is worth reacting to: the caller's mood, energy, gestures, what they are holding or showing, and the room around them.`,
                    `Two short sentences maximum, written in ${LANGUAGES[lang].name}. No speculation about identity, age, ethnicity or health.`,
                    `If nothing changed or the frame is unusable, answer exactly: NOTHING`,
                  ].join("\n"),
                },
                {
                  role: "user",
                  content: [
                    { type: "text", text: "What do you see right now?" },
                    { type: "image_url", image_url: { url: image } },
                  ],
                },
              ],
            }),
          });
        } catch {
          return new Response(JSON.stringify({ error: "Could not reach the vision service" }), { status: 502 });
        }

        if (!res.ok) {
          const detail = (await res.text().catch(() => "")).slice(0, 300);
          console.error("mind-vision gateway error", res.status, detail);
          return new Response(JSON.stringify({ error: `Vision failed (${res.status}).` }), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          });
        }

        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const seen = (data.choices?.[0]?.message?.content ?? "").trim();
        return new Response(JSON.stringify({ seen: seen === "NOTHING" ? "" : seen }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
