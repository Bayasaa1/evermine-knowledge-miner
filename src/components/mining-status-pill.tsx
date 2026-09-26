/**
 * Always-visible proof that mining is running.
 *
 * Mining happens on the server, so the creator must be able to see it from any
 * screen — not only on the Live mining page. This pill polls the job list and
 * shows how many videos are being mined right now plus overall progress; it
 * disappears when nothing is running.
 */
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { listMiningJobs } from "@/lib/mining-jobs.functions";
import { jobProgress, type MiningJobStatus } from "@/lib/mining-jobs";
import { pickCopy, type Lang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";

const LIVE: MiningJobStatus[] = ["queued", "running", "paused_quota", "paused_user"];

export function MiningStatusPill({ lang = "en" }: { lang?: Lang }) {
  const { isAuthenticated, userId } = useAuth();
  const fetchJobs = useServerFn(listMiningJobs);
  const { data: jobs = [] } = useQuery({
    // Owner id in the cache name: one account's jobs can never show under another.
    queryKey: ["mining-jobs", userId],
    queryFn: () => fetchJobs(),
    // The job list is owner-scoped and 401s without a session.
    enabled: isAuthenticated && Boolean(userId),
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
    // Keep the last known jobs on screen while a refetch is in flight, so the
    // pill never blinks away between polls of the SAME account's list.
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  });

  const live = jobs.filter((j) => LIVE.includes(j.status));
  if (live.length === 0) return null;
  const partsDone = live.reduce((s, j) => s + j.nextIndex, 0);
  const partsTotal = live.reduce((s, j) => s + j.totalChunks, 0);

  const pct = Math.round(live.reduce((sum, j) => sum + jobProgress(j), 0) / live.length);
  const label = pickCopy(
    { en: "mining now", mn: "олборлож байна", ko: "마이닝 중" },
    lang,
  );

  return (
    <>
    <Link
      to="/mining"
      style={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}
      className="fixed inset-x-0 z-[60] mx-auto flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-xl"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      {live.length} {label}
      <span className="tabular-nums text-muted-foreground">
        {partsDone}/{partsTotal} {pickCopy({ en: "parts", mn: "хэсэг", ko: "파트" }, lang)} · {pct}%
      </span>
    </Link>
    </>
  );
}
