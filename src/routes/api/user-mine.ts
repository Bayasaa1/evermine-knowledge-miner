import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";

const SYSTEM = [
  "You are the Evermind Mind Miner. You read only the END USER's own spoken or typed turns from a conversation with an AI clone.",
  "Extract the user's own subconsciousness signals — never the AI clone's opinions.",
  "Return STRICT JSON with these keys, each an array of short plain strings (max 4 items each, may be empty):",
  '{"interests":[],"beliefs":[],"questions":[],"toneNotes":[]}',
  "- interests: topics/domains the user keeps returning to.",
  "- beliefs: opinions, values or preferences the user states about themselves or the world.",
  "- questions: the kind of problems they are trying to solve, phrased as a short need.",
  "- toneNotes: how they speak (pace, formality, vocabulary habits).",
  "Only include items genuinely supported by the text. Output JSON only, no prose, no markdown fences.",
].join("\n");

type Body = { utterances?: unknown; apiKey?: string };

export const Route = createFileRoute("/api/user-mine")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Paid AI call: signed-in users only, with a per-user request budget.
        const auth = await guardApi(request, "user-mine", 20);
        if (auth instanceof Response) return auth;
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const utterances = Array.isArray(body.utterances)
          ? (body.utterances as unknown[]).filter((u): u is string => typeof u === "string" && !!u.trim())
          : [];
        if (utterances.length === 0) return json({ error: "No utterances" }, 400);

        const { resolveGeminiCredential, geminiGenerate, aiErrorResponse } = await import(
          "@/lib/user-ai.server"
        );

        let text = "";
        try {
          const credential = await resolveGeminiCredential(auth.userId, body);
          text = await geminiGenerate({
            credential,
            model: "gemini-2.5-flash",
            system: SYSTEM,
            json: true,
            maxTokens: 1024,
            turns: [
              {
                role: "user",
                parts: [{ text: `USER TURNS:\n${utterances.map((u) => `- ${u}`).join("\n")}` }],
              },
            ],
          });
        } catch (err) {
          return aiErrorResponse(err);
        }

        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return json({ interests: [], beliefs: [], questions: [], toneNotes: [] }, 200);
        try {
          const parsed = JSON.parse(match[0]) as Record<string, unknown>;
          const list = (k: string) =>
            Array.isArray(parsed[k])
              ? (parsed[k] as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 4)
              : [];
          return json(
            {
              interests: list("interests"),
              beliefs: list("beliefs"),
              questions: list("questions"),
              toneNotes: list("toneNotes"),
            },
            200,
          );
        } catch {
          return json({ interests: [], beliefs: [], questions: [], toneNotes: [] }, 200);
        }
      },
    },
  },
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
