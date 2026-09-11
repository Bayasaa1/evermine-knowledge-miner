/**
 * Zero-tech creator flow — three steps, no API keys anywhere:
 *   1. Sign in with Google (auto-links the creator's free-tier Gemini API)
 *   2. Paste a YouTube / Google Drive link (direct knowledge ingestion)
 *   3. Monetization control (Free mode or Paid subscription, switchable any time)
 * Every limit is stated up front and every failure surfaces as a plain-language
 * banner with a Retry button — never a raw log line.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Link2,
  Loader2,
  Upload,
  Youtube,
  HardDrive,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  KeyRound,
  Square,
  Pause,
  Terminal as TerminalIcon,
  BrainCircuit,
} from "lucide-react";
import { toast } from "sonner";
import { SubscriptionPanel } from "@/components/subscription-panel";
import { tr, pickCopy, useDisplayTexts, type Lang } from "@/lib/i18n";
import {
  checkDrive,
  checkFile,
  checkYoutube,
  errorKeyFor,
  MAX_DURATION_SEC,
  normalizeYoutubeUrl,
  type ImportSource,
} from "@/lib/import-sources";
import { reportFailure } from "@/lib/error-capture";
import { mineUrlSegment, mineChunk, uploadVideo, type ChunkResult } from "@/lib/gemini";
import { getCreationCategory } from "@/lib/creation-category";
import { hasGeminiOauth } from "@/lib/google-gemini-auth";
import { mineYoutubeVideo } from "@/lib/youtube-mine.functions";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";
import { idbSet, STORES } from "@/lib/store";
import { recordGrowth } from "@/lib/analytics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { saveMindVersion } from "@/lib/mind-versions.functions";
import { listVaults, updateVault } from "@/lib/cloud-vault.functions";
import { markSourceStatus, saveSourcesToVault, type SavedSource, type SourcePayload } from "@/lib/source-vault.functions";

import { publishToFeed } from "@/lib/feed";
import { ensureActiveCreatorMind } from "@/lib/mind-registry";
import { CHUNK_SECONDS } from "@/lib/chunking";
import { MiningWizard } from "@/components/mining-wizard";
import { MinerPool } from "@/components/miner-pool";
import {
  DEFAULT_MINER,
  findMiner,
  minersForCategory,
  type MinerChoice,
  type MinerId,
} from "@/lib/miner-pool";
import { runUnderstandingPass } from "@/lib/miner-reason";
import { DEFAULT_TARGET, ProjectTargetPicker, isTargetReady, type ProjectTarget } from "@/components/project-target";
import {
  addProjectContent,
  findContentByVideo,
  updateProject,
  updateProjectContent,
} from "@/lib/projects";
import { activePersona, getPersona } from "@/lib/personas";
import { youtubeId } from "@/lib/import-sources";
import {
  DEFAULT_ASSESSMENT,
  formatDuration,
  formatPublishedDate,
  type Assessment,
  type VideoMetadata,
  type MiningJob,
} from "@/lib/mining-jobs";
import { getYoutubeMetadata } from "@/lib/youtube-meta.functions";
import {
  attachMiningJobVault,
  getMiningJobResults,
  listMiningJobs,
  runNextChunk,
  setMiningJobState,
  startMiningJobs,
} from "@/lib/mining-jobs.functions";
import { withNetworkRetry } from "@/lib/retry";


const MODEL = "gemini-2.5-flash";

type Tab = "youtube" | "drive" | "file";

const googleCopy = {
  en: {
    linked: "Gemini API auto-linked",
    linkedBody: "Your Google account powers the AI mining on its free tier. Nothing else to set up — ever.",
    signedNoScope: "You're signed in, but Gemini access isn't linked yet.",
    relink: "Link Gemini API access",
    signIn: "Sign in with Google",
    connecting: "Connecting…",
    free: "Free tier · No API key · No maintenance",
    failed: "Google sign-in failed",
  },
  mn: {
    linked: "Gemini API автоматаар холбогдсон",
    linkedBody: "Таны Google бүртгэл AI шинжилгээг үнэгүй түвшиндээ хангана. Өөр ямар ч тохиргоо байхгүй.",
    signedNoScope: "Та нэвтэрсэн боловч Gemini хандалт хараахан холбогдоогүй байна.",
    relink: "Gemini API хандалт холбох",
    signIn: "Google-ээр нэвтрэх",
    connecting: "Холбож байна…",
    free: "Үнэгүй түвшин · API түлхүүргүй · Засвар үйлчилгээгүй",
    failed: "Google нэвтрэлт амжилтгүй боллоо",
  },
  ko: {
    linked: "Gemini API 자동 연결됨",
    linkedBody: "Google 계정이 무료 등급으로 AI 분석을 지원합니다. 그 외에 설정할 것은 없습니다.",
    signedNoScope: "로그인은 되어 있지만 아직 Gemini 접근이 연결되지 않았습니다.",
    relink: "Gemini API 접근 연결",
    signIn: "Google로 로그인",
    connecting: "연결하는 중…",
    free: "무료 등급 · API 키 불필요 · 유지보수 불필요",
    failed: "Google 로그인에 실패했습니다",
  },
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
      />
    </svg>
  );
}

export function GuidedStudio({ lang, creatorEmail }: { lang: Lang; creatorEmail: string }) {
  const t = useCallback((k: string) => tr(lang, k), [lang]);
  const navigate = useNavigate();
  // Arriving from Saved Minds or the Auditor means "mine this now": open the
  // mining step straight away instead of dropping the creator on step 1.
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      const wanted = window.localStorage.getItem("evermind.mine-step");
      window.localStorage.removeItem("evermind.mine-step");
      if (wanted === "3" || window.localStorage.getItem("evermind.mine-batch")) return 3;
    } catch {
      /* blocked storage just starts at step 1 */
    }
    return 1;
  });

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <ol className="flex items-center gap-2">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(n)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                step === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : step > n
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
              }`}
              aria-current={step === n ? "step" : undefined}
            >
              {n}
            </button>
            {n < 3 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        {t("step")} {step} {t("of")} 3
      </p>

      {step === 1 && (
        <StepShell title={t("step1Title")} sub={t("step1Sub")} tip={t("tipGoogle")}>
          <StepGoogle lang={lang} />
        </StepShell>
      )}
      {step === 2 && <StepUpload lang={lang} mode="save" />}
      {step === 3 && (
        <div className="space-y-8">
          <StepUpload lang={lang} mode="mine" />
          <StepShell title={t("step3Title")} sub={t("step3Sub")} tip={t("tipPrice")}>
            <SubscriptionPanel lang={lang} creatorEmail={creatorEmail} />
          </StepShell>
        </div>
      )}


      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> {t("back")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (step < 3) {
              setStep((s) => s + 1);
              return;
            }
            toast.success(pickCopy({ en: "Setup complete", mn: "Тохиргоо дууслаа", ko: "설정 완료" }, lang), {
              description: pickCopy(
                {
                  en: "Your AI mind is ready — opening your Mind Vaults.",
                  mn: "Таны AI оюун санг Mind Vaults хэсгээс харна уу.",
                  ko: "AI 마인드가 준비되었습니다 — Mind Vaults를 엽니다.",
                },
                lang,
              ),
            });
            void navigate({ to: "/vaults" });
          }}
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {step === 3 ? pickCopy({ en: "Finish", mn: "Дуусгах", ko: "완료" }, lang) : t("next")}{" "}
          <ChevronRight className="h-4 w-4" />
        </button>

      </div>
    </section>
  );
}

function StepShell({
  title,
  sub,
  tip,
  children,
}: {
  title: string;
  sub: string;
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </header>
      <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {tip}
      </p>
      {children}
    </div>
  );
}

/** Step 1 — Google sign-in unlocks the authenticated built-in mining service. */
function StepGoogle({ lang }: { lang: Lang }) {
  const t = pickCopy(googleCopy, lang);
  const { isAuthenticated, profile } = useAuth();
  // Signing in is enough: when the Google session carries no Gemini scope the app
  // falls back to the backend/platform engine, so onboarding never loops here.
  const [oauthLinked, setOauthLinked] = useState(false);
  const [checking, setChecking] = useState(true);
  const linked = oauthLinked || isAuthenticated;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setOauthLinked(await hasGeminiOauth());
      setChecking(false);
    })();
  }, [isAuthenticated]);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(t.failed, { description: result.error.message });
        return;
      }
      if (result.redirected) return; // Browser is heading to Google.
      setOauthLinked(await hasGeminiOauth());
    } catch (err) {
      toast.error(t.failed, { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }, [t]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      {checking ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t.connecting}
        </div>
      ) : linked ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" /> {t.linked}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">{t.linkedBody}</p>
          {profile && (
            <p className="text-xs text-muted-foreground">
              {profile.displayName} · {profile.email}
            </p>
          )}
          <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500">
            <KeyRound className="h-3.5 w-3.5" /> {t.free}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-muted px-4 py-3.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted/70 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
            {busy ? t.connecting : isAuthenticated ? t.relink : t.signIn}
          </button>
          <p className="text-center text-xs text-muted-foreground">{t.free}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Step 2 (`mode="save"`) — paste a link and file every video behind it, with all
 * of its details, into Saved Minds. Nothing is analysed yet.
 * Step 3 (`mode="mine"`) — pick a saved video and run the mining pipeline on it.
 */
function StepUpload({ lang, mode }: { lang: Lang; mode: "save" | "mine" }) {

  const t = useCallback((k: string) => tr(lang, k), [lang]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("youtube");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hasAuth, setHasAuth] = useState(true);
  const { isAuthenticated: signedIn, userId } = useAuth();
  const [target, setTarget] = useState<ProjectTarget>(DEFAULT_TARGET);

  // The chosen destination (persona / project / feed switch) survives a page
  // refresh, so returning to the studio never loses what the creator set up.
  const TARGET_KEY = "evermind.studio-target";
  const targetLoaded = useRef(false);
  useEffect(() => {
    if (targetLoaded.current) return;
    targetLoaded.current = true;
    try {
      const raw = window.localStorage.getItem(TARGET_KEY);
      if (raw) setTarget({ ...DEFAULT_TARGET, ...(JSON.parse(raw) as Partial<ProjectTarget>) });
    } catch {
      /* a corrupt draft just falls back to the default target */
    }
  }, []);
  useEffect(() => {
    if (!targetLoaded.current) return;
    try {
      window.localStorage.setItem(TARGET_KEY, JSON.stringify(target));
    } catch {
      /* storage full or blocked — the studio still works in memory */
    }
  }, [target]);

  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ChunkResult | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment>(DEFAULT_ASSESSMENT);
  const [meta, setMeta] = useState<VideoMetadata | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [checkpoint, setCheckpoint] = useState<{ index: number; total: number } | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueTotal, setQueueTotal] = useState(0);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [paused, setPaused] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [queue, setQueue] = useState<{ id: string; label: string; total: number }[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const stopRef = useRef(false);
  const termRef = useRef<HTMLPreElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // ---- Library step (step 2): saving links, no analysis -------------------
  const saveMode = mode === "save";
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<SavedSource[]>([]);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  /** Saved-Mind row currently selected for mining (step 3). */
  // Multi-selection: every ticked saved video is mined, one after another.
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const pickedSourceId = pickedIds[0] ?? null;
  const activeJobId = useRef<string | null>(null);
  const [pausing, setPausing] = useState(false);
  const [miner, setMiner] = useState<MinerChoice>(DEFAULT_MINER);
  /** Optional per-video AI override: mine 3 videos with Groq, 5 with Gemini. */
  const [perVideo, setPerVideo] = useState<Record<string, MinerId>>({});

  const lib = {
    saveTitle: pickCopy(
      { en: "Save to Saved Minds", mn: "Хадгалсан оюунд хадгалах", ko: "저장된 마인드에 저장" },
      lang,
    ),
    saving: pickCopy({ en: "Saving…", mn: "Хадгалж байна…", ko: "저장 중…" }, lang),
    savedOk: pickCopy({ en: "Saved to your vault", mn: "Сан руу хадгаллаа", ko: "보관함에 저장됨" }, lang),
    dupes: pickCopy({ en: "already saved", mn: "аль хэдийн хадгалсан", ko: "이미 저장됨" }, lang),
    pickTitle: pickCopy(
      { en: "Saved videos ready to mine", mn: "Олборлоход бэлэн хадгалсан видеонууд", ko: "마이닝 대기 중인 저장 영상" },
      lang,
    ),
    pickEmpty: pickCopy(
      {
        en: "Nothing saved yet — go back to step 2 and paste a link first.",
        mn: "Хадгалсан зүйл алга — 2-р алхам руу буцаж холбоос оруулна уу.",
        ko: "저장된 항목이 없습니다 — 2단계로 돌아가 링크를 붙여넣으세요.",
      },
      lang,
    ),
    selected: pickCopy({ en: "Selected", mn: "Сонгосон", ko: "선택됨" }, lang),
    viewVault: pickCopy({ en: "Open My Vaults", mn: "Миний сан нээх", ko: "내 보관함 열기" }, lang),
    saveHint: pickCopy(
      {
        en: "Paste a video or a whole playlist — every video is stored with its title, description, thumbnail and playtime. Mining happens in step 3.",
        mn: "Видео эсвэл бүтэн жагсаалт оруулна уу — гарчиг, тайлбар, зураг, хугацаа бүхэлдээ хадгалагдана. Олборлолт 3-р алхамд хийгдэнэ.",
        ko: "영상 또는 재생목록 전체를 붙여넣으세요 — 제목, 설명, 썸네일, 재생 시간이 함께 저장됩니다. 마이닝은 3단계에서 진행됩니다.",
      },
      lang,
    ),
  };

  // A handoff from Saved Minds or from the Auditor is read once, before the
  // saved-video list arrives. Auditor fixes point at videos already mined, so
  // those rows must stay selectable here too.
  const [handoff, setHandoff] = useState<{ ids: string[]; ai: Record<string, MinerId> }>({ ids: [], ai: {} });
  useEffect(() => {
    try {
      const rawIds = window.localStorage.getItem("evermind.mine-batch");
      window.localStorage.removeItem("evermind.mine-batch");
      const rawAi = window.localStorage.getItem("evermind.mine-ai");
      window.localStorage.removeItem("evermind.mine-ai");
      const ids = rawIds ? (JSON.parse(rawIds) as unknown) : null;
      const map = rawAi ? (JSON.parse(rawAi) as unknown) : null;
      const cleanIds = Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string") : [];
      const cleanAi: Record<string, MinerId> = {};
      if (map && typeof map === "object") {
        for (const [id, ai] of Object.entries(map as Record<string, unknown>)) {
          if (typeof ai === "string") cleanAi[id] = ai as MinerId;
        }
      }
      if (cleanIds.length || Object.keys(cleanAi).length) setHandoff({ ids: cleanIds, ai: cleanAi });
    } catch {
      /* a broken handoff just falls back to the newest video */
    }
  }, []);

  const { data: allSources = [], refetch: refetchPending, isFetched: sourcesFetched } = useQuery({
    queryKey: ["pending-sources", target.personaId, target.mode === "existing" ? target.projectId : null],
    queryFn: async () => {
      if (!target.personaId || target.mode !== "existing" || !target.projectId) return [];
      const rows = await listVaults({
        data: {
          personaId: target.personaId,
          projectId: target.projectId,
          scoped: true,
        },
      });
      return rows
        .filter((r) => r.kind === "source")
        .map((r) => ({ id: r.id, payload: r.payload as unknown as SourcePayload }));
    },
    enabled: signedIn && !saveMode && isTargetReady(target),
    refetchOnMount: "always",
  });

  const pendingSources = useMemo(
    () => allSources.filter((r) => r.payload?.status !== "mined" || handoff.ids.includes(r.id)),
    [allSources, handoff],
  );

  // A project switch must never retain selections from the previous project.
  // Explicit handoffs are accepted only when that source belongs to this exact
  // persona/project and is therefore present in the scoped result above.
  useEffect(() => {
    if (!sourcesFetched) return;
    const allowed = new Set(pendingSources.map((source) => source.id));
    setPickedIds((current) => current.filter((id) => allowed.has(id)));
    setPerVideo((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => allowed.has(id))) as Record<string, MinerId>,
    );
  }, [pendingSources, sourcesFetched]);

  // Mine mode: preselect the newest saved video so Start mining is usable at once.
  // A batch ticked in Saved Minds (or an Auditor fix) wins — those arrive selected.
  useEffect(() => {
    if (saveMode || pickedSourceId || pendingSources.length === 0) return;
    const handed = handoff.ids.filter((id) => pendingSources.some((p) => p.id === id));
    const ai: Record<string, MinerId> = {};
    for (const [id, m] of Object.entries(handoff.ai)) {
      if (pendingSources.some((p) => p.id === id)) ai[id] = m;
    }
    if (Object.keys(ai).length) setPerVideo((prev) => ({ ...prev, ...ai }));

    const first = pendingSources.find((p) => p.id === handed[0]) ?? pendingSources[0]!;
    setPickedIds(handed.length ? handed : [first.id]);
    setTab(first.payload.source.kind === "drive" ? "drive" : "youtube");
    setUrl(first.payload.source.url);
    const v = first.payload.video;
    const stored = (first.payload.assessment ?? {}) as Partial<Assessment>;
    setAssessment((prev) => ({
      ...prev,
      ...stored,
      sourceTitle: v.title,
      sourceDescription: v.description,
      sourcePublishedAt: formatPublishedDate(v.publishedAt, lang),
      sourceDurationLabel: v.durationLabel,
      sourceChannel: v.channel,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveMode, pendingSources, pickedSourceId, handoff]);



  /** Step 2 — store the pasted link (or the whole playlist) in Saved Minds. */
  const saveLink = useCallback(async (answers?: Assessment) => {
    setErrorKey(null);
    setSaveNote(null);
    if (!signedIn) {
      setErrorKey("errNoKey");
      return;
    }
    setSaving(true);
    try {
      const projectId = target.mode === "existing" ? target.projectId : null;
      if (!target.personaId || !projectId) throw new Error("Save and select a project before adding videos.");
      const res = await saveSourcesToVault({
        data: {
          url: url.trim(),
          personaId: target.personaId ?? null,
          projectId: projectId ?? (target.mode === "existing" ? target.projectId : null),
          assessment: (answers ?? null) as Record<string, unknown> | null,
        },
      });
      setJustSaved((prev) => [...res.saved, ...prev]);
      setSaveNote(
        `${res.saved.length} ${lib.savedOk}${res.skipped ? ` · ${res.skipped} ${lib.dupes}` : ""}`,
      );
      if (res.saved.length > 0) setUrl("");
      toast.success(lib.savedOk);
      await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
      await queryClient.invalidateQueries({ queryKey: ["pending-sources"] });
    } catch (err) {
      setErrorKey(errorKeyFor(err));
    } finally {
      setSaving(false);
    }
  }, [signedIn, url, target, queryClient, lib]);




  /** Appends one line to the live mining terminal and keeps it scrolled down. */
  const say = useCallback((line: string) => {
    setLog((prev) => [...prev, line].slice(-400));
  }, []);

  // Live display layer: terminal lines are produced in English and rendered in
  // the creator's active language without touching the stored payload.
  const localizedLog = useDisplayTexts(log);

  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);


  useEffect(() => {
    void hasGeminiOauth().then((ok) => setHasAuth(ok || signedIn));
  }, [signedIn]);

  /**
   * Zero-touch onboarding: the moment a YouTube link is pasted or typed, pull
   * its public metadata and pre-fill the wizard (and the Gemini context).
   */
  useEffect(() => {
    if (tab !== "youtube") {
      setMeta(null);
      return;
    }
    const normalized = normalizeYoutubeUrl(url);
    if (!normalized) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    setMetaLoading(true);
    const timer = setTimeout(() => {
      void getYoutubeMetadata({ data: { url: normalized } })
        .then((m) => {
          if (cancelled || !m) return;
          setMeta(m);
          setAssessment((prev) => ({
            ...prev,
            sourceTitle: m.title,
            sourceDescription: m.description,
            sourcePublishedAt: formatPublishedDate(m.publishedAt, lang),
            sourceDurationLabel: m.durationLabel || formatDuration(m.durationSec),
            sourceChannel: m.channel,
            outputLanguage: lang, // audience hint only — the stored JSON stays English
          }));
        })
        .catch(() => {
          /* metadata is a convenience — mining still works without it */
        })
        .finally(() => {
          if (!cancelled) setMetaLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setMetaLoading(false);
    };
  }, [tab, url, lang]);

  useEffect(() => {
    setAssessment((prev) => (prev.outputLanguage === lang ? prev : { ...prev, outputLanguage: lang }));
  }, [lang]);

  const resolveSource = useCallback((): ImportSource | null => {
    const check = tab === "youtube" ? checkYoutube(url) : tab === "drive" ? checkDrive(url) : file ? checkFile(file) : null;
    if (!check) {
      setErrorKey("errUrlInvalid");
      return null;
    }
    if (!check.ok) {
      setErrorKey(check.error.errorKey);
      return null;
    }
    return check.source;
  }, [tab, url, file]);

  const explain = useCallback((err: unknown, context: string) => {
    setErrorKey(errorKeyFor(err));
    // Feed the floating System Diagnostic Assistant with the raw failure.
    reportFailure("analysis", err, { url: context });
  }, []);

  /**
   * Atomically persists the mined JSON to the database (vault + version row in a
   * single transaction), then publishes to the feed.
   * Throws when the database write cannot be verified, so the caller never
   * reports "mining finished" for data that was not saved.
   */
  const persist = useCallback(
    async (mined: ChunkResult, source: ImportSource, minedByAi?: MinerId) => {
      const category = getCreationCategory();
      const title = assessment.sourceTitle?.trim() || mined.story.summary?.slice(0, 60) || source.label || "New Mind";
      const payload = {
        source: {
          kind: source.kind,
          label: source.label,
          url: "url" in source ? source.url : "",
        },
        category,
        minedAt: new Date().toISOString(),
        // Which AI produced this result — the Auditor uses it so an AI is
        // never offered as the auditor of its own work.
        ...(minedByAi ? { minedBy: minedByAi } : {}),
        result: mined,
      };

      const vault = await ensureActiveCreatorMind();
      const saved = await saveMindVersion({
        data: {
          title,
          payload: payload as never,
          releaseNotes: pickCopy(
            { en: "Mined from ", mn: "Эх сурвалж: ", ko: "마이닝 출처: " },
            lang,
          ) + source.label,
          mindId: vault.id,
        },
      });
      if (!saved?.vaultId) {
        throw new Error(
          pickCopy(
            { en: "The Mind could not be verified in the database", mn: "Оюуныг өгөгдлийн санд баталгаажуулж чадсангүй", ko: "데이터베이스에서 마인드를 확인할 수 없습니다" },
            lang,
          ),
        );
      }

      // File the video into the chosen Project (new or existing).
      const persona = target.personaId
        ? await getPersona(target.personaId).catch(() => null)
        : userId
          ? await activePersona(userId).catch(() => null)
          : null;
      const videoId = source.kind === "youtube" ? (youtubeId(source.url) ?? "") : "";
      // Re-mining a video refreshes the card it already has instead of spawning
      // a second project and a duplicate feed entry for the same source.
      const existingContent = userId ? await findContentByVideo(userId, videoId) : null;
      let projectId = target.mode === "existing" ? target.projectId : null;
      if (!projectId && existingContent) projectId = existingContent.project_id;
      if (!projectId) throw new Error("This video has no saved project. Choose its project before mining.");
      if (userId && projectId) {
        const description = assessment.sourceDescription?.slice(0, 500) || (mined.story.summary ?? "");
        const tags = mined.subconsciousness.skills.slice(0, 6);
        if (existingContent) {
          await updateProjectContent(existingContent.id, {
            title,
            description,
            tags,
            kind: target.contentKind,
            transcript: mined.transcript,
            emotionTimeline: mined.emotionTimeline,
          });
        } else {
          await addProjectContent(userId, {
            projectId,
            kind: target.contentKind,
            youtubeId: videoId,
            sourceUrl: source.kind === "youtube" ? source.url : source.label,
            title,
            description,
            tags,
            transcript: mined.transcript,
            emotionTimeline: mined.emotionTimeline,
          });
        }
        await queryClient.invalidateQueries({ queryKey: ["my-projects"] });
        await queryClient.invalidateQueries({ queryKey: ["project-content", projectId] });
      }

      // Bind the saved mind to its persona + project so vault views stay isolated.
      await updateVault({
        data: {
          id: saved.vaultId,
          personaId: target.personaId ?? persona?.id ?? null,
          projectId: projectId ?? null,
        },
      }).catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });

      const goPublic = target.publishToFeed && target.contentKind === "VISUAL_CONTENT";
      // Visual content must be instantly visible in the public feed: the parent
      // project has to be published for the public RLS read to return the clip.
      if (goPublic && projectId) {
        await updateProject(projectId, { published: true });
        await queryClient.invalidateQueries({ queryKey: ["home-feed"] });
        await queryClient.invalidateQueries({ queryKey: ["search-index"] });
      }
      if (goPublic) await publishToFeed({
        id: `pub_${saved.vaultId}`,
        mindId: vault.id,
        creator: persona?.name ?? vault.title,
        handle: persona?.handle ?? `@${vault.title.toLowerCase().replace(/\s+/g, "")}`,
        avatarUrl: persona?.avatar_url ?? null,
        title,
        description: mined.story.summary ?? "",
        category,
        src: null,
        poster: "",
        tags: mined.subconsciousness.skills.slice(0, 4),
        price: 0,
        currency: "USD",
      });
      setSavedTitle(`${title} · ${saved.version}`);
      await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
      await queryClient.invalidateQueries({ queryKey: ["mind-versions"] });
      return saved.vaultId;
    },
    [lang, queryClient, target, userId, assessment],
  );


  /** Local checkpoint + growth stats, then cloud vault / feed persistence. */
  const finishMined = useCallback(
    async (rawMined: ChunkResult, source: ImportSource): Promise<string | null> => {
      // Stage 2 — the understanding pass: the AI picked in step 3 (or an AI
      // team) thinks over the material the built-in engine extracted and adds
      // topics, beliefs and knowledge it missed. Never fatal: on any failure
      // the stage-1 result stands on its own.
      let mined = rawMined;
      let minedByAi: MinerId = miner.id;
      try {
        const category = getCreationCategory();
        // A video can carry its own AI: the row-level pick wins over the
        // studio-wide one, so one batch can mix Groq, Gemini and the rest.
        const srcUrl = source.kind === "file" ? "" : source.url;
        const row = srcUrl ? pendingSources.find((p) => p.payload.source.url === srcUrl) : undefined;
        const override = row ? perVideo[row.id] : undefined;
        const choice: MinerChoice = override ? { ...miner, id: override, team: [] } : miner;
        minedByAi = choice.id;
        const pass = await runUnderstandingPass(rawMined, choice, category, abortRef.current?.signal ?? undefined);
        mined = pass.result;
        for (const report of pass.reports) {
          setLog((prev) => [...prev, `\n> ${report.label}: ${report.status} — ${report.detail}`]);
        }
      } catch {
        /* stage-1 result stands on its own */
      }
      await idbSet(STORES.SESSION, "guided-last-mine", {
        source: source.label,
        minedAt: Date.now(),
        result: mined,
      });
      await recordGrowth({
        beliefs: mined.subconsciousness.beliefs.length,
        skills: mined.subconsciousness.skills.length,
        memories: mined.transcript.length,
      });
      return await persist(mined, source, minedByAi);
    },
    [persist, miner, perVideo, pendingSources],
  );



  /** Terminal strings follow the platform language instantly. */
  const term = useMemo(
    () => ({
      min: pickCopy({ en: "min", mn: "мин", ko: "분" }, lang),
      chunk: pickCopy({ en: "chunk", mn: "хэсэг", ko: "청크" }, lang),
      streaming: pickCopy({ en: "streaming…", mn: "дамжуулж байна…", ko: "스트리밍 중…" }, lang),
      reconnect: pickCopy(
        {
          en: "connection lost — reconnecting in 10s",
          mn: "холболт тасарлаа — 10 секундын дараа дахин холбогдоно",
          ko: "연결이 끊겼습니다 — 10초 후 재연결합니다",
        },
        lang,
      ),
      background: pickCopy(
        {
          en: "Mining runs on the server — you can close this page and come back later.",
          mn: "Олборлолт сервер дээр ажиллана — та энэ хуудсыг хааж, дараа буцаж ирж болно.",
          ko: "마이닝은 서버에서 실행됩니다 — 이 페이지를 닫고 나중에 돌아와도 됩니다.",
        },
        lang,
      ),
      stopped: pickCopy(
        {
          en: "STOPPED by user — every finished checkpoint stays saved.",
          mn: "Хэрэглэгч зогсоолоо — дуусгасан бүх хэсэг хадгалагдсан хэвээр.",
          ko: "사용자가 중지했습니다 — 완료된 모든 체크포인트는 저장된 상태로 유지됩니다.",
        },
        lang,
      ),
    }),
    [lang],
  );

  /**
   * Drives a list of server-side mining jobs to completion, one 5-minute
   * checkpoint at a time. Used both for freshly started videos and for jobs
   * picked back up after the tab was closed.
   */
  const driveJobs = useCallback(
    async (jobs: MiningJob[]) => {
      setQueueTotal(jobs.length);
      setQueue(jobs.map((j) => ({ id: j.id, label: j.sourceLabel, total: j.totalChunks })));
      say(`$ evermind mine --videos ${jobs.length}`);
      say(`  # ${term.background}`);
      jobs.forEach((j, i) =>
        say(`  [${i + 1}] ${j.sourceLabel} — ${j.totalChunks} × 5${term.min}`),
      );
      let lastMerged: ChunkResult | null = null;

      for (let q = 0; q < jobs.length; q++) {
        let current = jobs[q]!;
        const source: ImportSource & { kind: "youtube" } = {
          kind: "youtube",
          url: current.sourceUrl,
          label: current.sourceLabel,
        };
        activeJobId.current = current.id;
        setQueueIndex(q + 1);
        setStatusNote(current.sourceLabel);
        say(`\n## ${current.sourceLabel}`);
        while (
          current.status !== "done" &&
          current.status !== "paused_quota" &&
          current.status !== "error" &&
          current.status !== "stopped" &&
          current.status !== "paused_user"
        ) {
          if (stopRef.current) {
            say(`\n> ${term.stopped}`);
            return;
          }
          say(`\n### ${term.chunk} ${current.nextIndex + 1}/${current.totalChunks} — ${term.streaming}`);
          // Every checkpoint is stored server-side, so a dropped connection just
          // reconnects — mining keeps running even if the app is closed.
          const step = await withNetworkRetry(() => runNextChunk({ data: { jobId: current.id } }), {
            onRetry: (attempt) => say(`  ! ${term.reconnect} (${attempt}/3)`),
          });
          current = step.job;
          if (step.chunk) {
            say("```json");
            say(JSON.stringify(step.chunk, null, 2).slice(0, 6000));
            say("```");
          }
          if (step.merged) {
            lastMerged = step.merged;
            setResult(step.merged);
          }
          setCheckpoint({ index: current.nextIndex, total: current.totalChunks });
          setProgress(
            Math.round(((q + (current.totalChunks ? current.nextIndex / current.totalChunks : 1)) / jobs.length) * 100),
          );
          if (stopRef.current) {
            say(`\n> ${term.stopped}`);
            return;
          }
          if (step.done) break;
        }


        if (current.status === "paused_quota") {
          setPaused(
            pickCopy(
              {
                en: `Free AI quota reached. ${current.nextIndex}/${current.totalChunks} checkpoints are saved — the background worker resumes automatically after the quota resets.`,
                mn: `Gemini-ийн үнэгүй хязгаарт хүрлээ. ${current.nextIndex}/${current.totalChunks} хэсэг хадгалагдсан — квот сэргэмэгц автоматаар үргэлжилнэ.`,
                ko: `무료 AI 사용량 한도에 도달했습니다. ${current.nextIndex}/${current.totalChunks}개 체크포인트가 저장되었습니다 — 사용량이 초기화되면 자동으로 이어집니다.`,
              },
              lang,
            ),
          );
          break;
        }
        if (current.status === "error") {
          throw new Error(current.lastError ?? "Mining failed.");
        }
        if (current.status === "stopped" || current.status === "paused_user") {
          say(`\n> ${term.stopped}`);
          break;
        }
        if (lastMerged) {
          const vaultId = await finishMined(lastMerged, source);
          if (vaultId) await attachMiningJobVault({ data: { jobId: current.id, vaultId } }).catch(() => undefined);
        }
        lastMerged = null;
      }
      activeJobId.current = null;
    },
    [lang, term, finishMined, say],
  );

  /** YouTube: plan the server-side checkpoint jobs, then mine them. */
  /** Destination stored on every job so the server can file the finished Mind. */
  const jobDestination = useCallback(
    async () => ({
      personaId: target.personaId ?? null,
      projectId: target.mode === "existing" ? target.projectId : null,
      contentKind: target.contentKind,
      publishToFeed: Boolean(target.publishToFeed),
    }),
    [target],
  );

  const runYoutubeJobs = useCallback(
    async (source: ImportSource & { kind: "youtube" }, assessment: Assessment) => {
      const dest = await jobDestination();
      const jobs = await withNetworkRetry(
        () => startMiningJobs({ data: { url: source.url, assessment, ...dest } }),
        {
          onRetry: (attempt) => say(`  ! ${term.reconnect} (${attempt}/3)`),
        },
      );
      await driveJobs(jobs);
    },
    [driveJobs, say, term, jobDestination],
  );

  /**
   * Mining never dies with the tab: on return we finish saving any job the
   * background worker completed, and pick the still-running ones back up.
   * Creator-paused and stopped jobs are left exactly as they were.
   */
  const resumedRef = useRef(false);
  useEffect(() => {
    if (saveMode || !signedIn || resumedRef.current) return;
    resumedRef.current = true;
    void (async () => {
      const jobs = await listMiningJobs().catch(() => [] as MiningJob[]);
      const unsaved = jobs.filter((j) => j.status === "done" && !j.vaultId);
      for (const job of unsaved) {
        const merged = await getMiningJobResults({ data: { jobId: job.id } }).catch(() => null);
        if (!merged) continue;
        const vaultId = await finishMined(merged, {
          kind: "youtube",
          url: job.sourceUrl,
          label: job.sourceLabel,
        }).catch(() => null);
        if (vaultId) await attachMiningJobVault({ data: { jobId: job.id, vaultId } }).catch(() => undefined);
      }
      const live = jobs.filter(
        (j) => j.status === "queued" || j.status === "running" || j.status === "paused_quota",
      );
      if (live.length === 0) return;
      stopRef.current = false;
      setBusy(true);
      try {
        await driveJobs(live);
      } catch {
        /* the background worker keeps the job alive regardless */
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveMode, signedIn]);

  const run = useCallback(
    async (assessment: Assessment) => {
      setErrorKey(null);
      setResult(null);
      setSavedTitle(null);
      setPaused(null);
      setCheckpoint(null);
      setQueueIndex(0);
      setQueueTotal(0);
      setQueue([]);
      setLog([]);
      stopRef.current = false;
      const source = resolveSource();
      if (!source) return;

      if (!signedIn) {
        setErrorKey("errNoKey");
        return;
      }
      // Files and Drive retain the creator's optional BYO path. Public YouTube
      // videos use the authenticated built-in AI service and need no provider token.
      const key = "";

      // The destination must exist before any work starts, otherwise the button
      // would spin forever with nothing to file the result into.
      if (!isTargetReady(target)) {
        setErrorKey("errNoTarget");
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setProgress(5);


      try {

        if (source.kind === "youtube") {
          // Every ticked saved video becomes its own server-side job, and they
          // are mined one after another without touching this page again.
          const picked = pendingSources.filter(
            (p) => pickedIds.includes(p.id) && p.payload.source.kind === "youtube",
          );
          const urls = picked.length ? picked.map((p) => p.payload.source.url) : [source.url];
          if (urls.length === 1) {
            await runYoutubeJobs({ ...source, url: urls[0]! }, assessment);
          } else {
            const jobs: MiningJob[] = [];
            const dest = await jobDestination();
            for (const u of urls) {
              jobs.push(
                ...(await withNetworkRetry(() => startMiningJobs({ data: { url: u, assessment, ...dest } }))),
              );
            }
            await driveJobs(jobs);
          }
        } else {
          const mined =
            source.kind === "file"
              ? await mineChunk(
                  key,
                  MODEL,
                  await uploadVideo(key, source.file, { signal: controller.signal }),
                  0,
                  CHUNK_SECONDS,
                  controller.signal,
                  getCreationCategory(),
                )
              : await mineUrlSegment(
                  key,
                  MODEL,
                  source.url,
                  0,
                  CHUNK_SECONDS,
                  controller.signal,
                  getCreationCategory(),
                );
          setProgress(100);
          setResult(mined);
          await finishMined(mined, source);
        }
        // The saved library entry is now mined — it leaves the "ready to mine" list.
        const doneIds = pickedIds.length ? pickedIds : pickedSourceId ? [pickedSourceId] : [];
        if (doneIds.length && !stopRef.current) {
          for (const id of doneIds) {
            await markSourceStatus({ data: { id, status: "mined" } }).catch(() => undefined);
          }
          setPickedIds([]);
          await refetchPending();
          await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          setProgress(0);
        } else {
          explain(err, `${source.kind} import — ${source.label}`);
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [
      resolveSource,
      explain,
      signedIn,
      runYoutubeJobs,
      driveJobs,
      finishMined,
      pickedIds,
      pickedSourceId,
      pendingSources,
      refetchPending,
      queryClient,
      target,

    ],

  );


  const ready = isTargetReady(target);
  const gate = saveMode ? ready : true;

  return (
    <StepShell
      title={
        saveMode
          ? t("step2Title")
          : pickCopy({ en: "Mine your saved videos", mn: "Хадгалсан видеогоо олборлох", ko: "저장한 영상 마이닝" }, lang)
      }
      sub={saveMode ? t("step2Sub") : lib.pickTitle}
      tip={saveMode ? lib.saveHint : t("tipSource")}
    >
      {saveMode && <ProjectTargetPicker lang={lang} value={target} onChange={setTarget} />}

      {!saveMode && (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{lib.pickTitle}</p>
            {pendingSources.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPickedIds(pendingSources.map((s) => s.id))}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {pickCopy({ en: "Select all", mn: "Бүгдийг сонгох", ko: "전체 선택" }, lang)}
                </button>
                <button
                  type="button"
                  onClick={() => setPickedIds([])}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {pickCopy({ en: "Clear", mn: "Цэвэрлэх", ko: "해제" }, lang)}
                </button>
              </div>
            )}
          </div>
          {pendingSources.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{lib.pickEmpty}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {pendingSources.map((s) => {
                const v = s.payload.video;
                const on = pickedIds.includes(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        // Tick as many videos as you like — they mine one by one.
                        const next = on ? pickedIds.filter((id) => id !== s.id) : [...pickedIds, s.id];
                        setPickedIds(next);
                        setErrorKey(null);
                        if (on) return;
                        setTab(s.payload.source.kind === "drive" ? "drive" : "youtube");
                        setUrl(s.payload.source.url);
                        const stored = (s.payload.assessment ?? {}) as Partial<Assessment>;
                        setAssessment((prev) => ({
                          ...prev,
                          ...stored,
                          sourceTitle: v.title,
                          sourceDescription: v.description,
                          sourcePublishedAt: formatPublishedDate(v.publishedAt, lang),
                          sourceDurationLabel: v.durationLabel,
                          sourceChannel: v.channel,
                        }));
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                        on ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      {v.thumbnail ? (
                        <img
                          src={v.thumbnail}
                          alt=""
                          loading="lazy"
                          className="h-12 w-20 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Youtube className="h-4 w-4 text-muted-foreground" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {v.title || s.payload.source.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[v.channel, v.durationLabel].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] ${
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                        }`}
                        aria-hidden
                      >
                        {on ? "✓" : ""}
                      </span>
                    </button>
                    {on && (
                      <label className="mt-1 flex items-center gap-2 pl-2 text-xs text-muted-foreground">
                        {pickCopy({ en: "AI for this video", mn: "Энэ видеоны AI", ko: "이 영상의 AI" }, lang)}
                        <select
                          value={perVideo[s.id] ?? ""}
                          onChange={(e) =>
                            setPerVideo((prev) => {
                              const next = { ...prev };
                              if (e.target.value) next[s.id] = e.target.value as MinerId;
                              else delete next[s.id];
                              return next;
                            })
                          }
                          className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
                        >
                          <option value="">
                            {pickCopy(
                              { en: "Same as below", mn: "Доорхтой ижил", ko: "아래와 동일" },
                              lang,
                            )}
                          </option>
                          {minersForCategory(getCreationCategory())
                            .filter((m) => m.id !== "custom")
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className={`mt-4 rounded-xl border border-border bg-card p-4 sm:p-5 ${gate ? "" : "pointer-events-none opacity-40"}`} aria-disabled={!gate}>
        {saveMode && (
        <>
        <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1">
          {(
            [
              ["youtube", t("sourceYoutube"), Youtube],
              ["drive", t("sourceDrive"), HardDrive],
              ...(saveMode ? [] : [["file", t("sourceFile"), Upload] as const]),
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setErrorKey(null);
              }}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>


        {tab === "file" ? (
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                setErrorKey(null);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              <Upload className="h-5 w-5" />
              {file ? file.name : t("chooseFile")}
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={url}
              onChange={(e) => {
                setErrorKey(null);
                setUrl(e.target.value);
              }}
              onBlur={() => {
                if (tab !== "youtube") return;
                const fixed = normalizeYoutubeUrl(url);
                if (fixed && fixed !== url.trim()) setUrl(fixed);
              }}
              placeholder={tab === "youtube" ? t("urlPlaceholder") : t("drivePlaceholder")}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
        </>
        )}

        {!hasAuth && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
            <AlertCircle className="h-4 w-4 shrink-0" /> {t("errNoKey")}
          </p>
        )}

        {saveMode ? (
          <div className="mt-4 space-y-3">
            {(metaLoading || meta) && (
              <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
                {metaLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  meta?.thumbnail && (
                    <img src={meta.thumbnail} alt="" loading="lazy" className="h-14 w-24 rounded-lg object-cover" />
                  )
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{meta?.title ?? ""}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[meta?.channel, meta?.durationLabel].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            )}
            <MiningWizard
              lang={lang}
              value={assessment}
              onChange={setAssessment}
              busy={saving || !url.trim()}
              meta={meta}
              metaLoading={metaLoading}
              startLabel={saving ? lib.saving : lib.saveTitle}
              onStart={(a) => {
                setAssessment(a);
                void saveLink(a);
              }}
            />
            {saveNote && <p className="text-xs text-emerald-500">{saveNote}</p>}
            {justSaved.length > 0 && (
              <ul className="space-y-2">
                {justSaved.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5">
                    {s.thumbnail && (
                      <img src={s.thumbnail} alt="" loading="lazy" className="h-12 w-20 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{s.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[s.channel, s.durationLabel].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {justSaved.length > 0 && (
              <button
                type="button"
                onClick={() => void navigate({ to: "/vaults" })}
                className="rounded-xl border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent"
              >
                {lib.viewVault}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <MinerPool lang={lang} onChange={setMiner} category={getCreationCategory()} />
            <button
              type="button"
              onClick={() => void run(assessment)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pickCopy({ en: "Start mining", mn: "Шинжилгээ эхлүүлэх", ko: "분석 시작" }, lang)}
            </button>
            {!url.trim() && (
              <p className="text-xs text-amber-500">
                {pickCopy(
                  {
                    en: "Pick one of your saved videos above first.",
                    mn: "Эхлээд дээрх хадгалсан видеонуудаас нэгийг сонгоно уу.",
                    ko: "먼저 위에서 저장된 영상을 선택하세요.",
                  },
                  lang,
                )}
              </p>
            )}
          </div>
        )}



        {busy && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pausing}
                onClick={() => {
                  setPausing(true);
                  stopRef.current = true;
                  abortRef.current?.abort();
                  const id = activeJobId.current;
                  if (id) void setMiningJobState({ data: { jobId: id, action: "pause" } }).catch(() => undefined);
                  setLog((prev) => [
                    ...prev,
                    `\n> ${pickCopy(
                      {
                        en: "PAUSED — finished checkpoints are saved. Press Start mining to continue.",
                        mn: "Түр зогсоолоо — дуусгасан хэсгүүд хадгалагдсан. Үргэлжлүүлэхийн тулд дахин эхлүүлнэ үү.",
                        ko: "일시중지 — 완료된 체크포인트는 저장되었습니다. 다시 시작하면 이어집니다.",
                      },
                      lang,
                    )}`,
                  ]);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <Pause className="h-4 w-4" />
                {pickCopy({ en: "Pause", mn: "Түр зогсоох", ko: "일시중지" }, lang)}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopRef.current = true;
                  abortRef.current?.abort();
                  const id = activeJobId.current;
                  if (id) void setMiningJobState({ data: { jobId: id, action: "stop" } }).catch(() => undefined);
                  setLog((prev) => [...prev, `\n> ${t("stopRequested")}`]);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:opacity-90"
              >
                <Square className="h-4 w-4" /> {t("stopMining")}
              </button>
            </div>
          </div>
        )}

        {queue.length > 0 && (
          <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("queueTitle")} · {queue.length}
            </p>
            <ol className="mt-2 space-y-1">
              {queue.map((q, i) => (
                <li
                  key={q.id}
                  className={`flex items-center justify-between gap-3 text-xs ${
                    i + 1 === queueIndex ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <span className="truncate">
                    {i + 1}. {q.label}
                  </span>
                  <span className="shrink-0">{q.total} × 5min</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {log.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-[hsl(var(--background))]">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <TerminalIcon className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">{t("terminalTitle")}</span>
              {busy && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-primary" />}
            </div>
            <pre
              ref={termRef}
              className="max-h-72 overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
            >
              {localizedLog.join("\n")}
            </pre>
          </div>
        )}

        {paused && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {paused}
          </p>
        )}


        {busy && (
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("analyzing")} {progress}%
              {checkpoint
                ? ` · ${pickCopy({ en: "chunk", mn: "хэсэг", ko: "구간" }, lang)} ${checkpoint.index}/${checkpoint.total}`
                : ""}
              {queueTotal > 1
                ? ` · ${pickCopy({ en: "video", mn: "видео", ko: "영상" }, lang)} ${queueIndex}/${queueTotal}`
                : ""}
              {statusNote ? ` · ${statusNote}` : ""}
            </p>

          </div>
        )}


      </div>

      {errorKey && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 ring-1 ring-amber-500/30">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{t(errorKey)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("errAssistantHint")}</p>
          </div>
          <button
            type="button"
            onClick={() => void run(assessment)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {t("diagTryAgain")}
          </button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("successTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {savedTitle
                ? pickCopy(
                    {
                      en: `"${savedTitle}" was saved to your account and published.`,
                      mn: `"${savedTitle}" таны бүртгэлд хадгалагдаж, нийтлэгдлээ.`,
                      ko: `"${savedTitle}"이(가) 계정에 저장되고 게시되었습니다.`,
                    },
                    lang,
                  )
                : t("successBody")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void navigate({ to: "/vaults" })}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {pickCopy({ en: "View in My Vaults", mn: "Миний сангаас харах", ko: "내 보관함에서 보기" }, lang)}
              </button>
              <button
                type="button"
                onClick={() => void navigate({ to: "/" })}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {pickCopy({ en: "View on Feed", mn: "Фийд дээр харах", ko: "피드에서 보기" }, lang)}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {pickCopy(
                {
                  en: "Extracted Knowledge & Motion Trajectories",
                  mn: "Задлан авсан мэдлэг ба хөдөлгөөний зам",
                  ko: "추출된 지식 및 동작 궤적",
                },
                lang,
              )}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  [result.knowledgeNodes.length, pickCopy({ en: "Knowledge nodes", mn: "Мэдлэгийн зангилаа", ko: "지식 노드" }, lang)],
                  [
                    result.knowledgeNodes.filter((n) => n.spatial_action).length,
                    pickCopy({ en: "Trajectories", mn: "Хөдөлгөөний зам", ko: "궤적" }, lang),
                  ],
                  [result.subconsciousness.skills.length, pickCopy({ en: "Skills", mn: "Ур чадвар", ko: "스킬" }, lang)],
                  [result.transcript.length, pickCopy({ en: "Transcript lines", mn: "Ярианы мөр", ko: "스크립트 줄" }, lang)],
                ] as const
              ).map(([n, label]) => (
                <div key={label} className="rounded-lg border border-border bg-background p-2.5">
                  <p className="text-lg font-semibold text-foreground">{n}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {result.knowledgeNodes.length > 0 ? (
              <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                {result.knowledgeNodes.slice(0, 20).map((n, i) => (
                  <li key={i} className="rounded-lg border border-border bg-background p-3">
                    <details>
                      <summary className="cursor-pointer list-none">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
                            {n.timestamp_start}–{n.timestamp_end}
                          </span>
                          <span className="text-sm font-medium text-foreground">{n.concept_title}</span>
                          <span className="ml-auto text-[11px] text-muted-foreground">
                            {Math.round(n.confidence_score * 100)}%
                          </span>
                        </span>
                      </summary>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{n.detailed_explanation}</p>
                      {n.spatial_action && (
                        <p className="mt-2 rounded-md bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                          {n.spatial_action.object_name} · {n.spatial_action.grasp_type} · xyz[
                          {n.spatial_action.coordinates_xyz.map((v) => v.toFixed(2)).join(", ")}] · vec[
                          {n.spatial_action.movement_vector.map((v) => v.toFixed(2)).join(", ")}]
                        </p>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
                {result.subconsciousness.beliefs.slice(0, 4).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
        {(() => {
          const m = findMiner(miner.id);
          const limits = m?.limits;
          const cat = getCreationCategory();
          const catFit =
            cat === "robot"
              ? pickCopy(
                  { en: "For a Robot Brain this AI contributes vision reasoning — trajectories, grasp and movement analysis.", mn: "Роботын тархинд энэ AI харааны сүүж өгнө — траектори, барих, хөдөлгөөний шинжилгээ.", ko: "로봇 브레인에는 이 AI가 시각 추론을 제공합니다 — 궤적, 파지, 움직임 분석." },
                  lang,
                )
              : cat === "voice"
                ? pickCopy(
                    { en: "For a Voice Agent this AI contributes audio understanding — speech, tone and pacing.", mn: "Дуут агентэд энэ AI аудио ойлголт өгнө — яриа, өнгө, хэмнэл.", ko: "보이스 에이전트에는 이 AI가 오디오 이해를 제공합니다 — 음성, 톤, 속도." },
                    lang,
                  )
                : pickCopy(
                    { en: "For this Mind this AI thinks over the extracted transcript and emotion notes, adding topics, beliefs and knowledge.", mn: "Энэ Оюунд энэ AI гаргаж авсан транскрипт, сэтгэл хөдлөлийн тэмдэглэл дээр сэтгэн шинжилж, сэдэв, итгэл, мэдлэг нэмнэ.", ko: "이 마인드에는 이 AI가 추출된 대본과 감정 노트를 추론해 주제, 신념, 지식을 추가합니다." },
                    lang,
                  );
          return (
            <>
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("limitsTitle")}
                {m ? ` · ${m.label}` : ""}
              </p>
              {m && <p className="mb-2 text-xs text-muted-foreground">{catFit}</p>}
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <Youtube className="mt-0.5 h-4 w-4 shrink-0" /> {limits?.youtube ?? t("limitYoutube")}
                </li>
                <li className="flex gap-2">
                  <HardDrive className="mt-0.5 h-4 w-4 shrink-0" /> {limits?.files ?? t("limitDrive")}
                </li>
                <li className="flex gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" /> {limits?.langs ?? t("limitLangs")}
                </li>
                {m && (
                  <li className="flex gap-2">
                    <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <span className="font-medium text-foreground">{m.label}:</span> {m.capability}{" "}
                      <span className="text-muted-foreground/80">{m.downside}</span>
                    </span>
                  </li>
                )}
              </ul>
            </>
          );
        })()}
      </div>

    </StepShell>
  );
}
