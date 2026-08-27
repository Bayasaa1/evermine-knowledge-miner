/**
 * Zero-tech creator flow — three steps, no API keys anywhere:
 *   1. Sign in with Google (auto-links the creator's free-tier Gemini API)
 *   2. Paste a YouTube / Google Drive link (direct knowledge ingestion)
 *   3. Monetization control (Free mode or Paid subscription, switchable any time)
 * Every limit is stated up front and every failure surfaces as a plain-language
 * banner with a Retry button — never a raw log line.
 */
import { useCallback, useEffect, useRef, useState } from "react";
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
import { hasGeminiOauth } from "@/lib/google-gemini-auth";
import { mineYoutubeVideo } from "@/lib/youtube-mine.functions";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";
import { idbSet, STORES } from "@/lib/store";
import { recordGrowth } from "@/lib/analytics";

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
          onClick={() => setStep((s) => Math.min(3, s + 1))}
          disabled={step === 3}
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {t("next")} <ChevronRight className="h-4 w-4" />
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
  const [tab, setTab] = useState<Tab>("youtube");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hasAuth, setHasAuth] = useState(true);
  const { isAuthenticated: signedIn } = useAuth();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ChunkResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void hasGeminiOauth().then((ok) => setHasAuth(ok || signedIn));
  }, [signedIn]);

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

  const run = useCallback(async () => {
    setErrorKey(null);
    setResult(null);
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
    const tick = window.setInterval(() => setProgress((p) => (p < 90 ? p + 3 : p)), 900);

    try {
      let mined: ChunkResult;
      if (source.kind === "youtube") {
        mined = await mineYoutubeVideo({ data: { url: source.url, startSec: 0, endSec: MAX_DURATION_SEC } });
      } else if (source.kind === "file") {
        const ref = await uploadVideo(key, source.file, { signal: controller.signal });
        setProgress((p) => Math.max(p, 55));
        mined = await mineChunk(key, MODEL, ref, 0, MAX_DURATION_SEC, controller.signal);
      } else {
        mined = await mineUrlSegment(key, MODEL, source.url, 0, MAX_DURATION_SEC, controller.signal);
      }
      setProgress(100);
      setResult(mined);
      await idbSet(STORES.SESSION, "guided-last-mine", { source: source.label, minedAt: Date.now(), result: mined });
      await recordGrowth({
        beliefs: mined.subconsciousness.beliefs.length,
        skills: mined.subconsciousness.skills.length,
        memories: mined.transcript.length,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setProgress(0);
      } else {
        explain(err, `${source.kind} import — ${source.label}`);
      }
    } finally {
      window.clearInterval(tick);
      setBusy(false);
      abortRef.current = null;
    }
  }, [resolveSource, explain, signedIn]);

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

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? t("analyzing") : t("analyze")}
          </button>
          {busy && (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("cancel")}
            </button>
          )}
        </div>

        {busy && (
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("analyzing")} {progress}%
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
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" /> {t("diagTryAgain")}
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("successTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("successBody")}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
            {result.subconsciousness.beliefs.slice(0, 4).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
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
