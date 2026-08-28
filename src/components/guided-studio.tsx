/**
 * Zero-tech creator flow — three steps, no API keys anywhere:
 *   1. Sign in with Google (auto-links the creator's free-tier Gemini API)
 *   2. Paste a YouTube / Google Drive link (direct knowledge ingestion)
 *   3. Monetization control (Free mode or Paid subscription, switchable any time)
 * Every limit is stated up front and every failure surfaces as a plain-language
 * banner with a Retry button — never a raw log line.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { SubscriptionPanel } from "@/components/subscription-panel";
import { tr, type Lang } from "@/lib/i18n";
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
import { useQueryClient } from "@tanstack/react-query";
import { upsertVault } from "@/lib/cloud-vault.functions";
import { publishToFeed } from "@/lib/feed";
import { ensureActiveCreatorMind } from "@/lib/mind-registry";
import {
  backupMindToDrive,
  DRIVE_FOLDER_NAME,
  isDriveSyncEnabled,
  setDriveSyncEnabled,
} from "@/lib/drive-backup";
import { CHUNK_SECONDS } from "@/lib/chunking";
import { MiningWizard } from "@/components/mining-wizard";
import { DEFAULT_ASSESSMENT, type Assessment } from "@/lib/mining-jobs";
import { runNextChunk, startMiningJobs } from "@/lib/mining-jobs.functions";


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
} as const;

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
  const [step, setStep] = useState(1);

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
      {step === 2 && <StepUpload lang={lang} />}
      {step === 3 && (
        <StepShell title={t("step3Title")} sub={t("step3Sub")} tip={t("tipPrice")}>
          <SubscriptionPanel lang={lang} creatorEmail={creatorEmail} />
        </StepShell>
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
            toast.success(lang === "mn" ? "Тохиргоо дууслаа" : "Setup complete", {
              description:
                lang === "mn"
                  ? "Таны AI оюун санг Mind Vaults хэсгээс харна уу."
                  : "Your AI mind is ready — opening your Mind Vaults.",
            });
            void navigate({ to: "/vaults" });
          }}
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {step === 3 ? (lang === "mn" ? "Дуусгах" : "Finish") : t("next")}{" "}
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
  const t = googleCopy[lang];
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

/** Step 2 — paste a YouTube/Drive link (or drop a file) and mine it directly. */
function StepUpload({ lang }: { lang: Lang }) {
  const t = useCallback((k: string) => tr(lang, k), [lang]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("youtube");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hasAuth, setHasAuth] = useState(true);
  const { isAuthenticated: signedIn } = useAuth();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ChunkResult | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [driveSync, setDriveSync] = useState(false);
  const [driveNote, setDriveNote] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment>(DEFAULT_ASSESSMENT);
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

  /** Appends one line to the live mining terminal and keeps it scrolled down. */
  const say = useCallback((line: string) => {
    setLog((prev) => [...prev, line].slice(-400));
  }, []);

  useEffect(() => {
    const el = termRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);


  useEffect(() => {
    void hasGeminiOauth().then((ok) => setHasAuth(ok || signedIn));
    void isDriveSyncEnabled().then(setDriveSync);
  }, [signedIn]);

  const toggleDrive = useCallback(async (on: boolean) => {
    setDriveSync(on);
    await setDriveSyncEnabled(on);
  }, []);

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

  /** Persists the mined result to the account's cloud vault, feed and Drive. */
  const persist = useCallback(
    async (mined: ChunkResult, source: ImportSource) => {
      const category = getCreationCategory();
      const title = mined.story.summary?.slice(0, 60) || source.label || "New Mind";
      const payload = {
        source: { kind: source.kind, label: source.label },
        category,
        minedAt: new Date().toISOString(),
        result: mined,
      };

      try {
        const vault = await ensureActiveCreatorMind();
        const saved = await upsertVault({
          data: { title, kind: "mine", payload: payload as never },
        });
        await publishToFeed({
          id: `pub_${saved.id}`,
          mindId: vault.id,
          creator: vault.title,
          handle: `@${vault.title.toLowerCase().replace(/\s+/g, "")}`,
          title,
          description: mined.story.summary ?? "",
          category,
          src: null,
          poster: "",
          tags: mined.subconsciousness.skills.slice(0, 4),
          price: 0,
          currency: "USD",
        });
        setSavedTitle(title);
        await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
      } catch (err) {
        toast.error(lang === "mn" ? "Үүлэн санд хадгалж чадсангүй" : "Could not save to your cloud vault", {
          description: err instanceof Error ? err.message : String(err),
        });
      }

      if (await isDriveSyncEnabled()) {
        const backup = await backupMindToDrive(title, payload);
        setDriveNote(
          backup.ok
            ? `${DRIVE_FOLDER_NAME} / ${backup.fileName}`
            : (lang === "mn" ? "Drive нөөцлөлт амжилтгүй: " : "Drive backup failed: ") + backup.reason,
        );
      }
    },
    [lang, queryClient],
  );

  /** Local checkpoint + growth stats, then cloud vault / feed / Drive persistence. */
  const finishMined = useCallback(
    async (mined: ChunkResult, source: ImportSource) => {
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
      await persist(mined, source);
    },
    [persist],
  );



  /** YouTube: server-side 5-minute checkpoint pipeline (playlists included). */
  const runYoutubeJobs = useCallback(
    async (source: ImportSource & { kind: "youtube" }, assessment: Assessment) => {
      const jobs = await startMiningJobs({ data: { url: source.url, assessment } });
      setQueueTotal(jobs.length);
      setQueue(jobs.map((j) => ({ id: j.id, label: j.sourceLabel, total: j.totalChunks })));
      say(`$ evermind mine --videos ${jobs.length}`);
      jobs.forEach((j, i) => say(`  [${i + 1}] ${j.sourceLabel} — ${j.totalChunks} × 5min`));
      let lastMerged: ChunkResult | null = null;

      for (let q = 0; q < jobs.length; q++) {
        let current = jobs[q]!;
        setQueueIndex(q + 1);
        setStatusNote(current.sourceLabel);
        say(`\n## ${current.sourceLabel}`);
        while (current.status !== "done" && current.status !== "paused_quota" && current.status !== "error") {
          if (stopRef.current) {
            say("\n> STOPPED by user — every finished checkpoint stays saved.");
            return;
          }
          say(`\n### chunk ${current.nextIndex + 1}/${current.totalChunks} — streaming…`);
          const step = await runNextChunk({ data: { jobId: current.id } });
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
            say("\n> STOPPED by user — every finished checkpoint stays saved.");
            return;
          }
          if (step.done) break;
        }


        if (current.status === "paused_quota") {
          setPaused(
            lang === "mn"
              ? `Gemini-ийн үнэгүй хязгаарт хүрлээ. ${current.nextIndex}/${current.totalChunks} хэсэг хадгалагдсан — квот сэргэмэгц автоматаар үргэлжилнэ.`
              : `Free AI quota reached. ${current.nextIndex}/${current.totalChunks} checkpoints are saved — the background worker resumes automatically after the quota resets.`,
          );
          break;
        }
        if (current.status === "error") {
          throw new Error(current.lastError ?? "Mining failed.");
        }
        if (lastMerged) await finishMined(lastMerged, source);
        lastMerged = null;
      }
    },
    [lang, finishMined, say],
  );

  const run = useCallback(
    async (assessment: Assessment) => {
      setErrorKey(null);
      setResult(null);
      setSavedTitle(null);
      setDriveNote(null);
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

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setProgress(5);

      try {
        if (source.kind === "youtube") {
          await runYoutubeJobs(source, assessment);
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
    [resolveSource, explain, signedIn, runYoutubeJobs, finishMined],
  );


  return (
    <StepShell title={t("step2Title")} sub={t("step2Sub")} tip={t("tipSource")}>
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1">
          {(
            [
              ["youtube", t("sourceYoutube"), Youtube],
              ["drive", t("sourceDrive"), HardDrive],
              ["file", t("sourceFile"), Upload],
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

        {!hasAuth && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
            <AlertCircle className="h-4 w-4 shrink-0" /> {t("errNoKey")}
          </p>
        )}

        <div className="mt-4">
          <MiningWizard
            lang={lang}
            value={assessment}
            onChange={setAssessment}
            busy={busy}
            onStart={(a) => {
              setAssessment(a);
              void run(a);
            }}
          />
        </div>

        {busy && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("cancel")}
            </button>
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
              {checkpoint ? ` · ${lang === "mn" ? "хэсэг" : "chunk"} ${checkpoint.index}/${checkpoint.total}` : ""}
              {queueTotal > 1 ? ` · ${lang === "mn" ? "видео" : "video"} ${queueIndex}/${queueTotal}` : ""}
              {statusNote ? ` · ${statusNote}` : ""}
            </p>

          </div>
        )}

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <input
            type="checkbox"
            checked={driveSync}
            onChange={(e) => void toggleDrive(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
          />
          <span className="text-xs leading-relaxed text-muted-foreground">
            <span className="block font-medium text-foreground">
              {lang === "mn" ? "Оюуны нөөцлөлтийг Google Drive-д хадгалах" : "Sync Mind Backup to Google Drive"}
            </span>
            {lang === "mn"
              ? `Таны Google бүртгэл дэх "${DRIVE_FOLDER_NAME}" хавтсанд .mind.json файл автоматаар үүснэ.`
              : `Writes a .mind.json file straight into an "${DRIVE_FOLDER_NAME}" folder in your Drive — no links to paste.`}
          </span>
        </label>

        <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {t("termsNotice")}
        </p>
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
                ? lang === "mn"
                  ? `"${savedTitle}" таны бүртгэлд хадгалагдаж, нийтлэгдлээ.`
                  : `"${savedTitle}" was saved to your account and published.`
                : t("successBody")}
            </p>
            {driveNote && <p className="mt-1 text-xs text-muted-foreground">Google Drive: {driveNote}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void navigate({ to: "/vaults" })}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {lang === "mn" ? "Миний сангаас харах" : "View in My Vaults"}
              </button>
              <button
                type="button"
                onClick={() => void navigate({ to: "/" })}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {lang === "mn" ? "Фийд дээр харах" : "View on Feed"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {lang === "mn"
                ? "Задлан авсан мэдлэг ба хөдөлгөөний зам"
                : "Extracted Knowledge & Motion Trajectories"}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  [result.knowledgeNodes.length, lang === "mn" ? "Мэдлэгийн зангилаа" : "Knowledge nodes"],
                  [
                    result.knowledgeNodes.filter((n) => n.spatial_action).length,
                    lang === "mn" ? "Хөдөлгөөний зам" : "Trajectories",
                  ],
                  [result.subconsciousness.skills.length, lang === "mn" ? "Ур чадвар" : "Skills"],
                  [result.transcript.length, lang === "mn" ? "Ярианы мөр" : "Transcript lines"],
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
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">{t("limitsTitle")}</p>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <Youtube className="mt-0.5 h-4 w-4 shrink-0" /> {t("limitYoutube")}
          </li>
          <li className="flex gap-2">
            <HardDrive className="mt-0.5 h-4 w-4 shrink-0" /> {t("limitDrive")}
          </li>
          <li className="flex gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> {t("limitLangs")}
          </li>
        </ul>
      </div>
    </StepShell>
  );
}
