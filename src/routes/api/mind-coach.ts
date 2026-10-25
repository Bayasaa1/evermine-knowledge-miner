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
          playbook?: {
            detected_game_or_genre?: string;
            playstyle_metrics?: Record<string, number>;
            state_action_rules?: { when_hud_or_map_state?: string; do_micro_or_macro_action?: string; creator_reason?: string }[];
            callout_vocabulary?: string[];
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
        // Brain fields arrive from the browser: flatten them to short plain text so
        // they are read as profile data, never as new instructions.
        const clean = (v: unknown, max = 200) => String(v ?? "").replace(/[\r\n<>{}\[\]`]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
        const name = clean(body.name ?? "this player", 80) || "this player";
        const brain = body.brain ?? {};
        const list = (items: unknown, pick: (x: never) => string, cap = 12) =>
          Array.isArray(items) ? (items as never[]).slice(0, cap).map(pick).map((s) => clean(s, 300)).filter(Boolean) : [];

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
          ...(body.playbook
            ? [
                ``,
                `GAME / GENRE: ${String(body.playbook.detected_game_or_genre ?? "unknown").slice(0, 80)}`,
                `PLAYSTYLE (0-100): ${Object.entries(body.playbook.playstyle_metrics ?? {}).slice(0, 5).map(([k, v]) => `${k.slice(0, 20)}=${Number(v) || 0}`).join(", ")}`,
                `STATE → ACTION RULES (match the frame against these first):`,
                ...list(
                  body.playbook.state_action_rules,
                  (r: { when_hud_or_map_state?: string; do_micro_or_macro_action?: string; creator_reason?: string }) =>
                    `- WHEN ${String(r.when_hud_or_map_state ?? "").slice(0, 160)} → DO ${String(r.do_micro_or_macro_action ?? "").slice(0, 160)} (because ${String(r.creator_reason ?? "").slice(0, 120)})`,
                  20,
                ),
                ...(body.playbook.callout_vocabulary?.length
                  ? [`CALLOUT WORDS: ${body.playbook.callout_vocabulary.slice(0, 15).map((c) => String(c).slice(0, 60)).join(" | ")}`]
                  : []),
              ]
            : []),
          ``,
          `RULES:`,
          `- Look at the frame. Comment on what the player is doing RIGHT NOW: position, resources, danger, opportunity.`,
          `- Coach, never play: give one clear next move or correction. 1-3 short sentences, in first person as ${name}.`,
          `- When a mined skill or tactic fits the situation, name it.`,
          `- Answer entirely in ${language.name} (${language.native}).`,
          `- If the frame shows no game (desktop, menus, black screen), say so in one line and wait (urgency calm).`,
          `- Reply ONLY with JSON: {"callout": string (punchy, max 15 words, in ${name}'s voice), "urgency": "calm"|"warn"|"critical", "detected_situation": string, "recommended_action": string}.`,
          `- critical = immediate danger/loss in seconds; warn = a mistake forming; calm = fine.`,
        ].join("\n");

        const heard = typeof body.heard === "string" ? body.heard.trim().slice(0, 500) : "";
        const userText = heard
          ? `The player just said: "${heard}". Coach them on the current frame.`
          : "Coach me on the current frame.";

        const { resolveGeminiCredential, geminiGenerate, aiErrorResponse } = await import(
          "@/lib/user-ai.server"
        );
        try {
          const credential = await resolveGeminiCredential(auth.userId, body, "face_clone");
          const advice = await geminiGenerate({
            credential,
            model: "gemini-3.1-flash-lite",
            system,
            maxTokens: 512,
            usage: { userId: auth.userId, role: "face_clone", subjectKind: "other", subjectLabel: "Game coaching" },
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
          const parsed = parseCallout(advice);
          return new Response(JSON.stringify({ advice: parsed.callout, ...parsed }), {
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

type Callout = {
  callout: string;
  urgency: "calm" | "warn" | "critical";
  detected_situation: string;
  recommended_action: string;
};

function parseCallout(raw: string): Callout {
  const text = String(raw ?? "").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const j = JSON.parse(match[0]) as Partial<Callout>;
      const urgency = j.urgency === "warn" || j.urgency === "critical" ? j.urgency : "calm";
      const callout = String(j.callout ?? "").trim();
      if (callout) {
        return {
          callout: callout.slice(0, 240),
          urgency,
          detected_situation: String(j.detected_situation ?? "").slice(0, 240),
          recommended_action: String(j.recommended_action ?? "").slice(0, 240),
        };
      }
    } catch {
      /* fall through to plain text */
    }
  }
  if (!text) throw new Error("Empty coach reply");
  return { callout: text.slice(0, 240), urgency: "calm", detected_situation: "", recommended_action: "" };
}
