/**
 * Background quota-resume worker.
 *
 * Picks up mining jobs that were paused when the free AI quota ran out and
 * mines their next 5-minute checkpoint. Progress is never lost: each job keeps
 * its chunk plan, its already-mined checkpoints and the index to resume from.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const MAX_JOBS_PER_RUN = 5;

export const Route = createFileRoute("/api/public/cron/resume-mining")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { analyzeYoutubeVideo } = await import("@/lib/youtube-mine.server");

        const nowIso = new Date().toISOString();
        // Single-flight lease: a job touched in the last 3 minutes is being mined
        // by an open tab or a previous run, so this worker leaves it alone.
        const leaseIso = new Date(Date.now() - 3 * 60_000).toISOString();
        const { data: jobs, error } = await supabaseAdmin
          .from("mining_jobs")
          // Creator-paused and stopped jobs are deliberately excluded.
          .select("*")
          .in("status", ["paused_quota", "queued", "running"])
          .lt("updated_at", leaseIso)
          .or(`retry_after.is.null,retry_after.lte.${nowIso}`)
          .order("updated_at", { ascending: true })
          .limit(MAX_JOBS_PER_RUN);
        if (error) return json({ error: error.message }, 500);

        let resumed = 0;
        let paused = 0;

        for (const job of jobs ?? []) {
          const chunks = (Array.isArray(job.chunks) ? job.chunks : []) as {
            start: number;
            end: number;
          }[];
          const results = (Array.isArray(job.results) ? job.results : []) as unknown[];
          const index = job.next_index ?? 0;
          if (index >= chunks.length) {
            await supabaseAdmin.from("mining_jobs").update({ status: "done" }).eq("id", job.id);
            continue;
          }
          const chunk = chunks[index]!;
          try {
            const mined = await analyzeYoutubeVideo({
              url: job.source_url,
              startSec: chunk.start,
              endSec: chunk.end,
              assessment: {
                videoContext: job.video_context,
                primaryFocus: job.primary_focus,
                customInstructions: job.custom_instructions,
              },
            });
            const nextIndex = index + 1;
            await supabaseAdmin
              .from("mining_jobs")
              .update({
                results: [...results, mined] as never,
                next_index: nextIndex,
                status: nextIndex >= chunks.length ? "done" : "running",
                last_error: null,
                retry_after: null,
              })
              .eq("id", job.id);
            resumed += 1;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const quota = /quota|rate limit|429|too many requests|resource_exhausted/i.test(message);
            await supabaseAdmin
              .from("mining_jobs")
              .update({
                status: quota ? "paused_quota" : "error",
                last_error: message.slice(0, 500),
                retry_after: quota ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
              })
              .eq("id", job.id);
            paused += 1;
            if (quota) break; // Quota is global — stop this run and wait for reset.
          }
        }

        return json({ ok: true, scanned: jobs?.length ?? 0, resumed, paused }, 200);
      },
    },
  },
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
