/**
 * Floating System Diagnostic Assistant.
 *
 * A persistent bottom-left chat bubble wired to the global error-capture
 * buffer (`@/lib/error-capture`). Users can ask "Why did my video fail?" at
 * any time; the recent error context is sent to Gemini along with the
 * conversation, and the reply comes back through the account's Chatting role
 * (English or Mongolian) as plain, step-by-step guidance.
 *
 * Conversation shape: one session-scoped conversation, kept in memory only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Bot, Loader2, SendHorizonal, Trash2, X } from "lucide-react";
import { useLang, type Lang } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/languages";
import {
  getCapturedErrors,
  subscribeCapturedErrors,
  clearCapturedErrors,
  skipCaptureHeader,
  describeThrowable,
  type CapturedError,
} from "@/lib/error-capture";
import { apiFetch } from "@/lib/api-fetch";

type ChatMsg = { role: "user" | "model"; text: string };


/** The account's Chatting role is the only path used for diagnostics. */
async function askBackend(lang: Lang, history: ChatMsg[]): Promise<string> {
  const res = await apiFetch("/api/diagnose-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...skipCaptureHeader() },
    body: JSON.stringify({
      lang,
      errors: getCapturedErrors().slice(-10),
      messages: history,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Diagnostics service error (${res.status}).`);
  const text = data.text?.trim();
  if (!text) throw new Error("The selected Chat AI returned an empty answer.");
  return text;
}

async function answer(lang: Lang, history: ChatMsg[]): Promise<string> {
  return askBackend(lang, history);
}

export function DiagnosticChat() {
  const { lang, t } = useLang();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The watching screen stays clean: the helper bubble covered the video and
  // the Home button there. It lives on the other screens instead.
  const hidden = pathname === "/";
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

  if (hidden) return null;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={t("botTitle")}
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 9rem)" }}
          className="fixed left-4 z-50 flex h-[26rem] max-h-[60vh] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
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
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.25rem)" }}
        className="fixed left-4 z-50 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
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
