/**
 * Background quota-resume worker.
 *
 * Picks up mining jobs that were paused when the free AI quota ran out and
 * mines their next 5-minute checkpoint. Progress is never lost: each job keeps
 * its chunk plan, its already-mined checkpoints and the index to resume from.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const MAX_JOBS_PER_RUN = 1;
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

        // Always await the mining pass: a background promise after an early
        // 202 is killed by the runtime and leaves the job locked with no progress.
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const token = crypto.randomUUID();
          const { data: leases, error } = await supabaseAdmin.rpc("claim_mining_worker", { p_token: token });
          if (error) throw error;
          const state = leases?.[0];
          if (!state) return json({ ok: true, busy: true }, 200);
          try {
            return await runMiningWorker(state);
          } finally {
            await supabaseAdmin.from("mining_worker_state").update({ token: null, lease_until: new Date().toISOString() }).eq("name", "resume-mining").eq("token", token);
          }
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : String(err) }, 500);
        }
      },
    },
  },
});

/** One checkpoint or one independent maintenance unit per invocation. */
async function runMiningWorker(state: { phase: number; cursors: unknown; token: string | null }): Promise<Response> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { analyzeYoutubeVideo } = await import("@/lib/youtube-mine.server");
    const { unpackInstructions, isQuotaMessage, quotaRetryAfter } = await import("@/lib/mining-jobs");

    const deadline = Date.now() + 4 * 60_000;
    const saved = 0;
    // Stuck recovery: a running job silent for over 6 minutes goes back
    // to the queue (its finished parts stay saved).
    {
      const { MINING_LEASE_STALE_MS } = await import("@/lib/mining-jobs");
      await supabaseAdmin
        .from("mining_jobs")
        .update({ status: "queued" })
        .eq("status", "running")
        .lt("updated_at", new Date(Date.now() - MINING_LEASE_STALE_MS).toISOString());
    }
    const nowIso = new Date().toISOString();
    // Single-flight lease: a job touched in the last 6 minutes is being mined
    // by an open tab or a previous run, so this worker leaves it alone.
    const { MINING_LEASE_STALE_MS } = await import("@/lib/mining-jobs");
    const leaseIso = new Date(Date.now() - MINING_LEASE_STALE_MS).toISOString();
    const { data: allJobs, error } = await supabaseAdmin
      .from("mining_jobs")
      // Creator-paused and stopped jobs are deliberately excluded.
      .select("id,user_id,attempts,last_error,updated_at")
      // "error" is included so a one-off network/timeout failure is retried
      // automatically instead of stranding the video forever.
      .in("status", ["paused_quota", "queued", "running", "error"])
      // Uploaded videos are mined by the creator's own browser, never here.
      .neq("source_kind", "upload")
      // A video that keeps failing for a permanent reason is abandoned after
      // a few tries instead of re-mining itself forever.
      .or(`status.neq.running,updated_at.lt.${leaseIso}`)
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

    const { maintenanceTurn, savePendingMiningMind, runMiningMaintenance } = await import("@/lib/mining-worker-maintenance.server");
    const cursors = { ...(state.cursors as Record<string, string> ?? {}) };
    if (maintenanceTurn(cursors, jobs.length > 0)) {
      const pending = await savePendingMiningMind(supabaseAdmin, cursors);
      const next = pending.handled
        ? { phase: state.phase, cursors: pending.cursors }
        : await runMiningMaintenance(supabaseAdmin, { ...state, cursors });
      const { error: stateError } = await supabaseAdmin.from("mining_worker_state")
        .update({ ...next, cursors: { ...next.cursors, lastWork: "maintenance" } })
        .eq("name", "resume-mining").eq("token", state.token ?? "");
      if (stateError) throw stateError;
      return json({ ok: true, scanned: 0, resumed: 0, paused: 0, saved: pending.saved, rooted: 0 }, 200);
    }
    // Persist before a slow checkpoint: even a terminated pass yields a save turn next.
    const { error: turnError } = await supabaseAdmin.from("mining_worker_state")
      .update({ cursors: { ...cursors, lastWork: "mining" } })
      .eq("name", "resume-mining").eq("token", state.token ?? "");
    if (turnError) throw turnError;

    let resumed = 0;
    let paused = 0;

    // Quota belongs to one person's keys: only that person's videos wait.
    const quotaUsers = new Set<string>();

    for (const candidate of jobs ?? []) {
      // Hydrate exactly one selected row, never fifty accumulated result arrays.
      const { data: job, error: rowError } = await supabaseAdmin.from("mining_jobs").select("*").eq("id", candidate.id).eq("updated_at", candidate.updated_at).maybeSingle();
      if (rowError) throw rowError;
      if (!job) continue;
      job.attempts = candidate.attempts;
      if (Date.now() > deadline) break;
      if (quotaUsers.has(job.user_id)) continue;
      // Atomic claim: only proceed if nobody touched the job since we read
      // it, so an open tab and this worker never mine the same part twice.
      const { data: claimed } = await supabaseAdmin
        .from("mining_jobs")
        .update({ status: "running" })
        .eq("id", job.id)
        .eq("updated_at", job.updated_at)
        .select("updated_at");
      if (!claimed?.length) continue;
      const lease = claimed[0]?.updated_at;
      if (!lease) continue;
      const chunks = (Array.isArray(job.chunks) ? job.chunks : []) as {
        start: number;
        end: number;
      }[];
      let results = (Array.isArray(job.results) ? job.results : []) as unknown[];
      let index = job.next_index ?? 0;
      if (index >= chunks.length) {
        await supabaseAdmin.from("mining_jobs").update({ status: "done" }).eq("id", job.id).eq("status", "running").eq("updated_at", lease);
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
            status: "paused_quota",
            last_error:
              "Choose and test a Gemini key for Mining videos in API Manager so background mining can continue.",
            retry_after: quotaRetryAfter("No working key"),
          })
          .eq("id", job.id).eq("status", "running").eq("updated_at", lease);
        continue;
      }
      // One checkpoint only; later invocations continue the saved plan.
      while (index < chunks.length && Date.now() < deadline) {
        const chunk = chunks[index];
        if (!chunk) break;
        // Claim the part (fresh updated_at) so an open tab leaves it alone.
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
              status: index + 1 >= chunks.length ? "done" : "queued",
              last_error: null,
              retry_after: null,
              // Real progress clears the failure budget.
              attempts: 0,
              ...(key.apiKey ? { ai_credential: key.apiKey } : {}),
            })
            .eq("id", job.id)
            // An open tab already saved this part: never append it twice.
            .eq("next_index", index)
            .eq("status", "running")
            .eq("updated_at", lease)
            .select("id");
          if (!savedRow || savedRow.length === 0) break;
          results = nextResults;
          index += 1;
          resumed += 1;
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const quota = isQuotaMessage(message);
          const { httpStatusOf } = await import("@/lib/retry");
          const providerStatus = httpStatusOf(err) ?? (err as { httpStatus?: number })?.httpStatus;
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
                status: index + 1 >= chunks.length ? "done" : "queued",
                last_error: `Part ${index + 1} skipped: AI returned nothing for it.`,
                retry_after: null,
                attempts: 0,
              })
              .eq("id", job.id)
              .eq("next_index", index)
              .eq("status", "running").eq("updated_at", lease)
              .select("id");
            if (!skippedRow || skippedRow.length === 0) break;
            results = nextResults;
            index += 1;
            job.attempts = 0;
            break;
          }
          // Quota is transient and does not count against the budget;
          // every other failure does, with growing backoff between tries.
          const tries = quota ? (job.attempts ?? 0) : (job.attempts ?? 0) + 1;
          // A permanent failure that used up its tries is abandoned so it
          // never blocks the worker queue again; the creator can still
          // retry it by hand from the Studio.
          const giveUp = !quota && tries >= MAX_ATTEMPTS;
          await supabaseAdmin
            .from("mining_jobs")
            .update({
              status: providerStatus === 403 || providerStatus === 422 ? "stopped" : quota ? "paused_quota" : giveUp ? "abandoned" : "error",
              last_error: message.slice(0, 500),
              attempts: tries,
              retry_after: quotaRetryAfter(message),
            })
            .eq("id", job.id).eq("status", "running").eq("updated_at", lease);
          paused += 1;
          if (quota) quotaUsers.add(job.user_id);
          break;
        }
      }
      // Finalization is rescued in its own invocation, after durable progress.
      // A creator pause/stop mid-run must win over this worker.
      const { data: fresh } = await supabaseAdmin
        .from("mining_jobs")
        .select("status")
        .eq("id", job.id)
        .maybeSingle();
      if (fresh && (fresh.status === "paused_user" || fresh.status === "stopped")) break;
    }

    // Saving gets the next independent invocation, even while this queue is busy.
    const rooted = 0;
    return json({ ok: true, scanned: jobs?.length ?? 0, resumed, paused, saved, rooted }, 200);
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
