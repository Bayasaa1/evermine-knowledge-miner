import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pause, Play, Square, CheckCircle2, AlertTriangle, Clock, Trash2 } from "lucide-react";

import { clearMiningHistory, continueMiningNow, listMiningJobs, setMiningJobState } from "@/lib/mining-jobs.functions";
import { formatDuration, jobParts, jobProgress, type MiningJob, type MiningJobStatus } from "@/lib/mining-jobs";
import { pickCopy, type Lang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";

const COPY = {
  en: {
    title: "Live mining",
    sub: "Mining runs on our servers. You can close this tab or the whole app — every checkpoint keeps saving.",
    none: "No mining jobs yet. Start one from the Create wizard.",
    active: "Working now",
    finished: "Finished",
    chunk: "checkpoint",
    of: "of",
    pause: "Pause",
    resume: "Resume",
    stop: "Stop",
    refreshing: "Live",
    retry: "Waiting for AI quota to reset",
    parts: "parts mined",
    part: "Part",
    continuesAt: "Waiting for free tokens — continues at",
    continueNow: "Continue now",
    showParts: "Show parts",
    clear: "Clear history",
    kept: "Finished runs are only history — clearing them never deletes your mined Minds.",
  },
  mn: {
    title: "Шууд мining",
    sub: "Мining сервер дээр ажиллана. Таб эсвэл апп-аа хаасан ч бүх хэсэг хадгалагдсаар байна.",
    none: "Одоогоор ажил алга. Бүтээх хэсгээс эхлүүлнэ үү.",
    active: "Ажиллаж байна",
    finished: "Дууссан",
    chunk: "хэсэг",
    of: "/",
    pause: "Түр зогсоох",
    resume: "Үргэлжлүүлэх",
    stop: "Зогсоох",
    refreshing: "Шууд",
    retry: "AI-н квот сэргэхийг хүлээж байна",
    parts: "хэсэг олборлосон",
    part: "Хэсэг",
    continuesAt: "Үнэгүй токен хүлээж байна — үргэлжлэх цаг",
    continueNow: "Одоо үргэлжлүүлэх",
    showParts: "Хэсгүүдийг харах",
    clear: "Түүх цэвэрлэх",
    kept: "Дууссан бичлэгүүд зөвхөн түүх — цэвэрлэсэн ч олборлосон Mind устахгүй.",
  },
  ko: {
    title: "실시간 마이닝",
    sub: "마이닝은 서버에서 실행됩니다. 탭이나 앱을 닫아도 체크포인트는 계속 저장됩니다.",
    none: "아직 작업이 없습니다. 만들기에서 시작하세요.",
    active: "진행 중",
    finished: "완료",
    chunk: "체크포인트",
    of: "/",
    pause: "일시정지",
    resume: "계속",
    stop: "중지",
    refreshing: "실시간",
    retry: "AI 사용량 초기화를 기다리는 중",
    parts: "파트 완료",
    part: "파트",
    continuesAt: "무료 토큰 대기 중 — 재개 시각",
    continueNow: "지금 계속",
    showParts: "파트 보기",
    clear: "기록 지우기",
    kept: "완료된 작업은 기록일 뿐이며, 지워도 채굴된 Mind는 삭제되지 않습니다.",
  },
} as const;

const STATUS_LABEL: Record<MiningJobStatus, { en: string; mn: string; ko: string }> = {
  queued: { en: "Queued", mn: "Дараалалд", ko: "대기 중" },
  running: { en: "Mining", mn: "Мining", ko: "마이닝 중" },
  paused_quota: { en: "Waiting for quota", mn: "Квот хүлээж байна", ko: "사용량 대기" },
  abandoned: { en: "Gave up", mn: "Болисон", ko: "포기됨" },
  paused_user: { en: "Paused", mn: "Түр зогссон", ko: "일시정지됨" },
  stopped: { en: "Stopped", mn: "Зогссон", ko: "중지됨" },
  error: { en: "Error", mn: "Алдаа", ko: "오류" },
  done: { en: "Done", mn: "Дууссан", ko: "완료" },
};

const PART_LABEL = {
  done: { en: "Done", mn: "Дууссан", ko: "완료" },
  mining: { en: "Mining", mn: "Олборлож байна", ko: "마이닝 중" },
  waiting: { en: "Waiting", mn: "Хүлээж байна", ko: "대기" },
  failed: { en: "Failed", mn: "Алдаа", ko: "실패" },
} as const;

const LIVE: MiningJobStatus[] = ["queued", "running", "paused_quota", "paused_user"];

function StatusIcon({ status }: { status: MiningJobStatus }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "error") return <AlertTriangle className="h-4 w-4 text-destructive" />;
  if (status === "paused_user" || status === "stopped") return <Pause className="h-4 w-4 text-muted-foreground" />;
  return <Clock className="h-4 w-4 text-amber-500" />;
}

/**
 * Live progress screen for the background mining service. Jobs are driven by
 * the server-side worker, so this view only reads state and sends
 * pause/resume/stop commands — closing the app never interrupts mining.
 */
