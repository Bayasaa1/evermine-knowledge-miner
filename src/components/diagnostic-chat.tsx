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
import type { ArchitectCard, ArchitectResult } from "@/lib/architect-types";
import { startMiningJobs } from "@/lib/mining-jobs.functions";
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

type ChatMsg = { role: "user" | "model"; text: string; provider?: string; actions?: string[]; cards?: ArchitectCard[] };

/** The account's Chatting role is the only path used for diagnostics. */
async function askBackend(lang: Lang, history: ChatMsg[]): Promise<ChatMsg> {
  const res = await apiFetch("/api/diagnose-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...skipCaptureHeader() },
    body: JSON.stringify({
      lang,
      errors: getCapturedErrors().slice(-10),
      messages: history.map((m) => ({ role: m.role, text: m.text })),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string; provider?: string };
  if (!res.ok) throw new Error(data.error ?? `Diagnostics service error (${res.status}).`);
  const text = data.text?.trim();
  if (!text) throw new Error("The selected Chat AI returned an empty answer.");
  return { role: "model", text, provider: data.provider };
}

/** Runs one Architect tool. Writing tools only fire from buttons the user presses. */
async function runAction(action: string, args: Record<string, unknown>): Promise<ChatMsg> {
  const res = await apiFetch("/api/diagnose-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...skipCaptureHeader() },
    body: JSON.stringify({ action, args }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<ArchitectResult> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Co-Pilot error (${res.status}).`);
  return { role: "model", text: data.text ?? "", provider: data.provider, actions: data.actions_taken, cards: data.interactive_cards };
}

async function answer(lang: Lang, history: ChatMsg[]): Promise<ChatMsg> {
  return askBackend(lang, history);
}

const COPY = {
  en: { chips: ["🔍 Find Best YouTube Videos for a Mind", "🧠 Deep-Analyze My Brain & Find Gaps", "🛠️ Auto-Fix & Enrich Brain + Persona", "⚡ Stress-Test Mind with 3 Hard Questions"], mine: "1-Click Mine Recommended Video", queued: "Added to mining", apply: "Apply Brain Fix", bind: "Bind Identified Persona", improve: "Auto-Improve Answers", by: "Ran on", noPersona: "Bind a persona to this project first", gaps: "Weak / missing", ok: "Strong" },
  mn: { chips: ["🔍 Mind-д тохирох YouTube видео олох", "🧠 Brain-ийг гүн шинжилж дутууг олох", "🛠️ Brain + Persona-г засаж баяжуулах", "⚡ Mind-ийг 3 хэцүү асуултаар шалгах"], mine: "Санал болгосон видеог 1 товшилтоор майнинг хийх", queued: "Майнингийн дараалалд орлоо", apply: "Brain засварыг хэрэгжүүлэх", bind: "Олсон Persona-г холбох", improve: "Хариултыг автоматаар сайжруулах", by: "Ажилласан AI", noPersona: "Эхлээд төсөлд Persona холбоно уу", gaps: "Сул / дутуу", ok: "Сайн" },
  ko: { chips: ["🔍 마인드용 최고의 YouTube 영상 찾기", "🧠 브레인 심층 분석 및 빈틈 찾기", "🛠️ 브레인 + 페르소나 자동 수정·보강", "⚡ 어려운 질문 3개로 마인드 테스트"], mine: "추천 영상 원클릭 마이닝", queued: "마이닝 대기열에 추가됨", apply: "브레인 수정 적용", bind: "식별된 페르소나 연결", improve: "답변 자동 개선", by: "실행 AI", noPersona: "먼저 이 프로젝트에 페르소나를 연결하세요", gaps: "약함 / 누락", ok: "강점" },
} as const;
const CHIP_ACTIONS = ["scout", "health", "fix", "stress"] as const;

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
      setMessages([...next, reply]);
    } catch (err) {
      setMessages([...next, { role: "model", text: describeThrowable(err) }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, messages, lang]);

  const copy = COPY[(lang in COPY ? lang : "en") as keyof typeof COPY];
  const [done, setDone] = useState<Record<string, boolean>>({});

  const act = useCallback(
    async (label: string | null, action: string, args: Record<string, unknown>) => {
      if (thinking) return;
      if (label) setMessages((m) => [...m, { role: "user", text: label }]);
      setThinking(true);
      try {
        const reply = await runAction(action, args);
        setMessages((m) => [...m, reply]);
      } catch (err) {
        setMessages((m) => [...m, { role: "model", text: describeThrowable(err) }]);
      } finally {
        setThinking(false);
      }
    },
    [thinking],
  );

  const mine = useCallback(async (key: string, c: Extract<ArchitectCard, { type: "video" }>) => {
    try {
      await startMiningJobs({ data: { url: c.url, assessment: { sourceTitle: c.title, speakerIdentity: c.author }, personaId: c.personaId ?? null, projectId: c.projectId ?? null } as never });
      setDone((d) => ({ ...d, [key]: true }));
    } catch (err) {
      setMessages((m) => [...m, { role: "model", text: describeThrowable(err) }]);
    }
  }, []);

  const btn = "mt-1.5 inline-flex items-center rounded-lg bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40";

  const renderCard = (c: ArchitectCard, key: string) => {
    const wrap = "mt-2 rounded-xl border border-border bg-muted/30 p-2 text-xs";
    if (c.type === "projects")
      return (
        <div key={key} className={`${wrap} flex flex-wrap gap-1`}>
          {c.projects.map((p) => (
            <button key={p.id} type="button" onClick={() => void act(p.title, c.next, { projectId: p.id })} className="rounded-lg border border-border bg-background px-2 py-1 hover:border-primary">
              {p.title}
            </button>
          ))}
        </div>
      );
    if (c.type === "video")
      return (
        <div key={key} className={`${wrap} flex gap-2`}>
          {c.thumbnail && <img src={c.thumbnail} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />}
          <div className="min-w-0 flex-1">
            <a href={c.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium text-foreground hover:underline">{c.title}</a>
            <p className="text-muted-foreground">{c.author} · {Math.round(c.durationSec / 60)} min</p>
            {c.projectId && c.personaId ? (
              <button type="button" disabled={done[key]} onClick={() => void mine(key, c)} className={btn}>{done[key] ? copy.queued : copy.mine}</button>
            ) : (
              <p className="mt-1 text-muted-foreground">{copy.noPersona}</p>
            )}
          </div>
        </div>
      );
    if (c.type === "health")
      return (
        <div key={key} className={wrap}>
          <p className="font-semibold text-foreground">{c.title}: {c.score}/100</p>
          <p className="mt-1 text-muted-foreground">{copy.ok}: {c.strengths.join(" · ") || "—"}</p>
          <p className="mt-1 text-destructive">{copy.gaps}: {c.gaps.join(" · ") || "—"}</p>
          <button type="button" onClick={() => void act(copy.chips[2], "fix", { projectId: c.projectId, instructions: c.gaps.join("; ") })} className={btn}>{copy.chips[2]}</button>
        </div>
      );
    if (c.type === "fix")
      return (
        <div key={key} className={wrap}>
          {c.notes.map((n, i) => <p key={i} className="text-muted-foreground">• {n}</p>)}
          {c.patches.map((p, i) => (
            <p key={i} className="mt-1"><span className="font-medium text-foreground">{p.question}</span> — {p.answer}</p>
          ))}
          {c.patches.length > 0 && (
            <button type="button" disabled={done[key]} onClick={() => { setDone((d) => ({ ...d, [key]: true })); void act(null, "apply_fix", { vaultId: c.vaultId, patches: c.patches }); }} className={btn}>{copy.apply}</button>
          )}
        </div>
      );
    if (c.type === "persona")
      return (
        <div key={key} className={wrap}>
          <p className="text-foreground">{c.name}</p>
          <button type="button" disabled={done[key]} onClick={() => { setDone((d) => ({ ...d, [key]: true })); void act(null, "bind_persona", { projectId: c.projectId, name: c.name }); }} className={btn}>{copy.bind}</button>
        </div>
      );
    return (
      <div key={key} className={wrap}>
        {c.tests.map((t, i) => (
          <div key={i} className="mt-1">
            <p className="font-medium text-foreground">Q{i + 1}. {t.question} <span className="text-muted-foreground">[{t.verdict}]</span></p>
            <p className="text-muted-foreground">{t.answer}</p>
          </div>
        ))}
        <button type="button" onClick={() => void act(copy.improve, "fix", { projectId: c.projectId, instructions: `Improve answers to: ${c.tests.map((t) => t.question).join(" | ")}` })} className={btn}>{copy.improve}</button>
      </div>
    );
  };

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
