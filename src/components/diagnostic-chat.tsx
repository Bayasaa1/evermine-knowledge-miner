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
import { MindRoster, useArchitectRoster } from "@/components/chat/mind-roster";
import { OperatorMindSelector, useOperatorMind } from "@/components/chat/operator-mind-selector";
import { ArchitectOperator } from "@/components/chat/architect-operator";
import { operatorIntent, type OperatorSkill } from "@/lib/architect-operator";
import { detectChatCommand, redactKeys } from "@/lib/chat-commands";
import { saveUserAiKey } from "@/lib/user-ai-keys.functions";

const RULES_KEY = "evermind:mining-rules";
const miningRules = () => { try { return localStorage.getItem(RULES_KEY) ?? ""; } catch { return ""; } };
const CMD = {
  en: { keyFound: "I found an API key", save: "Save this key", saved: "Key saved to your list", rules: "Mining rules saved. Every video you mine from this chat will follow them:", rulesCleared: "Mining rules cleared.", mine: "Mine", pick: "Choose project", remine: "Re-mine all videos", remineAsk: "Re-mine every video in this project with your current Mining keys?", remined: "videos sent to mining again", split: "Apply this split", splitText: (n: number, l: number, b: number) => `${n} Gemini keys: ${l} for chat/assistant/translation, ${b} for mining/subtitles/brain.` },
  mn: { keyFound: "API түлхүүр олдлоо", save: "Энэ түлхүүрийг хадгалах", saved: "Түлхүүр жагсаалтад хадгалагдлаа", rules: "Олборлох заавар хадгалагдлаа. Энэ чатаас олборлох бүх бичлэгт мөрдөнө:", rulesCleared: "Олборлох заавар цэвэрлэгдлээ.", mine: "Олборлох", pick: "Төсөл сонгох", remine: "Бүх бичлэгийг дахин олборлох", remineAsk: "Энэ төслийн бүх бичлэгийг одоогийн Mining түлхүүрээр дахин олборлох уу?", remined: "бичлэг дахин олборлолтод орлоо", split: "Энэ хуваарилалтыг хэрэгжүүлэх", splitText: (n: number, l: number, b: number) => `${n} Gemini түлхүүр: ${l} нь чат/туслах/орчуулга, ${b} нь олборлолт/хадмал/тархи.` },
  ko: { keyFound: "API 키를 찾았습니다", save: "이 키 저장", saved: "키가 목록에 저장됨", rules: "마이닝 규칙 저장됨. 이 채팅에서 마이닝하는 모든 영상에 적용됩니다:", rulesCleared: "마이닝 규칙 삭제됨.", mine: "마이닝", pick: "프로젝트 선택", remine: "모든 영상 다시 마이닝", remineAsk: "현재 마이닝 키로 이 프로젝트의 모든 영상을 다시 마이닝할까요?", remined: "개 영상 재마이닝 시작", split: "이 분배 적용", splitText: (n: number, l: number, b: number) => `Gemini 키 ${n}개: ${l}개 채팅/어시스턴트/번역, ${b}개 마이닝/자막/브레인.` },
};

type ChatMsg = { role: "user" | "model"; text: string; keyOffer?: { id: string; provider: string; masked: string } | undefined; provider?: string | undefined; actions?: string[] | undefined; cards?: ArchitectCard[] | undefined; operator?: ArchitectResult["operator"] };

