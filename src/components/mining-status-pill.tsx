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

const LIVE: MiningJobStatus[] = ["queued", "running", "paused_quota", "paused_user"];

export function MiningStatusPill({ lang = "en" }: { lang?: Lang }) {
  const fetchJobs = useServerFn(listMiningJobs);
  const { data: jobs = [] } = useQuery({
    queryKey: ["mining-jobs"],
    queryFn: () => fetchJobs(),
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });

  const live = jobs.filter((j) => LIVE.includes(j.status));
  if (live.length === 0) return null;

  const pct = Math.round(live.reduce((sum, j) => sum + jobProgress(j), 0) / live.length);
  const label = pickCopy(
    { en: "mining now", mn: "олборлож байна", ko: "마이닝 중" },
    lang,
  );

  return (
    <Link
      to="/mining"
      className="fixed inset-x-0 bottom-[68px] z-40 mx-auto flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-card/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg backdrop-blur"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      {live.length} {label}
      <span className="tabular-nums text-muted-foreground">{pct}%</span>
    </Link>
  );
}
