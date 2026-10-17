/**
 * Background repair of finished videos: parts whose clocks leapt out of the
 * video, came back in the wrong language, or went silent while BOTH neighbours
 * talk are re-mined once on the owner's own key and rebuilt through
 * finalizeMiningJob. Each part is retried at most once (marked autoRepaired on
 * the mining record) so a truly quiet part never loops or burns quota.
 */
import { findMineProblems, type PartPlan, type TranscriptLine } from "@/lib/subtitle-health";

const PARTS_PER_RUN = 2;
const VIDEOS_SCANNED = 40;

function videoIdOf(url: string): string {
  return /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/.exec(url ?? "")?.[1] ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function autoRepairFinishedVideos(admin: any, deadline: number): Promise<number> {
  const { data: jobs } = await admin
    .from("mining_jobs")
    .select("id, user_id, source_url, chunks, next_index, results")
    .eq("status", "done")
    .not("vault_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(VIDEOS_SCANNED);
  let fixedParts = 0;
  for (const lite of jobs ?? []) {
    if (fixedParts >= PARTS_PER_RUN || Date.now() > deadline) break;
    const plan = (Array.isArray(lite.chunks) ? lite.chunks : []).filter(
      (c: PartPlan) => typeof c?.start === "number" && typeof c?.end === "number",
    ) as PartPlan[];
    const results = (Array.isArray(lite.results) ? [...lite.results] : []) as Record<string, unknown>[];
    if (!plan.length || lite.next_index < plan.length) continue;
    const vid = videoIdOf(lite.source_url);
    if (!vid) continue;
    const { data: row } = await admin
      .from("project_content")
      .select("id, transcript")
      .eq("user_id", lite.user_id)
      .eq("youtube_id", vid)
      .limit(1)
      .maybeSingle();
    if (!row) continue;
    const lines = (Array.isArray(row.transcript) ? row.transcript : []) as TranscriptLine[];
    const perPart = plan.map((p) => lines.filter((l) => {
      const m = /(\d+):(\d{2})/.exec(l.timestamp ?? "");
      if (!m) return false;
      const s = Number(m[1]) * 60 + Number(m[2]);
      return s >= p.start - 1 && s < p.end + 1;
    }).length);
    const problems = findMineProblems(lines, plan, lite.next_index).filter((p) => {
      if (p.part < 0 || p.kind === "unfinished") return false;
      // Silence only counts as missing when speech surrounds it on both sides.
      if (p.kind === "empty_part") return (perPart[p.part - 1] ?? 0) > 0 && (perPart[p.part + 1] ?? 0) > 0;
      return true;
    });
    const todo = [...new Set(problems.map((p) => p.part))]
      .filter((i) => i < results.length && !results[i]?.["autoRepaired"])
      .slice(0, PARTS_PER_RUN - fixedParts);
    if (!todo.length) continue;

    const { data: job } = await admin.from("mining_jobs").select("*").eq("id", lite.id).maybeSingle();
    if (!job) continue;
    const { unpackInstructions } = await import("@/lib/mining-jobs");
    const meta = unpackInstructions(job.custom_instructions ?? "");
    const assessment = { videoContext: job.video_context ?? undefined, primaryFocus: job.primary_focus ?? undefined, ...meta };
    const { tryTranscriptMine, analyzeYoutubeVideo } = await import("@/lib/youtube-mine.server");
    const { runGeminiRoleWithFallback } = await import("@/lib/user-ai.server");
    const usage = { userId: job.user_id, videoLabel: job.source_label, videoId: job.source_url, jobId: job.id };

    let changed = false;
    for (const index of todo) {
      const part = plan[index]!;
      try {
        const fast = await tryTranscriptMine({ url: job.source_url, startSec: part.start, endSec: part.end, assessment, usage });
        const mined = fast
          ? fast
          : (await runGeminiRoleWithFallback(job.user_id, "mine", (credential) =>
              analyzeYoutubeVideo({ url: job.source_url, startSec: part.start, endSec: part.end, assessment, credential, usage }),
            )).value;
        results[index] = { ...mined, window: { start: part.start, end: part.end }, autoRepaired: true };
        fixedParts += 1;
      } catch {
        // Quota or network: mark tried so the next run moves on; the old part stays.
        results[index] = { ...(results[index] ?? {}), autoRepaired: true };
      }
      changed = true;
    }
    if (!changed) continue;
    await admin.from("mining_jobs").update({ results: results as never }).eq("id", job.id);
    const { finalizeMiningJob } = await import("@/lib/finalize-job.server");
    await finalizeMiningJob(admin, { ...job, results, vault_id: null } as never).catch(() => null);
  }
  return fixedParts;
}
