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
/** Permanent failures (bad link, unsupported video) stop after this many tries. */
const MAX_ATTEMPTS = 4;

export const Route = createFileRoute("/api/public/cron/resume-mining")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) {
          // Also accept the project-owned mining cron key (LOVABLE_CRON_SECRET
          // is platform-managed and unreadable, so pg_cron uses this one).
          const projectKey = process.env["MINING_CRON_SECRET"];
          const token = /^Bearer ([^\s,]+)$/.exec(
            request.headers.get("authorization") ?? "",
          )?.[1];
          if (!projectKey || !token || token !== projectKey) return denied;
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { analyzeYoutubeVideo } = await import("@/lib/youtube-mine.server");
        const { unpackInstructions } = await import("@/lib/mining-jobs");
        const { finalizeMiningJob } = await import("@/lib/finalize-job.server");

        // Rescue pass: jobs that finished earlier but were never written into a
        // Mind (the creator's tab was closed) get saved now.
        const { data: stranded } = await supabaseAdmin
          .from("mining_jobs")
          .select("*")
          .eq("status", "done")
          .is("vault_id", null)
          .limit(10);
        let saved = 0;
        for (const row of stranded ?? []) {
          const vaultId = await finalizeMiningJob(supabaseAdmin, row as never).catch(() => null);
          if (vaultId) saved += 1;
        }
        // Keep one worker run well inside the platform request budget.
        const deadline = Date.now() + 4 * 60_000;

        const nowIso = new Date().toISOString();
        // Single-flight lease: a job touched in the last 3 minutes is being mined
        // by an open tab or a previous run, so this worker leaves it alone.
        const leaseIso = new Date(Date.now() - 3 * 60_000).toISOString();
        const { data: jobs, error } = await supabaseAdmin
          .from("mining_jobs")
          // Creator-paused and stopped jobs are deliberately excluded.
          .select("*")
          // "error" is included so a one-off network/timeout failure is retried
          // automatically instead of stranding the video forever.
          .in("status", ["paused_quota", "queued", "running", "error"])
          // A video that keeps failing for a permanent reason is abandoned after
          // a few tries instead of re-mining itself forever.
          .lt("attempts", MAX_ATTEMPTS)
          .lt("updated_at", leaseIso)
          .or(`retry_after.is.null,retry_after.lte.${nowIso}`)
          .order("updated_at", { ascending: true })
          .limit(MAX_JOBS_PER_RUN);
        if (error) return json({ error: error.message }, 500);

        let resumed = 0;
        let paused = 0;

        let quotaHit = false;

        for (const job of jobs ?? []) {
          if (quotaHit || Date.now() > deadline) break;
          const chunks = (Array.isArray(job.chunks) ? job.chunks : []) as {
            start: number;
            end: number;
          }[];
          let results = (Array.isArray(job.results) ? job.results : []) as unknown[];
          let index = job.next_index ?? 0;
          if (index >= chunks.length) {
            await supabaseAdmin.from("mining_jobs").update({ status: "done" }).eq("id", job.id);
            const done = await finalizeMiningJob(supabaseAdmin, { ...job, results } as never).catch(() => null);
            if (done) saved += 1;
            continue;
          }
          // Same context the creator's tab uses: speaker hint, source metadata
          // and the chosen output language all live in the packed column.
          const packed = unpackInstructions(job.custom_instructions ?? "");
          const assessment = {
            videoContext: job.video_context,
            primaryFocus: job.primary_focus,
            ...packed,
          };

          // Mining runs on the job owner's own key, never on shared platform
          // credit. A job whose owner has not saved a key yet cannot be mined
          // in the background — it waits with a clear reason instead of
          // burning attempts.
          const ownerKey = typeof job.ai_credential === "string" ? job.ai_credential.trim() : "";
          if (!ownerKey) {
            await supabaseAdmin
              .from("mining_jobs")
              .update({
                last_error:
                  "Add your free Gemini key in Engines so background mining can run on your own free quota.",
                retry_after: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
              })
              .eq("id", job.id);
            continue;
          }
          const credential = { kind: "gemini_key" as const, value: ownerKey };

          // Keep mining this video while there is time left, instead of one
          // chunk every five minutes.
          while (index < chunks.length && Date.now() < deadline) {
            const chunk = chunks[index]!;
            try {
              const mined = await analyzeYoutubeVideo({
                url: job.source_url,
                startSec: chunk.start,
                endSec: chunk.end,
                assessment,
                credential,
              });
              results = [...results, mined];
              index += 1;
              await supabaseAdmin
                .from("mining_jobs")
                .update({
                  results: results as never,
                  next_index: index,
                  status: index >= chunks.length ? "done" : "running",
                  last_error: null,
                  retry_after: null,
                  // Real progress clears the failure budget.
                  attempts: 0,
                })
                .eq("id", job.id);
              resumed += 1;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const quota = /quota|rate limit|429|too many requests|resource_exhausted/i.test(message);
              // Quota is transient and does not count against the budget;
              // every other failure does, with growing backoff between tries.
              const tries = quota ? (job.attempts ?? 0) : (job.attempts ?? 0) + 1;
              const backoffMin = quota ? 15 : Math.min(120, 15 * 2 ** (tries - 1));
              await supabaseAdmin
                .from("mining_jobs")
                .update({
                  status: quota ? "paused_quota" : "error",
                  last_error: message.slice(0, 500),
                  attempts: tries,
                  retry_after: new Date(Date.now() + backoffMin * 60_000).toISOString(),
                })
                .eq("id", job.id);
              paused += 1;
              // Quota is global — stop the whole run and wait for the reset.
              if (quota) quotaHit = true;
              break;
            }
          }
          // Everything mined: store it as a real Mind right here, so the
          // creator finds it in My Vaults even if the app was never reopened.
          if (index >= chunks.length) {
            const vaultId = await finalizeMiningJob(
              supabaseAdmin,
              { ...job, results, next_index: index } as never,
            ).catch(() => null);
            if (vaultId) saved += 1;
          }
          // A creator pause/stop mid-run must win over this worker.
          const { data: fresh } = await supabaseAdmin
            .from("mining_jobs")
            .select("status")
            .eq("id", job.id)
            .maybeSingle();
          if (fresh && (fresh.status === "paused_user" || fresh.status === "stopped")) break;
        }

        return json({ ok: true, scanned: jobs?.length ?? 0, resumed, paused, saved }, 200);
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
