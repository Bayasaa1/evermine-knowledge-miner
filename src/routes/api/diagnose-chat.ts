/**
 * Zero-setup fallback brain for the System Diagnostic Assistant.
 *
 * The widget prefers the creator's own Gemini access (pasted key pool or the
 * Google OAuth session). When neither is available it posts here, so the
 * assistant is never blocked behind "add an API key first".
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";

type ChatMsg = { role: "user" | "model"; text: string };

export const Route = createFileRoute("/api/diagnose-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Paid AI call: signed-in users only, with a per-user request budget.
        const auth = await guardApi(request, "diagnose-chat", 20);
        if (auth instanceof Response) return auth;
        let body: { system?: string; messages?: ChatMsg[] };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        const system = typeof body.system === "string" ? body.system.slice(0, 12000) : "";
        const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        if (!system || history.length === 0) {
          return new Response(JSON.stringify({ error: "No messages" }), { status: 400 });
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI is not configured" }), { status: 500 });
        }

        const input = [
          { role: "developer", content: [{ type: "input_text", text: system }] },
          ...history.map((m) => ({
            role: m.role === "model" ? "assistant" : "user",
            content: [{ type: m.role === "model" ? "output_text" : "input_text", text: m.text }],
          })),
        ];

        let res: Response;
        try {
          res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: "openai/gpt-5.6-sol", input }),
          });
        } catch {
          return new Response(JSON.stringify({ error: "Could not reach the AI service." }), { status: 502 });
        }

        if (!res.ok) {
          const status = res.status;
          const message =
            status === 429
              ? "The diagnostic assistant is rate limited right now. Wait a moment and ask again."
              : status === 402
                ? "The workspace AI credits are used up. Add credits to keep using the assistant."
                : `The diagnostic assistant could not answer (HTTP ${status}).`;
          return new Response(JSON.stringify({ error: message }), { status });
        }

        const data = (await res.json()) as {
          output_text?: string;
          output?: { type?: string; content?: { type?: string; text?: string }[] }[];
        };
        const text =
          data.output_text ??
          (data.output ?? [])
            .flatMap((o) => o.content ?? [])
            .filter((c) => c.type === "output_text")
            .map((c) => c.text ?? "")
            .join("")
            .trim();

        return new Response(JSON.stringify({ text: text || "…" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
