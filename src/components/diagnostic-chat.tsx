/**
 * Floating System Diagnostic Assistant.
 *
 * A persistent bottom-left chat bubble wired to the global error-capture
 * buffer (`@/lib/error-capture`). Users can ask "Why did my video fail?" at
 * any time; the recent error context is sent to Gemini along with the
 * conversation, and the reply comes back in the active UI language
 * (English or Mongolian) as plain, step-by-step guidance.
 *
 * Conversation shape: one session-scoped conversation, kept in memory only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, SendHorizonal, Trash2, X } from "lucide-react";
import { useLang, type Lang } from "@/lib/i18n";
import {
  getCapturedErrors,
  subscribeCapturedErrors,
  clearCapturedErrors,
  skipCaptureHeader,
  describeThrowable,
  type CapturedError,
} from "@/lib/error-capture";
import { loadApiKeys } from "@/lib/keystore";
import { getGeminiAccessToken } from "@/lib/google-gemini-auth";
import { apiFetch } from "@/lib/api-fetch";

const MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com";

type ChatMsg = { role: "user" | "model"; text: string };

/** Product documentation the assistant answers "how do I…" questions from. */
const PLATFORM_DOCS = [
  `EVERMIND HANDBOOK (use this to answer product questions, not just errors):`,
  `- Hierarchy: Persona → Project → Video. A Persona is a creator identity; every Project belongs to one Persona; mined videos live inside a Project.`,
  `- Personas: create and switch them in My Vaults (persona grid) or with the persona switcher. New projects inherit the active persona's name and avatar.`,
  `- Mining a video: press the centre "+" button, pick the Persona, then a new or existing Project, then paste a YouTube link (playlists supported). Title, description, duration and thumbnail are fetched automatically. The video is split into 5-minute checkpoints (chunks = ceil(duration / 300)); the live terminal shows each chunk and can be stopped and resumed.`,
  `- Content type: VISUAL_CONTENT is published to the public Home Feed; TRAINING_ONLY stays private and only trains the mind.`,
  `- Vaults: My Vaults shows personas, projects, mined videos, the Core Brain inspector (knowledge graph plus raw JSON with a chunk eraser), version history with rollback, analytics, earnings and reviews.`,
  `- Search tab: search personas, projects, mined videos and topics across the network.`,
  `- Feed: vertical TikTok-style stream with live mined timestamps and emotion tags; viewers can chat, call, review or deploy a purchased mind to a robot.`,
  `- Storage: mined JSON is stored only in Evermind's own database in English; the interface translates it into the viewer's language at display time. There is no external backup.`,
  `- Common problems: video must be Public or Unlisted; a stopped mining job can be resumed from the same wizard; an invalid or exhausted AI key shows HTTP 400/401/403/429; long videos simply produce more checkpoints.`,
].join("\n");

function systemPrompt(lang: Lang, errors: CapturedError[]): string {
  const langName = `${LANGUAGES[lang]?.name ?? "English"} (${LANGUAGES[lang]?.native ?? "English"})`;
  const errorBlock =
    errors.length === 0
      ? "No errors have been captured yet."
      : JSON.stringify(
          errors.slice(-10).map((e) => ({
            at: e.at,
            source: e.source,
            status: e.status,
            url: e.url,
            message: e.message,
            detail: e.detail?.slice(0, 400),
          })),
          null,
          2,
        );
  return [
    `You are the System Diagnostic Assistant inside Evermind, an app that mines videos into AI "mind" data.`,
    `Always reply in ${langName}. Use plain, friendly, non-technical language.`,
    `When the user asks about a failure, analyse the captured system errors below, say what went wrong in one short paragraph, then give exact numbered steps to fix it.`,
    `Concrete fixes you can suggest when relevant: re-check the Gemini API key in Step 1 (invalid keys cause HTTP 400/401/403 from generativelanguage.googleapis.com), wait for quota reset or add another key on HTTP 429, make sure a YouTube link is Public or Unlisted (Private videos fail), make sure a Google Drive file is shared as "Anyone with the link", keep files under 2GB and videos under 2 hours, check the internet connection on network failures.`,
    `If no captured error explains the question, say so and ask for more detail.`,
    `Never invent error logs. Keep answers short: one summary paragraph plus a numbered fix list.`,
    ``,
    `Captured system errors (newest last):`,
    errorBlock,
  ].join("\n");
}