/** The account's Chatting role is the only path used for diagnostics. */
async function askBackend(lang: Lang, history: ChatMsg[], attachedMindIds: string[], operatorMindId: string): Promise<ChatMsg> {
  const res = await apiFetch("/api/diagnose-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...skipCaptureHeader() },
    body: JSON.stringify({
      lang,
      attachedMindIds,
      operatorMindId,
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
async function runAction(action: string, args: Record<string, unknown>, attachedMindIds: string[], operatorMindId: string): Promise<ChatMsg> {
  const res = await apiFetch("/api/diagnose-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...skipCaptureHeader() },
    body: JSON.stringify({ action, args, attachedMindIds, operatorMindId }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<ArchitectResult> & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Co-Pilot error (${res.status}).`);
  return { role: "model", text: data.text ?? "", provider: data.provider, actions: data.actions_taken, cards: data.interactive_cards, operator: data.operator };
}

async function answer(lang: Lang, history: ChatMsg[], attachedMindIds: string[], operatorMindId: string): Promise<ChatMsg> {
  return askBackend(lang, history, attachedMindIds, operatorMindId);
}

const COPY = {
  en: { audit: "🩺 Audit Entire App & Auto-Heal Database", healAll: "✨ Fix All Issues Automatically", chips: ["🔍 Find Best YouTube Videos for a Mind", "🧠 Deep-Analyze My Brain & Find Gaps", "🛠️ Auto-Fix & Enrich Brain + Persona", "⚡ Stress-Test Mind with 3 Hard Questions"], mine: "1-Click Mine Recommended Video", queued: "Added to mining", apply: "Apply Brain Fix", bind: "Bind Identified Persona", improve: "Auto-Improve Answers", by: "Ran on", noPersona: "Bind a persona to this project first", gaps: "Weak / missing", ok: "Strong" },
  mn: { audit: "🩺 Аппыг бүхэлд нь шалгаж, өгөгдлийг засах", healAll: "✨ Бүх асуудлыг автоматаар засах", chips: ["🔍 Mind-д тохирох YouTube видео олох", "🧠 Brain-ийг гүн шинжилж дутууг олох", "🛠️ Brain + Persona-г засаж баяжуулах", "⚡ Mind-ийг 3 хэцүү асуултаар шалгах"], mine: "Санал болгосон видеог 1 товшилтоор майнинг хийх", queued: "Майнингийн дараалалд орлоо", apply: "Brain засварыг хэрэгжүүлэх", bind: "Олсон Persona-г холбох", improve: "Хариултыг автоматаар сайжруулах", by: "Ажилласан AI", noPersona: "Эхлээд төсөлд Persona холбоно уу", gaps: "Сул / дутуу", ok: "Сайн" },
  ko: { audit: "🩺 앱 전체 점검 및 데이터 자동 복구", healAll: "✨ 모든 문제 자동 수정", chips: ["🔍 마인드용 최고의 YouTube 영상 찾기", "🧠 브레인 심층 분석 및 빈틈 찾기", "🛠️ 브레인 + 페르소나 자동 수정·보강", "⚡ 어려운 질문 3개로 마인드 테스트"], mine: "추천 영상 원클릭 마이닝", queued: "마이닝 대기열에 추가됨", apply: "브레인 수정 적용", bind: "식별된 페르소나 연결", improve: "답변 자동 개선", by: "실행 AI", noPersona: "먼저 이 프로젝트에 페르소나를 연결하세요", gaps: "약함 / 누락", ok: "강점" },
} as const;
const CHIP_ACTIONS = ["scout", "health", "fix", "stress"] as const;

const OPEN_EVENT = "evermind:open-architect";
/** Opens the Co-Pilot pre-selected to a project (from any studio panel). */
export function openArchitectCoPilot(projectId?: string | null) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { projectId: projectId ?? null } }));
}

export function ArchitectLauncher({ projectId, lang }: { projectId?: string | null; lang?: string }) {
  const label =
    lang === "mn"
      ? "🤖 AI Architect Co-Pilot (Видео хайх / Шинжлэх / Brain засах)"
      : lang === "ko"
        ? "🤖 AI Architect Co-Pilot (영상 찾기 / 분석 / 브레인 자동 수정)"
        : "🤖 AI Architect Co-Pilot (Scout Videos / Analyze / Auto-Fix Brain)";
  return (
    <button
      type="button"
      onClick={() => openArchitectCoPilot(projectId)}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
    >
      {label}
    </button>
  );
}

export function DiagnosticChat() {
  const { lang, t } = useLang();
  const roster = useArchitectRoster();
  const operatorMind = useOperatorMind();
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
  const [presetProject, setPresetProject] = useState<string | null>(null);
  const [operatorProposal, setOperatorProposal] = useState<{ skill: OperatorSkill; serial: number } | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setPresetProject((e as CustomEvent<{ projectId: string | null }>).detail?.projectId ?? null);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

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

    const next: ChatMsg[] = [...messages, { role: "user", text: redactKeys(question) }];
    setMessages(next);
    const cmdCopy = CMD[(lang in CMD ? lang : "en") as keyof typeof CMD];
    const cmd = detectChatCommand(question);
    if (cmd?.kind === "api_key") {
      const id = String(Date.now());
      keyRef.current[id] = cmd.key;
      setMessages([...next, { role: "model", text: `${cmdCopy.keyFound}: ${cmd.provider} ${cmd.masked}`, keyOffer: { id, provider: cmd.provider, masked: cmd.masked } }]);
      return;
    }
    if (cmd?.kind === "mining_rules") {
      const clear = /^(clear|none|устга|삭제)$/i.test(cmd.rules);
      try { if (clear) localStorage.removeItem(RULES_KEY); else localStorage.setItem(RULES_KEY, cmd.rules); } catch { /* storage blocked */ }
      setMessages([...next, { role: "model", text: clear ? cmdCopy.rulesCleared : `${cmdCopy.rules}\n${cmd.rules}` }]);
      return;
    }
    if (cmd?.kind === "youtube" || cmd?.kind === "remine_all" || cmd?.kind === "role_split") {
      setThinking(true);
      try {
        const reply = cmd.kind === "youtube" ? await runAction("chat_youtube", { urls: cmd.urls }, roster.ids, operatorMind.id)
          : cmd.kind === "remine_all" ? await runAction("remine_preview", { projectId: presetProject ?? "" }, roster.ids, operatorMind.id)
          : await runAction("role_split", {}, roster.ids, operatorMind.id);
        setMessages([...next, reply]);
      } catch (err) {
        setMessages([...next, { role: "model", text: describeThrowable(err) }]);
      } finally { setThinking(false); }
      return;
    }

    const skill = operatorIntent(question);
    if (skill && roster.ids.length) { setOperatorProposal({ skill, serial: Date.now() }); return; }

    setThinking(true);
    try {
      const reply = await answer(lang, next, roster.ids, operatorMind.id);
      setMessages([...next, reply]);
    } catch (err) {
      setMessages([...next, { role: "model", text: describeThrowable(err) }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking, messages, lang, roster.ids, operatorMind.id, presetProject]);

  const copy = COPY[(lang in COPY ? lang : "en") as keyof typeof COPY];
  const [done, setDone] = useState<Record<string, boolean>>({});
  const publishDirectiveDraft = async (message: ChatMsg) => {
    if (!message.operator?.projectId || !message.operator.draft || !window.confirm(lang === "mn" ? "Энэ нийтлэлийг нийтлэх үү?" : lang === "ko" ? "이 초안을 게시할까요?" : "Publish this reviewed draft?")) return;
    await act(null, "publish_operator_post", { projectId: message.operator.projectId, draft: message.operator.draft, confirmed: true });
  };

  const act = useCallback(
    async (label: string | null, action: string, args: Record<string, unknown>) => {
      if (thinking) return;
      if (label) setMessages((m) => [...m, { role: "user", text: label }]);
      setThinking(true);
      try {
        const reply = await runAction(action, args, roster.ids, operatorMind.id);
        setMessages((m) => [...m, reply]);
      } catch (err) {
        setMessages((m) => [...m, { role: "model", text: describeThrowable(err) }]);
      } finally {
        setThinking(false);
      }
    },
    [thinking, roster.ids, operatorMind.id],
  );

  const mine = useCallback(async (key: string, c: Extract<ArchitectCard, { type: "video" }>) => {
    try {
      await startMiningJobs({ data: { url: c.url, assessment: { sourceTitle: c.title, speakerIdentity: c.author }, personaId: c.personaId ?? null, projectId: c.projectId ?? null } as never });
      setDone((d) => ({ ...d, [key]: true }));
    } catch (err) {
      setMessages((m) => [...m, { role: "model", text: describeThrowable(err) }]);
    }
  }, []);

  const keyRef = useRef<Record<string, string>>({});
  const [pickedProject, setPickedProject] = useState<Record<string, string>>({});
  const saveKey = useCallback(async (offer: NonNullable<ChatMsg["keyOffer"]>) => {
    const key = keyRef.current[offer.id];
    if (!key) return;
    try {
      await saveUserAiKey({ data: { provider: offer.provider as never, apiKey: key } });
      delete keyRef.current[offer.id];
      setDone((d) => ({ ...d, [`key-${offer.id}`]: true }));
    } catch (err) {
      setMessages((m) => [...m, { role: "model", text: describeThrowable(err) }]);
    }
  }, []);
  const mineUrl = useCallback(async (key: string, url: string, title: string, author: string, projectId: string, personaId: string, force: boolean) => {
    await startMiningJobs({ data: { url, assessment: { sourceTitle: title, speakerIdentity: author, customInstructions: miningRules().slice(0, 2000) }, personaId, projectId, force } as never });
    setDone((d) => ({ ...d, [key]: true }));
  }, []);
  const remineAll = useCallback(async (key: string, c: Extract<ArchitectCard, { type: "remine" }>, ask: string, doneText: string) => {
    if (!window.confirm(ask)) return;
    setDone((d) => ({ ...d, [key]: true }));
    let ok = 0;
    for (const url of c.urls) {
      try { await startMiningJobs({ data: { url, assessment: { customInstructions: miningRules().slice(0, 2000) }, personaId: c.personaId, projectId: c.projectId, force: true } as never }); ok++; } catch { /* reported in monitor */ }
    }
    setMessages((m) => [...m, { role: "model", text: `${ok}/${c.urls.length} ${doneText}` }]);
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
    if (c.type === "mine_link") {
      const cc = CMD[(lang in CMD ? lang : "en") as keyof typeof CMD];
      const pid = pickedProject[key] ?? c.projects[0]?.id ?? "";
      const proj = c.projects.find((p) => p.id === pid);
      return (
        <div key={key} className={`${wrap} flex gap-2`}>
          {c.thumbnail && <img src={c.thumbnail} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />}
          <div className="min-w-0 flex-1">
            <a href={c.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium text-foreground hover:underline">{c.title}</a>
            {c.author && <p className="text-muted-foreground">{c.author}{c.durationSec ? ` · ${Math.round(c.durationSec / 60)} min` : ""}</p>}
            <select aria-label={cc.pick} value={pid} disabled={done[key]} onChange={(e) => setPickedProject((p) => ({ ...p, [key]: e.target.value }))} className="mt-1 w-full rounded-md border border-border bg-background px-1.5 py-1 text-[11px]">
              {c.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button type="button" disabled={done[key] || !proj} onClick={() => proj && void mineUrl(key, c.url, c.title, c.author, proj.id, proj.personaId, false).catch((err) => setMessages((m) => [...m, { role: "model", text: describeThrowable(err) }]))} className={btn}>{done[key] ? copy.queued : cc.mine}</button>
          </div>
        </div>
      );
    }
    if (c.type === "remine") {
      const cc = CMD[(lang in CMD ? lang : "en") as keyof typeof CMD];
      return (
        <div key={key} className={wrap}>
          <p className="font-medium text-foreground">{c.title} · {c.urls.length}</p>
          {miningRules() && <p className="text-muted-foreground">{miningRules().slice(0, 160)}</p>}
          <button type="button" disabled={done[key]} onClick={() => void remineAll(key, c, cc.remineAsk, cc.remined)} className={btn}>{cc.remine}</button>
        </div>
      );
    }
    if (c.type === "role_split") {
      const cc = CMD[(lang in CMD ? lang : "en") as keyof typeof CMD];
      return (
        <div key={key} className={wrap}>
          <p className="text-foreground">{cc.splitText(c.keyCount, c.liveKeys, c.backgroundKeys)}</p>
          <button type="button" disabled={done[key]} onClick={() => { setDone((d) => ({ ...d, [key]: true })); void act(null, "role_split", { confirmed: true }); }} className={btn}>{cc.split}</button>
        </div>
      );
    }
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
    if (c.type === "system_audit")
      return (
        <div key={key} className={wrap}>
          <p className="font-semibold text-foreground">{c.score}/100</p>
          {c.issues.map((i) => (
            <p key={i.id} className="mt-1"><span className={i.count ? "text-destructive" : "text-primary"}>{i.count ? "✗" : "✓"}</span> <span className="text-foreground">{i.label}: {i.count}</span>{i.detail ? <span className="text-muted-foreground"> — {i.detail}</span> : null}</p>
          ))}
          {c.fixable && (
            <button type="button" disabled={done[key]} onClick={() => { setDone((d) => ({ ...d, [key]: true })); void act(copy.healAll, "auto_heal", {}); }} className={btn}>{copy.healAll}</button>
          )}
        </div>
      );
    if (c.type === "heal_result")
      return (
        <div key={key} className={wrap}>
          {c.fixed.map((f, i) => <p key={i} className="text-foreground">✓ {f}</p>)}
          {c.notes.map((n, i) => <p key={i} className="text-muted-foreground">• {n}</p>)}
          <button type="button" onClick={() => void act(copy.audit, "audit_system", {})} className={btn}>{copy.audit}</button>
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
          className="fixed left-4 z-50 flex h-[38rem] max-h-[calc(100dvh-11rem)] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
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

          <OperatorMindSelector value={operatorMind.id} onChange={operatorMind.change} disabled={thinking} />
          <div className="max-h-[55%] shrink-0 overflow-y-auto">
          <MindRoster operatorMindId={operatorMind.id} ids={roster.ids} onChange={roster.change} refreshToken={errorCount + messages.length} onResult={(r) => setMessages((m) => [...m, { role: "model", text: r.text, actions: r.actions_taken, operator: r.operator }])} />
          <ArchitectOperator key={operatorMind.id} operatorMindId={operatorMind.id} ids={roster.ids} proposal={operatorProposal} onResult={(r) => setMessages((m) => [...m, { role: "model", text: r.text, actions: r.actions_taken, cards: r.interactive_cards, operator: r.operator }])} />
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

          <details className="shrink-0 border-b border-border px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">{lang === "mn" ? "Бусад хэрэгслүүд" : lang === "ko" ? "기타 도구" : "More tools"}</summary>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              disabled={thinking}
              onClick={() => void act(copy.audit, "audit_system", {})}
              className="w-full rounded-lg bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {copy.audit}
            </button>
            {copy.chips.map((label, i) => (
              <button
                key={label}
                type="button"
                disabled={thinking}
                onClick={() => {
                  const topic = i === 0 ? input.trim() : "";
                  if (topic) setInput("");
                  void act(label, CHIP_ACTIONS[i] ?? "health", { ...(topic ? { topic } : {}), ...(presetProject ? { projectId: presetProject } : {}) });
                }}
                className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-foreground hover:border-primary disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
          </details>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[95%] px-1 py-1 text-sm text-foreground">
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.actions && m.actions.length > 0 && (
                      <p className="mt-1 text-[10px] text-muted-foreground">✓ {m.actions.join(" · ")}</p>
                    )}
                    {m.operator?.draft && <button type="button" className={btn} disabled={thinking} onClick={() => void publishDirectiveDraft(m)}>{lang === "mn" ? "Нийтлэх" : lang === "ko" ? "게시" : "Publish"}</button>}
                    {m.operator?.postId && <button type="button" className={btn} disabled={thinking} onClick={() => void act(null, "undo_operator_post", { postId: m.operator?.postId })}>{lang === "mn" ? "Буцаах" : lang === "ko" ? "실행 취소" : "Undo"}</button>}
                    {m.cards?.map((c, j) => renderCard(c, `${i}-${j}`))}
                    {m.keyOffer && (
                      <button type="button" disabled={done[`key-${m.keyOffer.id}`]} onClick={() => m.keyOffer && void saveKey(m.keyOffer)} className={btn}>
                        {done[`key-${m.keyOffer.id}`] ? CMD[(lang in CMD ? lang : "en") as keyof typeof CMD].saved : CMD[(lang in CMD ? lang : "en") as keyof typeof CMD].save}
                      </button>
                    )}
                    {m.provider && <p className="mt-1 text-[10px] text-muted-foreground">{copy.by}: {m.provider}</p>}
                  </div>
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
