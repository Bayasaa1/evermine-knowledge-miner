/**
 * Diagnostic Assistant backend.
 *
 * Runs on the caller's saved account key assigned to Chatting. There is no
 * shared platform credit:
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

        const { generateRoleText, aiErrorResponse } = await import(
          "@/lib/user-ai.server"
        );
        try {
          const generated = await generateRoleText({
            userId: auth.userId,
            role: "chat",
            system,
            prompt: history.map((message) => `${message.role}: ${message.text}`).join("\n"),
            messages: history.map((message) => ({
              role: message.role === "user" ? "user" as const : "assistant" as const,
              content: message.text,
            })),
            maxTokens: 1024,
            subjectKind: "test",
            subjectLabel: "Diagnostic assistant",
          });
          if (!generated.text.trim()) {
            return new Response(JSON.stringify({ error: "The selected Chat AI returned an empty answer." }), {
              status: 502,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ text: generated.text }), {
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