async function askGemini(
  auth: { kind: "key"; value: string } | { kind: "oauth"; value: string },
  lang: Lang,
  history: ChatMsg[],
): Promise<string> {
  const url =
    auth.kind === "key"
      ? `${GEMINI_BASE}/v1/models/${MODEL}:generateContent?key=${encodeURIComponent(auth.value)}`
      : `${GEMINI_BASE}/v1/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth.kind === "oauth" ? { Authorization: `Bearer ${auth.value}` } : {}),
      ...skipCaptureHeader(),
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(lang, getCapturedErrors()) }] },
      contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return text || "…";
}

/** Server-side fallback so a signed-in user is never blocked on a missing key. */
async function askBackend(lang: Lang, history: ChatMsg[]): Promise<string> {
  const res = await apiFetch("/api/diagnose-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...skipCaptureHeader() },
    body: JSON.stringify({ system: systemPrompt(lang, getCapturedErrors()), messages: history }),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Diagnostics service error (${res.status}).`);
  return data.text?.trim() || "…";
}

/**
 * Answers using whatever Gemini access the account already has: every key in
 * the rotation pool first, then the active Google OAuth session, then the
 * zero-setup backend. Only a total failure surfaces an error.
 */
async function answer(lang: Lang, history: ChatMsg[]): Promise<string> {
  const attempts: { kind: "key" | "oauth"; value: string }[] = [];
  try {
    for (const k of await loadApiKeys()) {
      if (k.value) attempts.push({ kind: "key", value: k.value });
    }
  } catch {
    /* key vault unavailable — fall through to session / backend */
  }
  try {
    const token = await getGeminiAccessToken();
    if (token) attempts.push({ kind: "oauth", value: token });
  } catch {
    /* no Google session */
  }

  let lastError: unknown = null;
  for (const auth of attempts) {
    try {
      return await askGemini(auth, lang, history);
    } catch (err) {
      lastError = err;
    }
  }
  try {
    return await askBackend(lang, history);
  } catch (err) {
    throw attempts.length ? (lastError ?? err) : err;
  }
}

export function DiagnosticChat() {
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [errorCount, setErrorCount] = useState(() => getCapturedErrors().length);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribeCapturedErrors(() => {
        setErrorCount(getCapturedErrors().length);
        setUnseen((n) => (open ? 0 : n + 1));
      }),
    [open],
  );

  useEffect(() => {
    if (open) setUnseen(0);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking, open]);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || thinking) return;
    setInput("");

    const next: ChatMsg[] = [...messages, { role: "user", text: question }];
    setMessages(next);

    setThinking(true);
    try {
      const reply = await answer(lang, next);
      setMessages([...next, { role: "model", text: reply }]);
    } catch (err) {
      setMessages([...next, { role: "model", text: describeThrowable(err) }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, messages, lang]);

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={t("botTitle")}
          className="fixed bottom-20 left-4 z-50 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
            <Bot className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{t("botTitle")}</p>
              <p className="truncate text-[11px] text-muted-foreground">{t("botSubtitle")}</p>
            </div>
            <button
              type="button"
              title={t("botClear")}
              onClick={() => {
                clearCapturedErrors();
                setErrorCount(0);
              }}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={t("botClose")}
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {errorCount > 0 && (
            <div className="border-b border-border bg-primary/5 px-4 py-2 text-[11px] text-muted-foreground">
              {t("botErrorContext")}: <span className="font-medium text-foreground">{errorCount}</span> —{" "}
              {getCapturedErrors()
                .slice(-1)
                .map((e) => e.message)
                .join("")}
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="pt-6 text-center text-xs text-muted-foreground">{t("botEmpty")}</p>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[90%] whitespace-pre-wrap px-1 py-1 text-sm text-foreground">{m.text}</div>
                </div>
              ),
            )}
            {thinking && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("botThinking")}
              </p>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("botPlaceholder")}
              autoFocus
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <button
              type="submit"
              disabled={thinking || !input.trim()}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <SendHorizonal className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("botFab")}
        className="fixed bottom-4 left-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <Bot className="h-5 w-5" />
        {unseen > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </button>
    </>
  );
}
