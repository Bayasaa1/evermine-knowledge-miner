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
 * Coaching runs on the creator's own Gemini key or Google sign-in — never on
 * shared platform credit.
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
            communication?: { kind?: string; quote?: string; context?: string }[];
            mindset?: string[];
            emotions?: { trigger?: string; reaction?: string; quote?: string }[];
          };
          apiKey?: string;
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
          ...(brain.communication?.length
            ? [
                `HOW ${name} TALKS IN GAME (copy this voice):`,
                ...list(
                  brain.communication,
                  (c: { kind?: string; quote?: string; context?: string }) => `- [${c.kind ?? ""}] "${c.quote ?? ""}" (${c.context ?? ""})`,
                  10,
                ),
              ]
            : []),
          ...(brain.mindset?.length
            ? [`MINDSET: ${brain.mindset.slice(0, 8).join("; ")}`]
            : []),
          ...(brain.emotions?.length
            ? [
                `EMOTIONAL REACTIONS (match this energy):`,
                ...list(
                  brain.emotions,
                  (e: { trigger?: string; reaction?: string; quote?: string }) => `- on ${e.trigger ?? ""}: ${e.reaction ?? ""}${e.quote ? ` — "${e.quote}"` : ""}`,
                  8,
                ),
              ]
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

        const { resolveGeminiCredential, geminiGenerate, aiErrorResponse } = await import(
          "@/lib/user-ai.server"
        );
        try {
          const credential = await resolveGeminiCredential(auth.userId, body, "chat");
          const advice = await geminiGenerate({
            credential,
            model: "gemini-2.5-flash",
            system,
            maxTokens: 512,
            usage: { userId: auth.userId, role: "chat", subjectKind: "other", subjectLabel: "Game coaching" },
            turns: [
              {
                role: "user",
                parts: [
                  { text: userText },
                  { inline_data: { mime_type: "image/jpeg", data: image.split(",", 2)[1] ?? "" } },
                ],
              },
            ],
          });
          return new Response(JSON.stringify({ advice }), {
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
