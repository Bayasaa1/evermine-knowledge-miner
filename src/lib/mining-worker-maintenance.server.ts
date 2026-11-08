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