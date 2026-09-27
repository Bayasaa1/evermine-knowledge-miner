/**
 * Opening the app continues mining like a playlist, in the order videos were
 * added. With several Gemini keys, several videos mine at the same time: one
 * lane per key (up to 5), each lane starting on its own key and falling back to
 * the others only when its key runs out. Waiting (out-of-tokens) videos are
 * skipped until their resume time; the creator's Pause / Stop always wins, and
 * the background worker covers the time the app is closed.
 */
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";

import { listMiningJobs, miningLaneCount, runNextChunk } from "@/lib/mining-jobs.functions";
import type { MiningJob } from "@/lib/mining-jobs";
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
  const lanes = useServerFn(miningLaneCount);
  const step = useServerFn(runNextChunk);
  const qc = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !userId) return;
    let cancelled = false;

    const drive = async () => {
      if (running.current || cancelled) return;
      running.current = true;
      try {
        const [jobs, laneCount] = await Promise.all([list(), lanes().catch(() => 1)]);
        const queue = playlistOrder(jobs);
        let outOfTokens = false;
        // Lane 0 is the Studio screen's own key; auto lanes start at 1 so a
        // video the creator is watching mine is never on the same key.
        const lane = async (n: number) => {
          while (!cancelled && !outOfTokens) {
            const job = queue.shift();
            if (!job) return;
            let current = job;
            while (!cancelled && current.nextIndex < current.totalChunks) {
              // Lease respected: a video another lane, tab or the Studio is
              // driving is skipped, so no part is mined twice.
              const res = await step({ data: { jobId: current.id, respectLease: true, lane: n } });
              current = res.job;
              void qc.invalidateQueries({ queryKey: ["mining-jobs", userId] });
              if (res.busy || res.done || current.status !== "running") break;
            }
            if (current.status === "paused_quota" && laneCount <= 1) outOfTokens = true;
          }
        };
        await Promise.allSettled(Array.from({ length: laneCount }, (_, i) => lane(i + 1)));
      } catch {
        /* the background worker keeps mining regardless */
      } finally {
        running.current = false;
      }
    };

    void drive();
    const timer = window.setInterval(() => void drive(), 2 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isAuthenticated, userId, list, lanes, step, qc]);

  return null;
}
