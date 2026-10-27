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
        let body: { lang?: string; errors?: unknown; messages?: ChatMsg[]; action?: string; args?: Record<string, unknown> };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        // Architect Co-Pilot tools. Writes only run from user-pressed buttons.
        if (body.action) {
          const a = await import("@/lib/architect.server");
          const args = body.args ?? {};
          const s = (k: string) => (typeof args[k] === "string" ? (args[k] as string).slice(0, 2000) : "");
          const pid = s("projectId");
          const needsProject = ["health", "fix", "stress"].includes(body.action) || (body.action === "scout" && !s("topic"));
          try {
            const result =
              needsProject && !pid ? await a.projectChoices(auth.userId, body.action)
              : body.action === "scout" ? await a.scoutYoutubeSources(auth.userId, s("topic"), pid || undefined)
              : body.action === "health" ? await a.analyzeBrainHealth(auth.userId, pid)
              : body.action === "fix" ? await a.autoFixBrain(auth.userId, pid, s("instructions"))
              : body.action === "stress" ? await a.stressTestMind(auth.userId, pid)
              : body.action === "apply_fix" ? await a.applyBrainFix(auth.userId, s("vaultId"), Array.isArray(args["patches"]) ? (args["patches"] as { question: string; answer: string }[]) : [])
              : body.action === "audit_system" ? await a.auditEntireSystem(auth.userId)
              : body.action === "auto_heal" ? await a.autoHealSystem(auth.userId)
              : body.action === "bind_persona" ? await a.bindPersona(auth.userId, pid, s("name"))
              : null;
            if (!result) return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 });
            return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
          } catch (err) {
            const { aiErrorResponse } = await import("@/lib/user-ai.server");
            return aiErrorResponse(err);
          }
        }

        const { diagnosticSystemPrompt } = await import("@/lib/diagnostic-prompt");
        const { isLangCode } = await import("@/lib/languages");
        const lang = isLangCode(body.lang) ? body.lang : "en";
        const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : undefined);
        const errors = (Array.isArray(body.errors) ? body.errors.slice(-10) : []).map((e) => {
          const r = (e ?? {}) as { at?: unknown; source?: unknown; status?: unknown; url?: unknown; message?: unknown; detail?: unknown };
          return {
            at: str(r.at, 40),
            source: str(r.source, 40),
            status: typeof r.status === "number" ? r.status : null,
            url: str(r.url, 300),
            message: str(r.message, 500),
            detail: str(r.detail, 400),
          };
        });
        const system = diagnosticSystemPrompt(lang, errors);
        const history = (Array.isArray(body.messages) ? body.messages.slice(-20) : [])
          .filter((m) => m && (m.role === "user" || m.role === "model") && typeof m.text === "string")
          .map((m) => ({ role: m.role, text: m.text.slice(0, 4000) }));
        if (history.length === 0) {
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
          return new Response(JSON.stringify({ text: generated.text, provider: generated.provider }), {
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
