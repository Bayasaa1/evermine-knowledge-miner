import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";

/**
 * Builds a REAL voice clone from the creator's own mined speech.
 *
 * The browser extracts a clean, speech-isolated sample out of the already-mined
 * video (see src/lib/voice-sample.ts) and posts it here. We hand that audio to
 * the cloning engine, which returns a voice model that sounds like the creator
 * — their timbre, accent and breath — and can then speak any words in any
 * supported language. This is cloning, not text-to-speech.
 *
 * The engine key is a backend secret and never reaches the browser.
 */
export const Route = createFileRoute("/api/voice-clone")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await guardApi(request, "voice-clone", 6);
        if (auth instanceof Response) return auth;

        const key = process.env["ELEVENLABS_API_KEY"];
        if (!key) {
          return new Response(
            JSON.stringify({
              error: "No voice-cloning engine is connected yet. Add a free ElevenLabs key to enable real cloning.",
              needsKey: true,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        let body: { name?: string; consent?: boolean; samples?: string[] };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        if (body.consent !== true) {
          return new Response(
            JSON.stringify({ error: "Confirm this is your own voice before building the clone." }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const samples = (body.samples ?? []).filter((s) => typeof s === "string" && s.startsWith("data:audio"));
        if (samples.length === 0) {
          return new Response(JSON.stringify({ error: "No usable speech sample was captured." }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const form = new FormData();
        form.append("name", (body.name ?? "Evermind clone").slice(0, 60));
        form.append(
          "description",
          "Evermind voice clone, built from the owner's own mined videos with their explicit consent.",
        );
        samples.slice(0, 4).forEach((dataUrl, i) => {
          const comma = dataUrl.indexOf(",");
          const meta = dataUrl.slice(5, comma).split(";")[0] ?? "audio/webm";
          const binary = atob(dataUrl.slice(comma + 1));
          const bytes = new Uint8Array(binary.length);
          for (let n = 0; n < binary.length; n++) bytes[n] = binary.charCodeAt(n);
          const ext = meta.includes("mp4") ? "mp4" : meta.includes("ogg") ? "ogg" : "webm";
          form.append("files", new Blob([bytes], { type: meta }), `sample-${i + 1}.${ext}`);
        });

        let res: Response;
        try {
          res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
            method: "POST",
            headers: { "xi-api-key": key },
            body: form,
          });
        } catch {
          return new Response(JSON.stringify({ error: "Could not reach the voice-cloning engine." }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!res.ok) {
          const detail = (await res.text().catch(() => "")).slice(0, 400);
          console.error("voice-clone engine error", res.status, detail);
          const message =
            res.status === 401
              ? "The voice-cloning key was rejected."
              : res.status === 429
                ? "The cloning engine is busy — try again in a moment."
                : `Building the voice clone failed (${res.status}).`;
          return new Response(JSON.stringify({ error: message }), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          });
        }

        const data = (await res.json()) as { voice_id?: string };
        if (!data.voice_id) {
          return new Response(JSON.stringify({ error: "The engine did not return a voice." }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ voiceId: data.voice_id, engine: "elevenlabs" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