export function MiningMonitor({ lang = "en" }: { lang?: Lang }) {
  const t = pickCopy(COPY, lang);
  const { isAuthenticated, userId } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fetchJobs = useServerFn(listMiningJobs);
  const setState = useServerFn(setMiningJobState);
  const qc = useQueryClient();

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["mining-jobs", userId],
    queryFn: () => fetchJobs(),
    // Poll while the tab is open; the worker keeps going when it is not.
    refetchInterval: 4_000,
    refetchOnWindowFocus: true,
    enabled: isAuthenticated && Boolean(userId),
  });

  const clearHistory = useServerFn(clearMiningHistory);
  const wipe = useMutation({
    mutationFn: () => clearHistory(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mining-jobs"] }),
  });

  const continueNowFn = useServerFn(continueMiningNow);
  const kick = useMutation({
    mutationFn: (jobId: string) => continueNowFn({ data: { jobId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mining-jobs"] }),
  });

  const control = useMutation({
    mutationFn: (input: { jobId: string; action: "pause" | "stop" | "resume" }) => setState({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mining-jobs"] }),
  });

  const { live, past } = useMemo(() => {
    const l = jobs.filter((j) => LIVE.includes(j.status));
    const p = jobs.filter((j) => !LIVE.includes(j.status)).slice(0, 12);
    return { live: l, past: p };
  }, [jobs]);

  const overall = useMemo(() => {
    if (live.length === 0) return 0;
    const total = live.reduce((s, j) => s + Math.max(1, j.totalChunks), 0);
    const done = live.reduce((s, j) => s + j.nextIndex, 0);
    return Math.round((done / total) * 100);
  }, [live]);

  const row = (job: MiningJob, controls: boolean) => {
    const pct = jobProgress(job);
    return (
      <li key={job.id} className="rounded-xl border border-border bg-card/60 p-4">
        <div className="flex items-start gap-3">
          <StatusIcon status={job.status} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{job.sourceLabel || job.sourceUrl}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pickCopy(STATUS_LABEL[job.status], lang)} · {job.nextIndex} / {job.totalChunks} {t.parts}
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{pct}%</span>
        </div>

        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              job.status === "error" ? "bg-destructive" : job.status === "done" ? "bg-emerald-500" : "bg-primary"
            }`}
            style={{ width: `${Math.max(pct, job.status === "running" ? 3 : 0)}%` }}
          />
        </div>

        {job.status === "paused_quota" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-xs text-amber-500">
              {job.retryAfter && mounted
                ? `${t.continuesAt} ${new Date(job.retryAfter).toLocaleString(lang === "mn" ? "mn-MN" : lang === "ko" ? "ko-KR" : "en-US", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`
                : t.retry}
            </p>
            {controls ? (
              <button
                type="button"
                disabled={kick.isPending}
                onClick={() => kick.mutate(job.id)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
              >
                {t.continueNow}
              </button>
            ) : null}
          </div>
        ) : null}
        {job.chunks.length > 0 ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">{t.showParts} ({job.chunks.length})</summary>
            <ul className="mt-2 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
              {jobParts(job).map((p) => (
                <li key={p.index} className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1 text-xs">
                  <span className="tabular-nums">
                    {t.part} {p.index + 1} · {formatDuration(p.start)}–{formatDuration(p.end)}
                  </span>
                  <span
                    className={
                      p.state === "done"
                        ? "text-emerald-500"
                        : p.state === "failed"
                          ? "text-destructive"
                          : p.state === "mining"
                            ? "text-primary"
                            : "text-muted-foreground"
                    }
                  >
                    {pickCopy(PART_LABEL[p.state], lang)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {job.status === "error" && job.lastError ? (
          <p className="mt-2 line-clamp-2 text-xs text-destructive">{job.lastError}</p>
        ) : null}

        {controls ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {job.status === "paused_user" || job.status === "stopped" ? (
              <button
                type="button"
                disabled={control.isPending}
                onClick={() => control.mutate({ jobId: job.id, action: "resume" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Play className="h-3.5 w-3.5" /> {t.resume}
              </button>
            ) : (
              <button
                type="button"
                disabled={control.isPending}
                onClick={() => control.mutate({ jobId: job.id, action: "pause" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                <Pause className="h-3.5 w-3.5" /> {t.pause}
              </button>
            )}
            <button
              type="button"
              disabled={control.isPending}
              onClick={() => control.mutate({ jobId: job.id, action: "stop" })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              <Square className="h-3.5 w-3.5" /> {t.stop}
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <section className="space-y-5">
      <header>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {t.refreshing}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t.sub}</p>
      </header>

      {live.length > 0 ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t.active}</span>
            <span className="tabular-nums text-muted-foreground">{overall}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${overall}%` }} />
          </div>
        </div>
      ) : null}

      {/* Same markup on the server and on the first paint in the browser, so the
          page never has to be thrown away and rebuilt while it is opening. */}
      {!mounted || isLoading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.none}</p>
      ) : null}

      {live.length > 0 ? <ul className="space-y-3">{live.map((j) => row(j, true))}</ul> : null}

      {past.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{t.finished}</h3>
            <button
              type="button"
              disabled={wipe.isPending}
              onClick={() => wipe.mutate()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-destructive/50 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t.clear}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t.kept}</p>
          <ul className="space-y-3">{past.map((j) => row(j, false))}</ul>
        </div>
      ) : null}
    </section>
  );
}
