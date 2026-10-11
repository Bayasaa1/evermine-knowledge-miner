/**
 * Purpose-aware creator flow:
 *   1. Choose what to create
 *   2. Sign in or create an account
 *   3. Add the required Gemini key and optional specialist AIs
 *   4. Add and mine videos
 *   5. Set access and pricing
 * Every limit is stated up front and every failure surfaces as a plain-language
 * banner with a Retry button — never a raw log line.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { scopedKey } from "@/lib/user-scope";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { miningDriver } from "@/lib/mining-driver";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Link2,
  Loader2,
  Upload,
  Youtube,
  HardDrive,
  Globe2,
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
import { CategoryList } from "@/components/create-wizard";
import { tr, pickCopy, useDisplayTexts, type Lang } from "@/lib/i18n";
import {
  checkDrive,
  checkLink,
  otherVideo,
  checkFile,
  checkYoutube,
  errorKeyFor,
  normalizeYoutubeUrl,
  type ImportSource,
} from "@/lib/import-sources";
import { reportFailure } from "@/lib/error-capture";
import { mineUrlSegment, mineChunk, uploadVideo, type ChunkResult } from "@/lib/gemini";
import {
  CATEGORY_LABELS,
  getCreationCategory,
  setCreationCategory,
  type CreationCategory,
} from "@/lib/creation-category";
import { mineYoutubeVideo } from "@/lib/youtube-mine.functions";
import { useAuth } from "@/hooks/use-auth";
import { loadApiKeys } from "@/lib/keystore";
import { idbSet, STORES } from "@/lib/store";
import { recordGrowth } from "@/lib/analytics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { saveMindVersion } from "@/lib/mind-versions.functions";
import { listVaults, updateVault } from "@/lib/cloud-vault.functions";
import { markSourceStatus, saveSourcesToVault, type SavedSource, type SourcePayload } from "@/lib/source-vault.functions";

import { publishToFeed } from "@/lib/feed";
import { ensureActiveCreatorMind } from "@/lib/mind-registry";
import { CHUNK_SECONDS } from "@/lib/chunking";
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
  defaultAssessmentFor,
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
import { AiKeysCard } from "@/components/ai-keys-card";
import { getUserAiKeyStatus } from "@/lib/user-ai-keys.functions";
import { SubtitleUpload } from "@/components/subtitle-upload";


const MODEL = "gemini-3.1-flash-lite";

type Tab = "youtube" | "drive" | "link" | "file";


export function GuidedStudio({ lang }: { lang: Lang; creatorEmail: string }) {
  const t = useCallback((k: string) => tr(lang, k), [lang]);
  const navigate = useNavigate();
  // Arriving from Saved Minds or the Auditor means "mine this now": open the
  // mining step straight away instead of dropping the creator on step 1.
  const [step, setStep] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      const wanted = window.localStorage.getItem("evermind.mine-step");
      window.localStorage.removeItem("evermind.mine-step");
      if (wanted === "3" || window.localStorage.getItem("evermind.mine-batch")) return 5;
    } catch {
      /* blocked storage just starts at step 1 */
    }
    return 1;
  });
  const { isAuthenticated } = useAuth();
  const loadAccountKeys = useServerFn(getUserAiKeyStatus);
  const [category, setCategory] = useState<CreationCategory>(() => getCreationCategory());
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  // Step 1 mining rules are shared by steps 4 (saved with the video) and 5 (mining).
  const RULES_KEY = "evermind.mining-rules";
  const [rules, setRules] = useState<Assessment>(() => {
    const base = defaultAssessmentFor(getCreationCategory());
    if (typeof window === "undefined") return base;
    try {
      const raw = window.localStorage.getItem(RULES_KEY);
      if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Assessment>) };
    } catch {
      /* corrupt draft falls back to defaults */
    }
    return base;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    } catch {
      /* storage blocked */
    }
  }, [rules]);
  const changeCategory = useCallback((c: CreationCategory) => {
    setCategory(c);
    setRules((prev) => ({ ...defaultAssessmentFor(c), speakerIdentity: prev.speakerIdentity, customInstructions: prev.customInstructions }));
  }, []);
  // Sign-in and key steps disappear once they are done.
  const visible = useMemo(
    () => [1, ...(isAuthenticated ? [] : [2]), ...(isAuthenticated && hasGeminiKey ? [] : [3]), 4, 5],
    [isAuthenticated, hasGeminiKey],
  );
  const position = Math.max(0, visible.indexOf(step));

  useEffect(() => {
    if (!isAuthenticated) {
      setHasGeminiKey(false);
      return;
    }
    void loadAccountKeys()
      .then((keys) => setHasGeminiKey(keys.some((key) => key.provider === "gemini" && key.enabled && key.status !== "invalid")))
      .catch(() => setHasGeminiKey(false));
  }, [isAuthenticated, loadAccountKeys, step]);

  const continueSetup = useCallback(async () => {
    // Already signed in? Never make the creator sit through the sign-in step.
    if (step === 2 && !isAuthenticated) {
      void navigate({ to: "/auth", search: { next: "/creator" } });
      return;
    }
    if (step === 3) {
      const keys = await loadAccountKeys();
      if (!keys.some((key) => key.provider === "gemini" && key.enabled && key.status !== "invalid")) {
        toast.error(pickCopy({ en: "Add and test a Gemini key first.", mn: "Эхлээд Gemini түлхүүр нэмж шалгана уу.", ko: "먼저 Gemini 키를 추가하고 테스트하세요." }, lang));
        return;
      }
      setHasGeminiKey(true);
    }
    if (step < 5) {
      const signedIn = isAuthenticated;
      const keyed = step === 3 ? true : hasGeminiKey;
      const order = [1, ...(signedIn ? [] : [2]), ...(signedIn && keyed ? [] : [3]), 4, 5];
      setStep(order.find((n) => n > step) ?? 5);
      return;
    }
    toast.success(pickCopy({ en: "Setup complete", mn: "Тохиргоо дууслаа", ko: "설정 완료" }, lang));
    void navigate({ to: "/vaults" });
  }, [hasGeminiKey, isAuthenticated, lang, loadAccountKeys, navigate, step]);

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <ol className="flex items-center gap-2">
        {visible.map((n, i) => (
          <li key={n} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(n)}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors sm:h-8 sm:w-8 sm:text-sm ${
                step === n
                  ? "border-primary bg-primary text-primary-foreground"
                  : step > n
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
              }`}
              aria-current={step === n ? "step" : undefined}
            >
              {i + 1}
            </button>
            {i < visible.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <p className="text-xs uppercase tracking-widest text-muted-foreground">
        {t("step")} {position + 1} {t("of")} {visible.length}
      </p>

      {step === 1 && (
        <StepShell title={t("step1Title")} sub={t("step1Sub")}>
          <div className="space-y-4">
            <StepCategory lang={lang} value={category} onChange={changeCategory} />
          </div>
        </StepShell>
      )}
      {step === 2 && (
        <StepShell
          title={
            isAuthenticated
              ? pickCopy({ en: "You're signed in", mn: "Та нэвтэрсэн байна", ko: "로그인되어 있습니다" }, lang)
              : t("step2Title")
          }
          sub={
            isAuthenticated
              ? pickCopy(
                  {
                    en: "Your projects and keys are saved to this account.",
                    mn: "Таны төсөл, түлхүүрүүд энэ бүртгэлд хадгалагдана.",
                    ko: "프로젝트와 키가 이 계정에 저장됩니다.",
                  },
                  lang,
                )
              : t("step2Sub")
          }
        >
          <StepAccount lang={lang} />
        </StepShell>
      )}
      {step === 3 && (
        <StepShell title={t("step3Title")} sub={t("step3Sub")}>
          <div className="space-y-4">
            <ChosenCategory lang={lang} category={category} onBack={() => setStep(1)} />
            <AiKeysCard category={category} />
          </div>
        </StepShell>
      )}
      {step === 4 && (
        <div className="space-y-8">
          <ChosenCategory lang={lang} category={category} onBack={() => setStep(1)} />
          <StepUpload lang={lang} mode="save" category={category} rules={rules} onDone={() => setStep(5)} />
        </div>
      )}
      {step === 5 && (
        <div className="space-y-8">
          <ChosenCategory lang={lang} category={category} onBack={() => setStep(1)} />
          <StepUpload lang={lang} mode="mine" category={category} rules={rules} />
        </div>
      )}


      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={() => setStep(visible[Math.max(0, position - 1)] ?? 1)}
          disabled={step === 1}
          className="inline-flex items-center gap-1 rounded-xl border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> {t("back")}
        </button>
        <button
          type="button"
          onClick={() => void continueSetup()}
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {step === 5 ? pickCopy({ en: "Finish", mn: "Дуусгах", ko: "완료" }, lang) : t("next")} <ChevronRight className="h-4 w-4" />
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
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </header>
      {tip && (
        <p className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {tip}
        </p>
      )}
      {children}
    </div>
  );
}


/** Shows what was picked in step 1 so later steps stay tied to that choice. */
function ChosenCategory({
  lang,
  category,
  onBack,
}: {
  lang: Lang;
  category: CreationCategory;
  onBack: () => void;
}) {
  const label = pickCopy(CATEGORY_LABELS[category], lang);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        {pickCopy({ en: "You are creating", mn: "Та үүсгэж байна", ko: "만드는 것" }, lang)}:
      </span>
      <span className="font-semibold text-foreground">{label.title}</span>
      <span className="text-muted-foreground">{label.sub}</span>
      <button
        type="button"
        onClick={onBack}
        className="ml-auto rounded-lg border border-border px-2 py-1 font-medium text-foreground transition-colors hover:bg-accent"
      >
        {pickCopy({ en: "Change", mn: "Солих", ko: "변경" }, lang)}
      </button>
    </div>
  );
}

/**
 * Step 1 reuses the same CategoryList as the "+" hub modal (create-wizard.tsx)
 * so the five creation choices exist in exactly one place.
 */
function StepCategory({ lang, value, onChange }: { lang: Lang; value: CreationCategory; onChange: (value: CreationCategory) => void }) {
  return (
    <CategoryList
      lang={lang}
      selected={value}
      onPick={(category) => {
        setCreationCategory(category);
        onChange(category);
      }}
    />
  );
}

function StepAccount({ lang }: { lang: Lang }) {
  const navigate = useNavigate();
  const { isAuthenticated, profile } = useAuth();
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      {isAuthenticated ? (
        <div className="flex flex-wrap items-center gap-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {profile?.displayName ?? pickCopy({ en: "Signed in", mn: "Нэвтэрсэн", ko: "로그인됨" }, lang)}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{profile?.email ?? ""}</span>
          </span>
          <button
            type="button"
            onClick={() => void navigate({ to: "/auth", search: { next: "/creator" } })}
            className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {pickCopy({ en: "Use another account", mn: "Өөр бүртгэл ашиглах", ko: "다른 계정 사용" }, lang)}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{pickCopy({ en: "Use Google, Apple, email, or create a new account. This protects your projects and keys.", mn: "Google, Apple, имэйлээр нэвтрэх эсвэл шинэ бүртгэл үүсгэнэ үү.", ko: "Google, Apple, 이메일로 로그인하거나 새 계정을 만드세요." }, lang)}</p>
          <button type="button" onClick={() => void navigate({ to: "/auth", search: { next: "/creator" } })} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
            {pickCopy({ en: "Sign in or sign up", mn: "Нэвтрэх эсвэл бүртгүүлэх", ko: "로그인 또는 가입" }, lang)}
          </button>
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
function StepUpload({
  lang,
  mode,
  category,
  rules,
  onDone,
}: {
  lang: Lang;
  rules?: Assessment;
  onDone?: () => void;
  /** "both" is the single combined step: save a link, then mine a saved video. */
  mode: "save" | "mine" | "both";
  category: CreationCategory;
}) {

  const t = useCallback((k: string) => tr(lang, k), [lang]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("youtube");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [postedUrl, setPostedUrl] = useState("");
  const [hasAuth, setHasAuth] = useState(true);
  const { isAuthenticated: signedIn, userId } = useAuth();
  const loadAccountKeys = useServerFn(getUserAiKeyStatus);
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
  const [assessment, setAssessment] = useState<Assessment>(() => ({ ...defaultAssessmentFor(category), ...rules }));
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
  const saveMode = mode !== "mine";
  const mineMode = mode !== "save";
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
    enabled: signedIn && mineMode && isTargetReady(target),
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
    if (!mineMode || mode === "both" || pickedSourceId || pendingSources.length === 0) return;
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
    if (!signedIn) {
      setHasAuth(false);
      return;
    }
    void loadAccountKeys()
      .then((keys) => setHasAuth(keys.some((key) => key.provider === "gemini" && key.enabled && key.status !== "invalid")))
      .catch(() => setHasAuth(false));
  }, [loadAccountKeys, signedIn]);

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
    const check = tab === "youtube" ? checkYoutube(url) : tab === "drive" ? checkDrive(url) : tab === "link" ? checkLink(url) : file ? checkFile(file) : null;
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
            sourceUrl: source.kind === "youtube" ? source.url : source.kind === "file" ? (otherVideo(postedUrl)?.url ?? source.label) : source.url,
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
    [lang, queryClient, target, userId, assessment, postedUrl],
  );


  /** Local checkpoint + growth stats, then cloud vault / feed persistence. */
  const finishMined = useCallback(
    async (rawMined: ChunkResult, source: ImportSource): Promise<string | null> => {
      // Stage 2 — the understanding pass: the AI picked in step 3 (or an AI
      // team) thinks over the material the built-in engine extracted and adds
      // topics, beliefs and knowledge it missed. Never fatal: on any failure
      // the stage-1 result stands on its own.
      let mined = rawMined;
      let minedByAi: MinerId = "gemini";
      try {
        const category = getCreationCategory();
        // The thinkers are the creator's own saved keys, in their saved order:
        // whoever is below Gemini and still has tokens does the thinking pass.
        const pass = await runUnderstandingPass(rawMined, category, abortRef.current?.signal ?? undefined);
        const first = pass.reports.find((r) => r.status === "ok");
        if (first && findMiner(first.id)) minedByAi = findMiner(first.id)!.id;
        mined = pass.result;
        for (const report of pass.reports) {
          setLog((prev) => [...prev, `\n> ${report.label}: ${report.status} — ${report.detail}`]);
        }
      } catch {
        /* stage-1 result stands on its own */
      }
      await idbSet(STORES.SESSION, scopedKey("guided-last-mine"), {
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
    [persist],
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
   * Drives a list of server-side mining jobs to completion, one 15-minute
   * checkpoint at a time. Used both for freshly started videos and for jobs
   * picked back up after the tab was closed.
   */
  const driveJobs = useCallback(
    async (jobs: MiningJob[]) => {
      miningDriver.active = true;
      try {
      setQueueTotal(jobs.length);
      setQueue(jobs.map((j) => ({ id: j.id, label: j.sourceLabel, total: j.totalChunks })));
      say(`$ evermind mine --videos ${jobs.length}`);
      say(`  # ${term.background}`);
      jobs.forEach((j, i) =>
        say(`  [${i + 1}] ${j.sourceLabel} — ${j.totalChunks} × 15${term.min}`),
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
      } finally {
        miningDriver.active = false;
      }
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
      category: getCreationCategory(),
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
      const live = jobs
        .filter((j) => j.status === "queued" || j.status === "running" || j.status === "paused_quota")
        .sort(
          (a, b) =>
            new Date(a.createdAt ?? a.updatedAt).getTime() - new Date(b.createdAt ?? b.updatedAt).getTime() ||
            a.queuePosition - b.queuePosition,
        );
      // The app-wide auto-resume is already continuing these.
      if (live.length === 0 || miningDriver.active) return;
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
      // Ticked saved videos are their own source of truth — the link box stays
      // empty when mining comes from the saved list, and must not be validated.
      const pickedRows = pendingSources.filter((p) => pickedIds.includes(p.id));
      const source = pickedRows.length
        ? ({
            kind: pickedRows[0]!.payload.source.kind === "drive" ? "drive" : "youtube",
            url: pickedRows[0]!.payload.source.url,
            label: pickedRows[0]!.payload.source.label,
          } as ImportSource)
        : resolveSource();
      if (!source) return;


      if (!signedIn) {
        setErrorKey("errNoKey");
        return;
      }
      // The server resolves the creator's Mining assignment from API Manager.
      // Raw keys never need to pass through this screen.
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
                ...(await withNetworkRetry(() =>
                  startMiningJobs({ data: { url: u, assessment, ...dest } }),
                )),
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
      title={pickCopy({ en: "Add your videos", mn: "Видеогоо нэмэх", ko: "영상 추가하기" }, lang)}
      sub={pickCopy(
        {
          en: "Paste a link to save it, then tick a saved video and start mining.",
          mn: "Холбоос оруулж хадгалаад, дараа нь хадгалсан видеогоо сонгож олборлоно уу.",
          ko: "링크를 붙여넣어 저장한 뒤, 저장된 영상을 선택해 마이닝하세요.",
        },
        lang,
      )}
      tip={lib.saveHint}
    >
      {saveMode && <ProjectTargetPicker lang={lang} value={target} onChange={setTarget} />}

      {mineMode && (
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

      <div className="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5" data-ready={gate}>
        {saveMode && !busy && (
        <>
        <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1">
          {(
            [
              ["youtube", t("sourceYoutube"), Youtube],
              ["link", t("sourceLink"), Globe2],
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
            <label className="mt-3 block text-xs text-muted-foreground">
              {t("postedAtLabel")}
              <input
                value={postedUrl}
                onChange={(e) => setPostedUrl(e.target.value)}
                placeholder={t("linkPlaceholder")}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
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
              placeholder={tab === "youtube" ? t("urlPlaceholder") : tab === "link" ? t("linkPlaceholder") : t("drivePlaceholder")}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
        {tab === "youtube" && <SubtitleUpload lang={lang} url={url} />}
        </>
        )}

        {!hasAuth && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
            <AlertCircle className="h-4 w-4 shrink-0" /> {t("errNoKey")}
          </p>
        )}

        {saveMode && (
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
            <button
              type="button"
              onClick={() => void saveLink(assessment)}
              disabled={saving || !url.trim() || !ready}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {saving ? lib.saving : lib.saveTitle}
            </button>
            {!url.trim() && (
              <p className="text-xs text-muted-foreground">
                {pickCopy(
                  {
                    en: "Paste a video link above to turn on Save video.",
                    mn: "Хадгалах товчийг идэвхжүүлэхийн тулд дээр видеоны холбоос оруулна уу.",
                    ko: "저장 버튼을 켜려면 위에 영상 링크를 붙여넣으세요.",
                  },
                  lang,
                )}
              </p>
            )}
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
            {justSaved.length > 0 && onDone && (
              <button
                type="button"
                onClick={onDone}
                className="ml-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {pickCopy({ en: "Next: mine", mn: "Дараагийн алхам: Олборлох", ko: "다음: 마이닝" }, lang)}
              </button>
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
        )}

        {mineMode && (
          <div className="mt-4 space-y-4">
            <button
              type="button"
              onClick={() => void run(assessment)}
              disabled={busy || (pickedIds.length === 0 && !url.trim())}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {pickCopy({ en: "Start mining", mn: "Шинжилгээ эхлүүлэх", ko: "분석 시작" }, lang)}
            </button>
            {pickedIds.length === 0 && !url.trim() && (
              <p className="text-xs text-amber-500">
                {pickCopy(
                  {
                    en: "Tick one of your saved videos above first.",
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
                  <span className="shrink-0">{q.total} × 15min</span>
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

            {(result.qaPairs?.length || result.entities?.length || result.screenText?.length) ? (
              <div className="mt-3 space-y-2">
                {result.qaPairs && result.qaPairs.length > 0 && (
                  <details className="rounded-lg border border-border bg-background p-3">
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      {pickCopy({ en: "Questions & answers", mn: "Асуулт ба хариулт", ko: "질문과 답변" }, lang)} ({result.qaPairs.length})
                    </summary>
                    <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                      {result.qaPairs.map((q, i) => (
                        <li key={i} className="text-xs">
                          <p className="text-foreground"><span className="font-mono text-primary">{q.timestamp}</span> {q.asker}: {q.question}</p>
                          <p className="mt-0.5 text-muted-foreground">→ {q.answerer}: {q.answer}</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {result.entities && result.entities.length > 0 && (
                  <details className="rounded-lg border border-border bg-background p-3">
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      {pickCopy({ en: "People, places & things", mn: "Хүн, газар, зүйлс", ko: "인물·장소·사물" }, lang)} ({result.entities.length})
                    </summary>
                    <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                      {result.entities.map((e, i) => (
                        <li key={i} className="text-xs">
                          <p className="text-foreground"><span className="font-medium">{e.name}</span> <span className="text-muted-foreground">· {e.type}</span></p>
                          {e.description && <p className="text-muted-foreground">{e.description}</p>}
                          {e.relations.length > 0 && (
                            <p className="text-muted-foreground">{e.relations.map((r) => `${r.relation} → ${r.target}`).join(" · ")}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {result.screenText && result.screenText.length > 0 && (
                  <details className="rounded-lg border border-border bg-background p-3">
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      {pickCopy({ en: "On-screen text, slides & code", mn: "Дэлгэцийн бичвэр, слайд, код", ko: "화면 텍스트·슬라이드·코드" }, lang)} ({result.screenText.length})
                    </summary>
                    <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                      {result.screenText.map((t, i) => (
                        <li key={i} className="text-xs">
                          <p className="text-muted-foreground"><span className="font-mono text-primary">{t.timestamp}</span> · {t.kind}{t.language ? ` · ${t.language}` : ""}</p>
                          {t.text && <pre className="mt-1 whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-[11px] text-foreground">{t.text}</pre>}
                          {t.description && <p className="mt-1 text-muted-foreground">{t.description}</p>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ) : null}

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
