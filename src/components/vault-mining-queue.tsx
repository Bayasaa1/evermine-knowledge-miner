/**
 * "Mining now" — every mining video (including background work while the app
 * was closed) shown right inside My Vaults, with its parts and controls.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, Loader2, Pause, Play, Square } from "lucide-react";
import { continueMiningNow, listMiningJobs, setMiningJobState } from "@/lib/mining-jobs.functions";
import { jobParts, type MiningJob } from "@/lib/mining-jobs";
import { formatDuration } from "@/lib/chunking";
import { pickCopy, type Lang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";

const SHOWN = ["queued", "running", "paused_quota", "paused_user", "error", "abandoned", "stopped"];

function ytId(url: string) {
  return /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/.exec(url ?? "")?.[1];
}

export function VaultMiningQueue({ lang = "en", personaId }: { lang?: Lang; personaId?: string | null }) {
  const { user } = useAuth();
  const fetchJobs = useServerFn(listMiningJobs);
  const { data: jobs = [] } = useQuery({
    queryKey: ["mining-jobs", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: () => fetchJobs(),
    refetchInterval: 5_000,
  });
  const c = (en: string, mn: string, ko: string) => pickCopy({ en, mn, ko }, lang);
  const list = jobs.filter(
    (j) =>
      (SHOWN.includes(j.status) || (j.status === "done" && j.nextIndex < j.chunks.length)) &&
      (!personaId || j.personaId === personaId),
  );
  if (!user) return null;

  return (
    <section className="rounded-[12px] border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        <p className="text-sm font-semibold text-foreground">
          {c("Mining now", "Одоо олборлож байна", "지금 마이닝 중")} ({list.length})
        </p>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {c(
            "Nothing is mining right now. Videos you start mining appear here, even while the app is closed.",
            "Одоогоор олборлож буй видео алга. Олборлож эхэлсэн видео энд харагдана — апп хаалттай үед ч.",
            "지금 마이닝 중인 영상이 없습니다. 시작한 영상은 앱이 닫혀 있어도 여기에 표시됩니다.",
          )}
        </p>
      ) : (
        <div className="space-y-3">
          {list.map((j) => (
            <JobRow key={j.id} job={j} c={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function JobRow({ job, c }: { job: MiningJob; c: (en: string, mn: string, ko: string) => string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const setState = useServerFn(setMiningJobState);
  const cont = useServerFn(continueMiningNow);
  const total = job.chunks.length || job.totalChunks;
  const done = Math.min(job.nextIndex, total);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const id = ytId(job.sourceUrl);
  const when = job.retryAfter ? new Date(job.retryAfter).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

  const state =
    job.status === "running"
      ? c("Mining now", "Олборлож байна", "마이닝 중")
      : job.status === "paused_quota"
        ? c(`Waiting for free tokens${when ? ` · continues at ${when}` : ""}`, `Үнэгүй токен хүлээж байна${when ? ` · ${when}-д үргэлжилнэ` : ""}`, `무료 토큰 대기 중${when ? ` · ${when}에 계속` : ""}`)
        : job.status === "paused_user"
          ? c("Paused", "Түр зогсоосон", "일시정지")
          : job.status === "stopped"
            ? c("Stopped", "Зогсоосон", "중지됨")
            : job.status === "error"
              ? c("Failed", "Алдаа", "실패")
              : job.status === "abandoned"
                ? c("Gave up — retry by hand", "Болисон — гараар дахин эхлүүлэх", "포기됨 — 수동 재시도")
                : c("In line", "Дараалалд", "대기열");

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["mining-jobs"] });
    }
  };

  return (
    <div className="rounded-[10px] border border-border bg-background/40 p-3">
      <div className="flex gap-3">
        {id && <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="h-14 w-24 shrink-0 rounded object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{job.sourceLabel}</p>
          <p className="text-xs text-muted-foreground">
            {c(`${done} / ${total} parts mined`, `${done} / ${total} хэсэг олборлосон`, `${done} / ${total} 파트 완료`)} · {state}
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          {(job.status === "error" || job.status === "abandoned") && job.lastError && <p className="mt-1 text-xs text-destructive">{job.lastError}</p>}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {["paused_quota", "error", "abandoned", "queued"].includes(job.status) && (
          <button disabled={busy} onClick={() => act(() => cont({ data: { jobId: job.id } }))} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted">
            <Play className="h-3 w-3" /> {c("Continue now", "Одоо үргэлжлүүлэх", "지금 계속")}
          </button>
        )}
        {["paused_user", "stopped"].includes(job.status) && (
          <button disabled={busy} onClick={() => act(() => setState({ data: { jobId: job.id, action: "resume" } }))} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted">
            <Play className="h-3 w-3" /> {c("Resume", "Үргэлжлүүлэх", "재개")}
          </button>
        )}
        {["running", "queued", "paused_quota"].includes(job.status) && (
          <button disabled={busy} onClick={() => act(() => setState({ data: { jobId: job.id, action: "pause" } }))} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted">
            <Pause className="h-3 w-3" /> {c("Pause", "Түр зогсоох", "일시정지")}
          </button>
        )}
        {job.status !== "stopped" && (
          <button disabled={busy} onClick={() => act(() => setState({ data: { jobId: job.id, action: "stop" } }))} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-destructive hover:bg-muted">
            <Square className="h-3 w-3" /> {c("Stop", "Зогсоох", "중지")}
          </button>
        )}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <button onClick={() => setOpen((v) => !v)} className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {c("Parts", "Хэсгүүд", "파트")} {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>
      {open && (
        <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs">
          {jobParts(job).map((p) => (
            <li key={p.index} className="flex justify-between rounded px-2 py-1 odd:bg-muted/40">
              <span className="text-foreground">
                {c("Part", "Хэсэг", "파트")} {p.index + 1} · {formatDuration(p.start)}–{formatDuration(p.end)}
              </span>
              <span className={p.state === "done" ? "text-primary" : p.state === "failed" ? "text-destructive" : "text-muted-foreground"}>
                {p.state === "done" ? c("Done", "Дууссан", "완료") : p.state === "mining" ? c("Mining", "Олборлож байна", "마이닝 중") : p.state === "failed" ? c("Failed", "Алдаа", "실패") : c("Waiting", "Хүлээж байна", "대기")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
