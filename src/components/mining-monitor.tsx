import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pause, Play, Square, CheckCircle2, AlertTriangle, Clock, Trash2, Zap, ArrowUpToLine } from "lucide-react";

import { clearMiningHistory, continueMiningNow, prioritizeMiningJob, resumeStuckMiningJobs, listMiningJobs, runNextChunk, setMiningJobState } from "@/lib/mining-jobs.functions";
import { formatDuration, jobParts, jobProgress, orderMiningQueue, type MiningJob, type MiningJobStatus } from "@/lib/mining-jobs";
import { pickCopy, type Lang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { nativePlaybackUrls } from "@/lib/native-mining.functions";

const COPY = {
  en: {
    title: "Live mining",
    sub: "Checkpoints are saved. Keep an app tab open to continue mining; uploaded videos need their upload tab.",
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
    wake: "⚡ Resume abandoned / delayed jobs",
    kept: "Finished runs are only history — clearing them never deletes your mined Minds.",
  },
  mn: {
    title: "Шууд мining",
    sub: "Хэсгүүд хадгалагдана. Майнинг үргэлжлүүлэхийн тулд аппын цонхоо, хуулсан видеонд хуулах цонхоо нээлттэй байлгаарай.",
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
    wake: "⚡ Зогссон / хойшилсон ажлыг сэргээх",
    kept: "Дууссан бичлэгүүд зөвхөн түүх — цэвэрлэсэн ч олборлосон Mind устахгүй.",
  },
  ko: {
    title: "실시간 마이닝",
    sub: "체크포인트는 저장됩니다. 계속하려면 앱 탭을 열어 두세요. 업로드 영상은 업로드 탭이 필요합니다.",
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
    wake: "⚡ 중단·지연된 작업 재개",
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
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />;
  if (status === "done") return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />;
  if (status === "error") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />;
  if (status === "paused_user" || status === "stopped") return <Pause className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />;
}

/**
 * Live progress screen for the background mining service. Jobs are driven by
 * the server-side worker, so this view only reads state and sends
 * pause/resume/stop commands — closing the app never interrupts mining.
 */
export function MiningMonitor({ lang = "en", embedded = false }: { lang?: Lang; embedded?: boolean }) {
  const t = pickCopy(COPY, lang);
  const { isAuthenticated, userId } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const fetchJobs = useServerFn(listMiningJobs);
  const setState = useServerFn(setMiningJobState);
  const qc = useQueryClient();
  const playback = useServerFn(nativePlaybackUrls);
  const [playbackUrl, setPlaybackUrl] = useState<{ id: string; url: string } | null>(null);
  const [playbackError, setPlaybackError] = useState("");
  useEffect(() => { setPlaybackUrl(null); setPlaybackError(""); }, [userId]);

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

  const wakeFn = useServerFn(resumeStuckMiningJobs);
  const step = useServerFn(runNextChunk);
  const wake = useMutation({
    mutationFn: async () => {
      const result = await wakeFn();
      const queue = await fetchJobs();
      const job = queue.find((j) => j.status === "queued" && j.sourceKind !== "upload" && j.nextIndex < j.totalChunks);
      if (job) await step({ data: { jobId: job.id, respectLease: true } });
      return result;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mining-jobs"] }),
  });

  const activeJob = jobs.find((j) => j.status === "running" && j.nextIndex < j.totalChunks) ?? null;
  const mineNext = useMutation({
    mutationFn: async () => {
      const queue = await fetchJobs();
      const job = queue.find(
        (j) => (j.status === "queued" || j.status === "paused_quota" || j.status === "error") &&
          j.sourceKind !== "upload" && j.nextIndex < j.totalChunks,
      );
      if (job) await step({ data: { jobId: job.id, respectLease: true } });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mining-jobs"] }),
  });

  const continueNowFn = useServerFn(continueMiningNow);
  const kick = useMutation({
    mutationFn: async (jobId: string) => {
      await continueNowFn({ data: { jobId } });
      if (jobs.find((j) => j.id === jobId)?.sourceKind !== "upload") await step({ data: { jobId, respectLease: true } });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mining-jobs"] }),
  });

  const prioritizeFn = useServerFn(prioritizeMiningJob);
  const promote = useMutation({
    mutationFn: (jobId: string) => prioritizeFn({ data: { jobId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mining-jobs"] }),
  });

  const control = useMutation({
    mutationFn: (input: { jobId: string; action: "pause" | "stop" | "resume" }) => setState({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mining-jobs"] }),
  });

  const { live, past } = useMemo(() => {
    const l = orderMiningQueue(jobs.filter((j) => LIVE.includes(j.status)));
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
    const iconBtn = "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";
    const when = job.status === "paused_quota" && job.retryAfter && mounted
      ? new Date(job.retryAfter).toLocaleTimeString(lang === "mn" ? "mn-MN" : lang === "ko" ? "ko-KR" : "en-US", { hour: "2-digit", minute: "2-digit" })
      : "";
    return (
      <li key={job.id} className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <StatusIcon status={job.status} />
          <p className="min-w-0 flex-1 truncate text-xs font-medium" title={job.lastError ?? undefined}>{job.sourceLabel || job.sourceUrl}</p>
          {job.status === "paused_quota" ? (
            <span className="shrink-0 text-[11px] text-amber-500">{when ? `⏳ ${when}` : pickCopy(STATUS_LABEL[job.status], lang)}</span>
          ) : null}
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{job.nextIndex}/{job.totalChunks} · {pct}%</span>
          {controls && job.status === "paused_quota" ? (
            <button type="button" disabled={kick.isPending} onClick={() => kick.mutate(job.id)} className={iconBtn} title={t.continueNow} aria-label={t.continueNow}><Zap className="h-3.5 w-3.5" /></button>
          ) : null}
          {controls && job.status !== "running" && job.status !== "paused_user" ? (
            <button type="button" disabled={promote.isPending} onClick={() => promote.mutate(job.id)} className={iconBtn} title={pickCopy({ en: "Mine next", mn: "Дараагийнх нь болгох", ko: "다음에 마이닝" }, lang)} aria-label={pickCopy({ en: "Mine next", mn: "Дараагийнх нь болгох", ko: "다음에 마이닝" }, lang)}><ArrowUpToLine className="h-3.5 w-3.5" /></button>
          ) : null}
          {job.sourceKind === "upload" ? (
            <button type="button" className={iconBtn} aria-label="Play" onClick={() => void playback({ data: { jobId: job.id } }).then((r) => { setPlaybackError(""); setPlaybackUrl({ id: job.id, url: r.url }); }).catch((e: unknown) => setPlaybackError(e instanceof Error ? e.message : String(e)))}><Play className="h-3.5 w-3.5" /></button>
          ) : null}
          {controls ? (
            <>
              {job.status === "paused_user" || job.status === "stopped" ? (
                <button type="button" disabled={control.isPending} onClick={() => control.mutate({ jobId: job.id, action: "resume" })} className={iconBtn} title={t.resume} aria-label={t.resume}><Play className="h-3.5 w-3.5" /></button>
              ) : (
                <button type="button" disabled={control.isPending} onClick={() => control.mutate({ jobId: job.id, action: "pause" })} className={iconBtn} title={t.pause} aria-label={t.pause}><Pause className="h-3.5 w-3.5" /></button>
              )}
              <button type="button" disabled={control.isPending} onClick={() => control.mutate({ jobId: job.id, action: "stop" })} className={`${iconBtn} hover:text-destructive`} title={t.stop} aria-label={t.stop}><Square className="h-3.5 w-3.5" /></button>
            </>
          ) : null}
        </div>
        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              job.status === "error" ? "bg-destructive" : job.status === "done" ? "bg-primary/60" : "bg-primary"
            }`}
            style={{ width: `${Math.max(pct, job.status === "running" ? 3 : 0)}%` }}
          />
        </div>
        {job.chunks.length > 0 ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-[11px] text-muted-foreground">{t.showParts} ({job.chunks.length})</summary>
            <ul className="mt-1 grid max-h-40 grid-cols-2 gap-0.5 overflow-y-auto sm:grid-cols-3">
              {jobParts(job).map((p) => (
                <li key={p.index} className="flex items-center justify-between rounded bg-muted/50 px-1.5 py-0.5 text-[10px]">
                  <span className="tabular-nums">{p.index + 1} · {formatDuration(p.start)}</span>
                  <span className={p.state === "done" ? "text-primary" : p.state === "failed" ? "text-destructive" : "text-muted-foreground"}>
                    {pickCopy(PART_LABEL[p.state], lang)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {playbackUrl?.id === job.id ? <video src={playbackUrl.url} controls playsInline className="mt-1 aspect-video w-full bg-muted" /> : null}
        {playbackError && playbackUrl?.id === job.id ? <p className="text-[11px] text-destructive">{playbackError}</p> : null}
      </li>
    );
  };

  return (
    <section className="space-y-3">
      <header>
        {!embedded && <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{t.title}</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            {t.refreshing}
          </span>
        </div>}
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

      <button
        type="button"
        disabled={wake.isPending}
        onClick={() => wake.mutate()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
      >
        {wake.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {t.wake}
        {wake.data ? ` (${wake.data.count})` : ""}
      </button>
      <button
        type="button"
        disabled={mineNext.isPending}
        onClick={() => mineNext.mutate()}
        className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        {mineNext.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {lang === "mn" ? "▶️ Дараагийн хэсгийг одоо олборлох" : lang === "ko" ? "▶️ 다음 파트 지금 마이닝" : "▶️ Mine Next Part Now"}
      </button>
      {activeJob ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          {activeJob.sourceLabel} · {t.chunk} {activeJob.nextIndex + 1}/{activeJob.totalChunks}
        </p>
      ) : null}

      {live.length > 0 ? <ul className="divide-y divide-border rounded-lg border border-border">{live.map((j) => row(j, true))}</ul> : null}

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
          <ul className="divide-y divide-border rounded-lg border border-border">{past.map((j) => row(j, false))}</ul>
        </div>
      ) : null}
    </section>
  );
}
