/**
 * Reads a chat attachment (picture, voice, video, PDF) with the user's own
 * Gemini key and returns plain text the Mind can talk about. Word, Excel and
 * text files are read in the browser and never reach this route.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";

const MAX_BYTES = 15 * 1024 * 1024;

function instruction(mime: string): string {
  if (mime.startsWith("image/"))
    return "Describe this picture in detail: who or what is in it, any text visible (copy it exactly), setting, mood. Plain text, no preamble.";
  if (mime.startsWith("audio/"))
    return "Transcribe this audio word for word in its original language. Then add one line starting with 'Summary:' in the same language. Plain text.";
  if (mime.startsWith("video/"))
    return "Describe what happens in this video in order, and transcribe any speech word for word in its original language. Plain text.";
  return "Extract the full text content of this document faithfully, keeping headings and tables readable. Plain text.";
}

export const Route = createFileRoute("/api/chat-attach")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await guardApi(request, "chat-attach", 20);
        if (auth instanceof Response) return auth;
        let body: { name?: string; mime?: string; data?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const mime = String(body.mime ?? "");
        const data = String(body.data ?? "");
        const ok = /^(image|audio|video)\//.test(mime) || mime === "application/pdf";
        if (!ok || !data) return Response.json({ error: "Unsupported file type." }, { status: 400 });
        if ((data.length * 3) / 4 > MAX_BYTES) return Response.json({ error: "File is larger than 15 MB." }, { status: 413 });

        const { resolveGeminiCredential, geminiGenerate, aiErrorResponse } = await import("@/lib/user-ai.server");
        try {
          const credential = await resolveGeminiCredential(auth.userId, {}, "chat");
          const text = await geminiGenerate({
            credential,
            maxTokens: 8192,
            usage: {
              userId: auth.userId,
              role: "chat",
              subjectKind: "other",
              subjectId: "chat-attach",
              subjectLabel: `Chat file: ${String(body.name ?? "file").slice(0, 80)}`,
              jobId: "",
            },
            turns: [{ role: "user", parts: [{ text: instruction(mime) }, { inline_data: { mime_type: mime, data } }] }],
          });
          if (!text.trim()) return Response.json({ error: "The AI could not read this file." }, { status: 502 });
          return Response.json({ text: text.trim().slice(0, 20_000) });
        } catch (err) {
          return aiErrorResponse(err);
        }
      },
    },
  },
});
