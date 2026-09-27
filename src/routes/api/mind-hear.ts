import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";

/** Voice call hearing: transcribes the caller's speech with their own Gemini key. */
export const Route = createFileRoute("/api/mind-hear")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await guardApi(request, "mind-hear", 40);
        if (auth instanceof Response) return auth;
        let body: { audio?: string; mime?: string; lang?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const audio = typeof body.audio === "string" ? body.audio : "";
        if (!audio || audio.length > 14_000_000) return Response.json({ error: "No audio" }, { status: 400 });
        const mime = /^audio\/[\w.+-]+/.exec(body.mime ?? "")?.[0] ?? "audio/webm";
        try {
          const { resolveGeminiCredential } = await import("@/lib/user-ai.server");
          const cred = await resolveGeminiCredential(auth.userId);
          const { geminiHear } = await import("@/lib/gemini-voice.server");
          const text = await geminiHear(cred.value, audio, mime, String(body.lang ?? "en"));
          return Response.json({ text });
        } catch (e) {
          console.error("mind-hear", e);
          return Response.json({ error: "Could not understand the recording. Check your Gemini key in API Manager." }, { status: 502 });
        }
      },
    },
  },
});
