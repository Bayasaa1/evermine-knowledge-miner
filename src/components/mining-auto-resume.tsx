/**
 * Opening the app continues mining like a playlist: the next unmined part of
 * the current video, then the next video, in the order they were added.
 * Waiting (out-of-tokens) videos are skipped until their resume time; the
 * creator's Pause / Stop always wins, and the background worker covers the
 * time the app is closed.
 */
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";

import { listMiningJobs, runNextChunk } from "@/lib/mining-jobs.functions";
import type { MiningJob } from "@/lib/mining-jobs";
import { miningDriver } from "@/lib/mining-driver";
import { useAuth } from "@/hooks/use-auth";

const RUNNABLE = new Set(["queued", "running", "paused_quota"]);

function playlistOrder(jobs: MiningJob[]): MiningJob[] {
  return jobs
    .filter((j) => RUNNABLE.has(j.status) && j.nextIndex < j.totalChunks)
    .filter((j) => !j.retryAfter || new Date(j.retryAfter).getTime() <= Date.now())
    .sort((a, b) => {
      const ca = new Date(a.createdAt ?? a.updatedAt).getTime();
      const cb = new Date(b.createdAt ?? b.updatedAt).getTime();
      return ca - cb || a.queuePosition - b.queuePosition;
    });
}

export function MiningAutoResume() {
  const { isAuthenticated, userId } = useAuth();
  const list = useServerFn(listMiningJobs);
  const step = useServerFn(runNextChunk);
  const qc = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    let cancelled = false;

    const drive = async () => {
      if (running.current || miningDriver.active || cancelled) return;
      running.current = true;
      miningDriver.active = true;
      try {
        const queue = playlistOrder(await list());
        for (const job of queue) {
          let current = job;
          while (!cancelled && current.nextIndex < current.totalChunks) {
            const res = await step({ data: { jobId: current.id, respectLease: true } });
            current = res.job;
            void qc.invalidateQueries({ queryKey: ["mining-jobs", userId] });
            if (res.busy || res.done || current.status !== "running") break;
          }
          // Out of tokens: the same keys serve every video, so stop for now.
          if (current.status === "paused_quota") break;
        }
      } catch {
        /* the background worker keeps mining regardless */
      } finally {
        running.current = false;
        miningDriver.active = false;
      }
    };

    void drive();
    // Pick up again when a waiting video's resume time passes.
    const timer = window.setInterval(() => void drive(), 2 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isAuthenticated, userId, list, step, qc]);

  return null;
}
