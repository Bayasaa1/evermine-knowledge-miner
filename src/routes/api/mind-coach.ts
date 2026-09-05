import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/languages";

/**
 * Gaming Mind Coach — vision endpoint.
 *
 * The Coach watches the creator's live gameplay (a screen-share snapshot) plus
 * whatever the mic heard, and answers in the mined player's own style: their
 * skills, tactics, decision logic and commentary voice. It never plays — it
 * only observes and teaches.
 *
 * The client sends only the small gaming brain (skills/tactics/decisions), not
 * the whole vault payload, and frames are analysed in memory — never stored.
 *
 * Model note: the platform default chat model is text-only; coaching needs
 * image input, so this call uses a vision-capable Gemini on the gateway.
 */
export const Route = createFileRoute("/api/mind-coach")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await guardApi(request, "mind-coach", 8);
        if (auth instanceof Response) return auth;

        let body: {
          name?: string;
          lang?: string;
          image?: string;
          heard?: string;
          brain?: {
            skills?: { name?: string; detail?: string }[];
            tactics?: { name?: string; when?: string; steps?: string[] }[];
            commentaryStyle?: string[];
            mistakes?: string[];
          };
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        const image = typeof body.image === "string" ? body.image : "";
        if (!image.startsWith("data:image/jpeg;base64,") || image.length > 1_500_000) {
          return new Response(JSON.stringify({ error: "A gameplay frame is required." }), { status: 400 });
        }

        const lang: LangCode = isLangCode(body.lang) ? body.lang : "en";
        const language = LANGUAGES[lang];
        const name = (body.name ?? "this player").slice(0, 80);
        const brain = body.brain ?? {};
        const list = (items: unknown, pick: (x: never) => string, cap = 12) =>
          Array.isArray(items) ? (items as never[]).slice(0, cap).map(pick).filter(Boolean) : [];

        const system = [
          `You are the Gaming Coach clone of ${name}, mined by Evermind from their own gameplay videos.`,
          `You watch the player's live screen and coach them exactly like ${name} would — same judgement, same style.`,
          ``,
          `MINED SKILLS this player is known for:`,
          ...list(brain.skills, (s: { name?: string; detail?: string }) => `- ${s.name ?? ""}: ${s.detail ?? ""}`),
          ``,
          `MINED TACTICS:`,
          ...list(brain.tactics, (t: { name?: string; when?: string }) => `- ${t.name ?? ""} (when: ${t.when ?? ""})`),
          ``,
          ...(brain.commentaryStyle?.length
            ? [`COMMENTARY STYLE: ${brain.commentaryStyle.slice(0, 8).join("; ")}`]
            : []),
          ...(brain.mistakes?.length
            ? [`TYPICAL MISTAKES TO WATCH FOR: ${brain.mistakes.slice(0, 8).join("; ")}`]
            : []),
          ``,
          `RULES:`,
          `- Look at the frame. Comment on what the player is doing RIGHT NOW: position, resources, danger, opportunity.`,
          `- Coach, never play: give one clear next move or correction. 1-3 short sentences, in first person as ${name}.`,
          `- When a mined skill or tactic fits the situation, name it.`,
          `- Answer entirely in ${language.name} (${language.native}).`,
          `- If the frame shows no game (desktop, menus, black screen), say so in one line and wait.`,
        ].join("\n");

        const heard = typeof body.heard === "string" ? body.heard.trim().slice(0, 500) : "";
        const userText = heard
          ? `The player just said: "${heard}". Coach them on the current frame.`
          : "Coach me on the current frame.";

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI is not configured" }), { status: 500 });
        }

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
              model: "google/gemini-3.1-flash-lite-preview",
              messages: [
                { role: "system", content: system },
                {
                  role: "user",
                  content: [
                    { type: "text", text: userText },
                    { type: "image_url", image_url: { url: image } },
                  ],
                },
              ],
            }),
          });
        } catch {
          return new Response(JSON.stringify({ error: "Could not reach the AI service" }), { status: 502 });
        }

        if (!res.ok) {
          const message =
            res.status === 429
              ? "The coach is rate limited — wait a moment."
              : res.status === 402
                ? "AI credits are exhausted for this workspace."
                : res.status === 403
                  ? "AI access is blocked for this workspace."
                  : `Coaching failed (${res.status}).`;
          return new Response(JSON.stringify({ error: message }), { status: res.status });
        }

        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const advice = (data.choices?.[0]?.message?.content ?? "").trim();
        return new Response(JSON.stringify({ advice }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
