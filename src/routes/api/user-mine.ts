import { createFileRoute } from "@tanstack/react-router";

const SYSTEM = [
  "You are the Evermine Mind Miner. You read only the END USER's own spoken or typed turns from a conversation with an AI clone.",
  "Extract the user's own subconsciousness signals — never the AI clone's opinions.",
  "Return STRICT JSON with these keys, each an array of short plain strings (max 4 items each, may be empty):",
  '{"interests":[],"beliefs":[],"questions":[],"toneNotes":[]}',
  "- interests: topics/domains the user keeps returning to.",
  "- beliefs: opinions, values or preferences the user states about themselves or the world.",
  "- questions: the kind of problems they are trying to solve, phrased as a short need.",
  "- toneNotes: how they speak (pace, formality, vocabulary habits).",
  "Only include items genuinely supported by the text. Output JSON only, no prose, no markdown fences.",
].join("\n");

type Body = { utterances?: unknown };

export const Route = createFileRoute("/api/user-mine")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return json({ error: "AI is not configured" }, 500);

        let res: Response;
        try {
          res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": apiKey,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: "openai/gpt-5.6-luna",
              store: false,
              input: [
                { role: "developer", content: [{ type: "input_text", text: SYSTEM }] },
                {
                  role: "user",
                  content: [
                    {
                      type: "input_text",
                      text: `USER TURNS:\n${utterances.map((u) => `- ${u}`).join("\n")}`,
                    },
                  ],
                },
              ],
            }),
          });
        } catch {
          return json({ error: "Could not reach the AI service" }, 502);
        }

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          console.error("user-mine gateway error", res.status, detail.slice(0, 400));
          const message =
            res.status === 429
              ? "Mind Miner is rate limited — it will retry later."
              : res.status === 402
                ? "AI credits are exhausted for this workspace."
                : res.status === 403
                  ? "AI access is blocked for this workspace."
                  : `Mind Miner failed (${res.status}).`;
          return json({ error: message }, res.status);
        }

        const data = (await res.json()) as {
          output_text?: string;
          output?: { content?: { type?: string; text?: string }[] }[];
        };
        let text = data.output_text ?? "";
        if (!text) {
          for (const item of data.output ?? []) {
            for (const part of item.content ?? []) {
              if (part.type === "output_text" && part.text) text += part.text;
            }
          }
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
