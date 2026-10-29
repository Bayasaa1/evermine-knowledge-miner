import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";

/**
 * Mines one browser-prepared part of a creator-uploaded video (frames + mono
 * WAV from src/lib/video-extract.ts) on the caller's own Gemini key pool, and
 * saves it onto the caller's own upload mining record. The last part files the
 * finished Mind through finalizeMiningJob, like every other video.
 */
type Body = {
  jobId?: unknown;
  index?: unknown;
  frames?: unknown;
  audioWav?: unknown;
  thumbnailPath?: unknown;
  durationSec?: unknown;
  sourceType?: unknown;
};

const MAX_BODY_CHARS = 18_000_000;
const UUID = /^[0-9a-f-]{36}$/i;

export const Route = createFileRoute("/api/native-mine")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await guardApi(request, "native-mine", 12);
        if (auth instanceof Response) return auth;
        const raw = await request.text();
        if (raw.length > MAX_BODY_CHARS) return json({ error: "This part is too large." }, 413);
        let body: Body;
        try { body = JSON.parse(raw) as Body; } catch { return json({ error: "Invalid JSON body" }, 400); }
        const jobId = typeof body.jobId === "string" && UUID.test(body.jobId) ? body.jobId : null;
        const index = Number(body.index);
        if (!jobId || !Number.isInteger(index) || index < 0) return json({ error: "Missing mining record." }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: job } = await supabaseAdmin
          .from("mining_jobs")
          .select("*")
          .eq("id", jobId)
          .eq("user_id", auth.userId)
          .eq("source_kind", "upload")
          .maybeSingle();
        if (!job) return json({ error: "Mining record not found." }, 404);
        if (job.status === "stopped" || job.status === "paused_user") return json({ error: "This mining was stopped." }, 409);
        const plan = (Array.isArray(job.chunks) ? job.chunks : []) as { start: number; end: number }[];
        const results = (Array.isArray(job.results) ? job.results : []) as unknown[];
        // Parts are saved strictly in order, so a retried request never doubles a part.
        if (index < job.next_index) return json({ ok: true, skipped: true, nextIndex: job.next_index, total: plan.length }, 200);
        if (index !== job.next_index || !plan[index]) return json({ error: "Parts must be mined in order." }, 409);
        const { start: startSec, end: endSec } = plan[index]!;

        const frames = Array.isArray(body.frames)
          ? (body.frames as unknown[])
              .filter((f): f is { t: number; jpeg: string } => !!f && typeof (f as { jpeg?: unknown }).jpeg === "string" && Number.isFinite(Number((f as { t?: unknown }).t)))
              .map((f) => ({ t: Number(f.t), jpeg: f.jpeg }))
              .slice(0, 40)
          : [];
        const audioWav = typeof body.audioWav === "string" && body.audioWav ? body.audioWav : null;

        const { runGeminiRoleWithFallback, aiErrorResponse } = await import("@/lib/user-ai.server");
        const { analyzeUploadedPart } = await import("@/lib/youtube-mine.server");
        const { unpackInstructions } = await import("@/lib/mining-jobs");
        const meta = unpackInstructions(job.custom_instructions ?? "");
        let result: unknown;
        try {
          const { value } = await runGeminiRoleWithFallback(auth.userId, "mine", (credential) =>
            analyzeUploadedPart({
              startSec, endSec, frames, audioWav, credential,
              assessment: { speakerIdentity: meta.speakerIdentity, outputLanguage: meta.outputLanguage } as never,
              usage: { userId: auth.userId, videoLabel: job.source_label, jobId },
            }),
          );
          result = { ...value, window: { start: startSec, end: endSec } };
        } catch (err) {
          await supabaseAdmin.from("mining_jobs").update({ last_error: err instanceof Error ? err.message.slice(0, 300) : "Mining failed" }).eq("id", jobId);
          if (err instanceof Error && !/quota|rate|key/i.test(err.message)) return json({ error: err.message }, 502);
          return aiErrorResponse(err);
        }

        const nextResults = [...results.slice(0, index), result];
        const nextIndex = index + 1;
        const finished = nextIndex >= plan.length;
        const { data: saved } = await supabaseAdmin
          .from("mining_jobs")
          .update({ results: nextResults as never, next_index: nextIndex, status: finished ? "done" : "running", last_error: null })
          .eq("id", jobId)
          .eq("next_index", index)
          .select("*")
          .maybeSingle();
        if (!saved) return json({ ok: true, skipped: true, nextIndex, total: plan.length }, 200);

        let contentId: string | null = null;
        if (finished) {
          const { finalizeMiningJob } = await import("@/lib/finalize-job.server");
          const vaultId = await finalizeMiningJob(supabaseAdmin, { ...saved, vault_id: null } as never).catch(() => null);
          if (vaultId) {
            await supabaseAdmin.from("mining_jobs").update({ vault_id: vaultId }).eq("id", jobId);
            const sourceType = body.sourceType === "camera_record" ? "camera_record" : "native_upload";
            const thumb = typeof body.thumbnailPath === "string" && body.thumbnailPath.startsWith(`${auth.userId}/`) ? body.thumbnailPath : null;
            const duration = Number(body.durationSec);
            const { data: content } = await supabaseAdmin
              .from("project_content")
              .update({
                source_type: sourceType,
                thumbnail_url: thumb,
                ...(Number.isFinite(duration) && duration > 0 ? { duration_seconds: Math.round(duration) } : {}),
              })
              .eq("user_id", auth.userId)
              .eq("source_url", job.source_url)
              .select("id")
              .maybeSingle();
            contentId = (content?.id as string | undefined) ?? null;
          }
        }
        return json({ ok: true, nextIndex, total: plan.length, done: finished, contentId }, 200);
      },
    },
  },
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
