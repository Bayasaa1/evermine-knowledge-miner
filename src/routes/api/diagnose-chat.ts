/**
 * Diagnostic Assistant backend.
 *
 * Runs on the caller's own AI access — their Gemini key, their saved account
 * key, or their Google sign-in token. There is no shared platform credit:
 * when the caller has no credential yet, the reply says exactly how to add a
 * free key instead of answering on someone else's budget.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";

type ChatMsg = { role: "user" | "model"; text: string };

export const Route = createFileRoute("/api/diagnose-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await guardApi(request, "diagnose-chat", 20);
        if (auth instanceof Response) return auth;
        let body: { system?: string; messages?: ChatMsg[]; apiKey?: string; googleToken?: string };
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

        const { resolveGeminiCredential, geminiGenerate, aiErrorResponse } = await import(
          "@/lib/user-ai.server"
        );
        try {
          const credential = await resolveGeminiCredential(auth.userId, body);
          const text = await geminiGenerate({
            credential,
            model: "gemini-2.5-flash",
            system,
            maxTokens: 1024,
            turns: history.map((m) => ({
              role: (m.role === "model" ? "model" : "user") as "user" | "model",
              parts: [{ text: m.text }],
            })),
          });
          return new Response(JSON.stringify({ text: text || "…" }), {
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
