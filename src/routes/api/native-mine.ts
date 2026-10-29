import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";

/**
 * Mines one browser-prepared part of a creator-uploaded video (frames + mono
 * WAV from src/lib/video-extract.ts) on the caller's own Gemini key pool.
 * Read-only: returns the part's journal; saving happens in the mining flow.
 */
type Body = {
  startSec?: unknown;
  endSec?: unknown;
  frames?: unknown;
  audioWav?: unknown;
  personaName?: unknown;
  language?: unknown;
  label?: unknown;
};

const MAX_BODY_CHARS = 18_000_000;

export const Route = createFileRoute("/api/native-mine")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await guardApi(request, "native-mine", 12);
        if (auth instanceof Response) return auth;
        const raw = await request.text();
        if (raw.length > MAX_BODY_CHARS) return json({ error: "This part is too large. Use a shorter part." }, 413);
        let body: Body;
        try { body = JSON.parse(raw) as Body; } catch { return json({ error: "Invalid JSON body" }, 400); }
        const startSec = Number(body.startSec);
        const endSec = Number(body.endSec);
        if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec || endSec - startSec > 330)
          return json({ error: "A part must be at most 5 minutes." }, 400);
        const frames = Array.isArray(body.frames)
          ? (body.frames as unknown[])
              .filter((f): f is { t: number; jpeg: string } => !!f && typeof (f as { jpeg?: unknown }).jpeg === "string" && Number.isFinite(Number((f as { t?: unknown }).t)))
              .map((f) => ({ t: Number(f.t), jpeg: f.jpeg }))
              .slice(0, 40)
          : [];
        const audioWav = typeof body.audioWav === "string" && body.audioWav ? body.audioWav : null;
        const personaName = typeof body.personaName === "string" ? body.personaName.slice(0, 80) : "";
        const language = typeof body.language === "string" ? body.language.slice(0, 8) : "";
        const label = typeof body.label === "string" ? body.label.slice(0, 120) : "Uploaded video";

        const { runGeminiRoleWithFallback, aiErrorResponse } = await import("@/lib/user-ai.server");
        const { analyzeUploadedPart } = await import("@/lib/youtube-mine.server");
        try {
          const { value } = await runGeminiRoleWithFallback(auth.userId, "mine", (credential) =>
            analyzeUploadedPart({
              startSec,
              endSec,
              frames,
              audioWav,
              credential,
              assessment: {
                ...(personaName ? { speakerIdentity: personaName } : {}),
                ...(language ? { outputLanguage: language } : {}),
              } as never,
              usage: { userId: auth.userId, videoLabel: label },
            }),
          );
          return json({ ok: true, startSec, endSec, result: value }, 200);
        } catch (err) {
          if (err instanceof Error && !/quota|rate|key/i.test(err.message)) return json({ error: err.message }, 502);
          return aiErrorResponse(err);
        }
      },
    },
  },
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
