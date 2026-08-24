import { createFileRoute } from "@tanstack/react-router";
import { findMind } from "@/lib/minds";

type ChatMsg = { role: "user" | "agent"; text: string };

function buildSystemPrompt(mindId: string) {
  const mind = findMind(mindId);
  if (!mind) return null;
  const b = mind.coreBrain;
  return [
    `You are an AI Clone of ${mind.name}, a Mind Vault mined by Evermine from the Primary Owner's own videos.`,
    `Domain: ${mind.domain}.`,
    ``,
    `CORE BRAIN (the only source of opinions you may speak from):`,
    `Tone: ${b.tone}`,
    `Vocabulary to favour: ${b.vocabulary.join(", ")}`,
    `Beliefs:\n- ${b.beliefs.join("\n- ")}`,
    `Skills:\n- ${b.skills.join("\n- ")}`,
    `Decision logic:\n- ${b.decisionLogic.join("\n- ")}`,
    `Aesthetic profile: ${b.aestheticProfile}`,
    `Voice samples:\n- ${b.sampleLines.join("\n- ")}`,
    ``,
    `RULES:`,
    `- Answer in first person as the Primary Owner, matching the tone and vocabulary above.`,
    `- Ground every opinion in the beliefs and decision logic. Never invent opinions outside this brain.`,
    `- If the question is outside this domain or brain, say plainly that this mind was not mined on that, then offer the closest thing it does know.`,
    `- Keep answers short: 2-5 sentences, or a tight markdown list. Use markdown (bold, lists, links, fenced code) when it genuinely helps.`,
  ].join("\n");
}

export const Route = createFileRoute("/api/mind-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { mindId?: string; messages?: ChatMsg[] };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        const system = body.mindId ? buildSystemPrompt(body.mindId) : null;
        if (!system) {
          return new Response(JSON.stringify({ error: "Unknown mind" }), { status: 400 });
        }
        const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        if (history.length === 0) {
          return new Response(JSON.stringify({ error: "No messages" }), { status: 400 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI is not configured" }), { status: 500 });
        }

        const input = [
          { role: "developer", content: [{ type: "input_text", text: system }] },
          ...history.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: [
              m.role === "user"
                ? { type: "input_text", text: m.text }
                : { type: "output_text", text: m.text },
            ],
          })),
        ];

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
              input,
              stream: true,
              store: false,
            }),
          });
        } catch {
          return new Response(JSON.stringify({ error: "Could not reach the AI service" }), {
            status: 502,
          });
        }

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          const message =
            res.status === 429
              ? "This mind is busy right now — try again in a moment."
              : res.status === 402
                ? "AI credits are exhausted for this workspace."
                : res.status === 403
                  ? "AI access is blocked for this workspace."
                  : `AI request failed (${res.status}).`;
          console.error("mind-chat gateway error", res.status, detail.slice(0, 500));
          return new Response(JSON.stringify({ error: message }), { status: res.status });
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload) as {
                type?: string;
                delta?: string;
                response?: { output_text?: string };
              };
              if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
                text += evt.delta;
              } else if (evt.type === "response.completed" && !text) {
                text = evt.response?.output_text ?? "";
              }
            } catch {
              /* ignore keep-alive fragments */
            }
          }
        }

        return new Response(JSON.stringify({ text: text.trim() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
