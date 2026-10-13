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
        const { unpackInstructions, isQuotaMessage, quotaRetryAfter } = await import("@/lib/mining-jobs");
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
        const { data: allJobs, error } = await supabaseAdmin
          .from("mining_jobs")
          // Creator-paused and stopped jobs are deliberately excluded.
          .select("*")
          // "error" is included so a one-off network/timeout failure is retried
          // automatically instead of stranding the video forever.
          .in("status", ["paused_quota", "queued", "running", "error"])
          // A video that keeps failing for a permanent reason is abandoned after
          // a few tries instead of re-mining itself forever.
          .lt("updated_at", leaseIso)
          .or(`retry_after.is.null,retry_after.lte.${nowIso}`)
          // Playlist order: oldest added first, then its place in the playlist.
          .order("created_at", { ascending: true })
          .order("queue_position", { ascending: true })
          .limit(50);
        if (error) return json({ error: error.message }, 500);
        // Empty-AI-answer failures are recoverable (that part gets skipped),
        // so they are never abandoned by the attempt cap.
        // Empty-AI-answer failures are recoverable (that part gets skipped),
        // so they are never abandoned by the attempt cap.
        const recoverable = (j: { attempts?: number | null; last_error?: string | null }) =>
          (j.attempts ?? 0) < MAX_ATTEMPTS ||
          /empty video analysis|cannot read properties|quota|gemini key/i.test(j.last_error ?? "");
        // Permanently failed videos (bad link, unsupported video) are marked
        // abandoned so they stop matching this query — otherwise enough of
        // them would fill all 50 oldest slots and starve every newer job.
        const abandoned = (allJobs ?? []).filter((j) => !recoverable(j));
        if (abandoned.length > 0) {
          await supabaseAdmin
            .from("mining_jobs")
            .update({ status: "abandoned" })
            .in("id", abandoned.map((j) => j.id));
        }
        const jobs = (allJobs ?? [])
          .filter(recoverable)
          .slice(0, MAX_JOBS_PER_RUN)
          .map((j) => ((j.attempts ?? 0) >= MAX_ATTEMPTS ? { ...j, attempts: MAX_ATTEMPTS - 2 } : j));

        let resumed = 0;
        let paused = 0;

        // Quota belongs to one person's keys: only that person's videos wait.
        const quotaUsers = new Set<string>();

        for (const job of jobs ?? []) {
          if (Date.now() > deadline) break;
          if (quotaUsers.has(job.user_id)) continue;
          const chunks = (Array.isArray(job.chunks) ? job.chunks : []) as {
            start: number;
            end: number;
          }[];
          let results = (Array.isArray(job.results) ? job.results : []) as unknown[];
          let index = job.next_index ?? 0;
          if (index >= chunks.length) {
            await supabaseAdmin.from("mining_jobs").update({ status: "done" }).eq("id", job.id);
            const done = await finalizeMiningJob(supabaseAdmin, { ...job, results, vault_id: null } as never).catch(() => null);
            if (done) saved += 1;
            continue;
          }
          // Same context the creator's tab uses: speaker hint, source metadata
          // and the chosen output language all live in the packed column.
          const packed = unpackInstructions(job.custom_instructions ?? "");
          let assessment = {
            videoContext: job.video_context,
            primaryFocus: job.primary_focus,
            ...packed,
          };
          if (job.persona_id && !packed.speakerIdentity.trim()) {
            const { data: persona } = await supabaseAdmin.from("creator_personas").select("name").eq("id", job.persona_id).maybeSingle();
            const { withOwnerIdentity } = await import("@/lib/mining-jobs");
            assessment = withOwnerIdentity(assessment, persona?.name);
          }

          // Mining runs on the job owner's own key, never on shared platform
          // credit. A job whose owner has not saved a key yet cannot be mined
          // in the background — it waits with a clear reason instead of
          // burning attempts.
          const { runGeminiRoleWithFallback } = await import("@/lib/user-ai.server");
          const hasMiningKey = await runGeminiRoleWithFallback(job.user_id, "mine", async (_credential, key) => key).catch(() => null);
          if (!hasMiningKey) {
            await supabaseAdmin
              .from("mining_jobs")
              .update({
                last_error:
                  "Choose and test a Gemini key for Mining videos in API Manager so background mining can continue.",
                retry_after: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
              })
              .eq("id", job.id);
            continue;
          }
          // Keep mining this video while there is time left, instead of one
          // chunk every five minutes.
          while (index < chunks.length && Date.now() < deadline) {
            const chunk = chunks[index]!;
            // Claim the part (fresh updated_at) so an open tab leaves it alone.
            await supabaseAdmin.from("mining_jobs").update({ status: "running" }).eq("id", job.id);
            try {
              const { tryTranscriptMine } = await import("@/lib/youtube-mine.server");
              const fast = await tryTranscriptMine({
                url: job.source_url,
                startSec: chunk.start,
                endSec: chunk.end,
                assessment,
                usage: { userId: job.user_id, videoLabel: job.source_label ?? job.source_url, videoId: job.source_url, jobId: job.id },
              });
              const { value: mined, key } = fast ? { value: fast, key: { apiKey: "" } } : await runGeminiRoleWithFallback(job.user_id, "mine", (credential) =>
                analyzeYoutubeVideo({
                  url: job.source_url,
                  startSec: chunk.start,
                  endSec: chunk.end,
                  assessment,
                  credential,
                  usage: {
                    userId: job.user_id,
                    videoLabel: job.source_label ?? job.source_url,
                    videoId: job.source_url,
                    jobId: job.id,
                  },
                }),
              );
              const nextResults = [...results, { ...mined, window: { start: chunk.start, end: chunk.end } }];
              const { data: savedRow } = await supabaseAdmin
                .from("mining_jobs")
                .update({
                  results: nextResults as never,
                  next_index: index + 1,
                  status: index + 1 >= chunks.length ? "done" : "running",
                  last_error: null,
                  retry_after: null,
                  // Real progress clears the failure budget.
                  attempts: 0,
                  ...(key.apiKey ? { ai_credential: key.apiKey } : {}),
                })
                .eq("id", job.id)
                // An open tab already saved this part: never append it twice.
                .eq("next_index", index)
                .select("id");
              if (!savedRow || savedRow.length === 0) break;
              results = nextResults;
              index += 1;
              resumed += 1;
              if (index < chunks.length) {
                await finalizeMiningJob(supabaseAdmin, { ...job, results, vault_id: null } as never, {
                  partial: { done: index, total: chunks.length },
                }).catch(() => null);
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const quota = isQuotaMessage(message);
              // An empty AI answer on one part must never strand the whole
              // video: after repeated empty answers, mark that one part as
              // skipped (flagged for later repair) and continue with the next.
              const empty = /empty video analysis/i.test(message);
              if (empty && (job.attempts ?? 0) + 1 >= MAX_ATTEMPTS - 1) {
                const nextResults = [
                  ...results,
                  {
                    journal: [], transcript: [], knowledge: [], screenItems: [],
                    skipped: true, skipReason: message.slice(0, 200),
                    window: { start: chunk.start, end: chunk.end },
                  },
                ];
                const { data: skippedRow } = await supabaseAdmin
                  .from("mining_jobs")
                  .update({
                    results: nextResults as never,
                    next_index: index + 1,
                    status: index + 1 >= chunks.length ? "done" : "running",
                    last_error: `Part ${index + 1} skipped: AI returned nothing for it.`,
                    retry_after: null,
                    attempts: 0,
                  })
                  .eq("id", job.id)
                  .eq("next_index", index)
                  .select("id");
                if (!skippedRow || skippedRow.length === 0) break;
                results = nextResults;
                index += 1;
                job.attempts = 0;
                continue;
              }
              // Quota is transient and does not count against the budget;
              // every other failure does, with growing backoff between tries.
              const tries = quota ? (job.attempts ?? 0) : (job.attempts ?? 0) + 1;
              const backoffMin = quota ? 15 : Math.min(120, 15 * 2 ** (tries - 1));
              // A permanent failure that used up its tries is abandoned so it
              // never blocks the worker queue again; the creator can still
              // retry it by hand from the Studio.
              const giveUp = !quota && tries >= MAX_ATTEMPTS;
              await supabaseAdmin
                .from("mining_jobs")
                .update({
                  status: quota ? "paused_quota" : giveUp ? "abandoned" : "error",
                  last_error: message.slice(0, 500),
                  attempts: tries,
                  retry_after: quota
                    ? quotaRetryAfter(message)
                    : new Date(Date.now() + backoffMin * 60_000).toISOString(),
                })
                .eq("id", job.id);
              paused += 1;
              if (quota) quotaUsers.add(job.user_id);
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

        // Leftover time grows knowledge roots that still have unsorted facts,
        // one batch per project on each owner's own key. Never alters mined data.
        let rooted = 0;
        if (Date.now() < deadline - 60_000) {
          const { growPendingTopicMaps } = await import("@/lib/topic-map.server");
          rooted = await growPendingTopicMaps(supabaseAdmin, deadline).catch(() => 0);
        }
        return json({ ok: true, scanned: jobs?.length ?? 0, resumed, paused, saved, rooted }, 200);
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
