/** Alternate independent save/maintenance and checkpoint CPU budgets. */
export function maintenanceTurn(cursors: unknown, hasMiningJobs: boolean) {
  return !hasMiningJobs || (cursors as Record<string, string> | null)?.lastWork === "mining";
}

/** Finished jobs always win; partial saves never claim or finish a mining job. */
export async function savePendingMiningMind(
  admin: any,
  cursors: Record<string, string>,
  finalize = async (job: any, opts: { partial?: { done: number; total: number }; deferTopics: boolean }) => {
    const { finalizeMiningJob } = await import("@/lib/finalize-job.server");
    return finalizeMiningJob(admin, job, opts);
  },
) {
  let query = admin.from("mining_jobs").select("id,updated_at")
    .eq("status", "done").is("vault_id", null).order("updated_at").limit(1);
  let { data: row, error } = await query.maybeSingle();
  if (error) throw error;
  let partial = false;
  if (!row) {
    query = admin.from("mining_jobs").select("id,updated_at")
      .in("status", ["queued", "paused_quota", "error"])
      .is("vault_id", null).gt("next_index", 0).neq("source_kind", "upload");
    if (cursors.partialJob && cursors.partialIndex) {
      query = query.or(`id.neq.${cursors.partialJob},next_index.neq.${cursors.partialIndex}`);
    }
    ({ data: row, error } = await query.order("created_at").limit(1).maybeSingle());
    if (error) throw error;
    partial = true;
  }
  if (!row) return { handled: false, saved: 0, cursors };
  const { data: job, error: jobError } = await admin.from("mining_jobs").select("*")
    .eq("id", row.id).eq("updated_at", row.updated_at).maybeSingle();
  if (jobError) throw jobError;
  if (!job) return { handled: true, saved: 0, cursors };
  const vaultId = await finalize(job, {
    deferTopics: true,
    ...(partial ? { partial: { done: job.next_index, total: Array.isArray(job.chunks) ? job.chunks.length : 0 } } : {}),
  });
  return {
    handled: true,
    saved: vaultId ? 1 : 0,
    cursors: partial && vaultId ? { ...cursors, partialJob: job.id, partialIndex: String(job.next_index) } : cursors,
  };
}

/** One persisted maintenance unit per invocation; never scans bulk payloads. */
export async function runMiningMaintenance(admin: any, state: { phase: number; cursors: unknown }) {
  const cursors = { ...(state.cursors as Record<string, string> ?? {}) };
  const phase = state.phase;
  const table = phase === 0 || phase === 2 ? "mining_jobs" : phase === 4 ? "projects" : "project_content";
  let query = admin.from(table).select(phase === 4 ? "id,user_id" : "id");
  if (phase === 0) query = query.eq("status", "done").is("vault_id", null);
  if (phase === 2) query = query.eq("status", "done").not("vault_id", "is", null).neq("source_kind", "upload");
  if (phase === 1) query = query.contains("transcript", [{ timestamp: "" }]);
  const cursor = cursors[String(phase)];
  if (cursor) query = query.gt("id", cursor);
  const { data: row, error } = await query.order("id").limit(1).maybeSingle();
  if (error) throw error;
  // End of a sweep: wrap on the next turn of this phase.
  if (!row) delete cursors[String(phase)];
  else {
    const deadline = Date.now() + 90_000;
    if (phase === 0) {
      const { data: job, error: jobError } = await admin.from("mining_jobs").select("*").eq("id", row.id).eq("status", "done").is("vault_id", null).maybeSingle();
      if (jobError) throw jobError;
      if (job) {
        const { finalizeMiningJob } = await import("@/lib/finalize-job.server");
        await finalizeMiningJob(admin, job, { deferTopics: true });
      }
    } else if (phase === 1) {
      const { data: content, error: contentError } = await admin.from("project_content").select("transcript,updated_at").eq("id", row.id).maybeSingle();
      if (contentError) throw contentError;
      if (content && Array.isArray(content.transcript)) {
        const { repairTimingsLocal } = await import("@/lib/repair-timings");
        const { error: writeError } = await admin.from("project_content").update({ transcript: repairTimingsLocal(content.transcript) }).eq("id", row.id).eq("updated_at", content.updated_at);
        if (writeError) throw writeError;
      }
    } else if (phase === 2) {
      const { autoRepairFinishedVideos } = await import("@/lib/auto-repair.server");
      await autoRepairFinishedVideos(admin, deadline, row.id);
    } else if (phase === 3) {
      const { reviewFinishedJournals } = await import("@/lib/journal-review.server");
      await reviewFinishedJournals(admin, deadline, row.id);
    } else {
      const { growProjectTopics } = await import("@/lib/topic-map.server");
      await growProjectTopics(admin, row.user_id, row.id, 1);
    }
    cursors[String(phase)] = row.id;
  }
  return { phase: (phase + 1) % 5, cursors };
}