import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eraser, FileText, Loader2, Paperclip, Mic, MicOff, Pencil, PhoneOff, Send, Sparkles, Trash2, Video, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { apiFetch } from "@/lib/api-fetch";
import { useDisplayTexts, useLang, type Lang } from "@/lib/i18n";
import { useMindCall } from "@/hooks/use-mind-call";
import { MindAvatar } from "@/components/mind-avatar";
import { eraseBrain, mergeSession } from "@/lib/viewer-brain.functions";
import { listChatHistory, appendChatMessages, deleteChatMessages, clearChatHistory } from "@/lib/cloud-vault.functions";
import { useAuth } from "@/hooks/use-auth";
import { AiLevelButton, AiLevelSlider } from "@/components/ai-level-control";
import { useMindAiLevel } from "@/hooks/use-ai-level";
import { ATTACH_ACCEPT, readAttachment, splitAttachments } from "@/lib/chat-attach";


type Msg = { role: "user" | "agent"; text: string; id?: string };

/** Instant AI Q&A with the Mind behind a feed video. */
export function TalkToMindModal({
  open,
  onClose,
  mindId,
  mindName,
  lang: langProp,
}: {
  open: boolean;
  onClose: () => void;
  mindId: string | null;
  mindName: string;
  lang?: Lang;
}) {
  const { lang: activeLang } = useLang();
  const lang: Lang = langProp ?? activeLang;
  const [heading, empty, placeholder, newChatLabel, resetConfirm] = useDisplayTexts([
    "Talk to",
    "Ask anything about this video — the Mind answers from its own mined brain.",
    "Ask this mind…",
    "New chat",
    "Fully reset this chat? All messages and this Mind's memory of you will be deleted. This cannot be undone.",
  ]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [callMode, setCallMode] = useState<"chat" | "voice" | "video">("chat");
  // How much the AI may add on top of what this mind actually learned.
  // 0 = only the mined records, 100 = the AI fills every gap.
  const { level: aiLevel, setLevel: setAiLevel, max: aiLevelMax } = useMindAiLevel(mindId);
  const [showLevel, setShowLevel] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ name: string; block: string }[]>([]);
  const [attaching, setAttaching] = useState(0);
  const [attachError, setAttachError] = useState<string | null>(null);
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => undefined);
  const call = useMindCall(mindId, lang, (text) => void sendRef.current(text));
  const [faceUrl, setFaceUrl] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const sessionStartRef = useRef<string | null>(null);
  const turnsRef = useRef<Msg[]>([]);
  const mergeSessionFn = useServerFn(mergeSession);
  const loadHistory = useServerFn(listChatHistory);
  const saveMessages = useServerFn(appendChatMessages);
  const eraseBrainFn = useServerFn(eraseBrain);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const removeMessages = useServerFn(deleteChatMessages);
  const clearHistory = useServerFn(clearChatHistory);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  // The parent clears mindId at the same moment it closes the window, so the
  // closing merge would otherwise lose the mind it belongs to.
  const lastMindRef = useRef<string | null>(null);
  if (mindId) lastMindRef.current = mindId;

  /** Writes one stretch of turns to the cloud so it survives closing the window. */
  const persistTurns = async (turns: Msg[]) => {
    const target = mindId ?? lastMindRef.current;
    if (!isAuthenticated || !target || turns.length === 0) return;
    try {
      const res = await saveMessages({
        data: { mindId: target, lang, messages: turns.map((t) => ({ role: t.role, body: t.text })) },
      });
      const ids = res.ids ?? [];
      // Attach the saved ids to the newest unsaved messages so they can be edited/deleted.
      setMessages((cur) => {
        const copy = [...cur];
        let j = ids.length - 1;
        for (let i = copy.length - 1; i >= 0 && j >= 0; i--) {
          const m = copy[i]; const nid = ids[j]; if (m && !m.id && nid) { copy[i] = { ...m, id: nid }; j--; }
        }
        return copy;
      });
    } catch {
      // best-effort: the conversation still reads fine on screen
    }
  };

  const mergeCurrentSession = async () => {
    const target = mindId ?? lastMindRef.current;
    if (!isAuthenticated || !target || !sessionStartRef.current) return;
    const turns = turnsRef.current;
    if (turns.length === 0) return;
    const startedAt = sessionStartRef.current;
    const endedAt = new Date().toISOString();
    // Claim this stretch of conversation before the network call so switching
    // between chat, voice and video cannot save the same turns twice or
    // measure the next stretch from the first one's start time.
    turnsRef.current = [];
    sessionStartRef.current = endedAt;
    const seconds = Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
    try {
      await mergeSessionFn({
        data: {
          mindId: target,
          startedAt,
          endedAt,
          mode: callMode,
          turns,
          seconds,
          lang,
        },
      });
    } catch {
      // best-effort memory merge
    }
  };

  useEffect(() => {
    if (open) {
      setMessages([]);
      sessionStartRef.current = new Date().toISOString();
      turnsRef.current = [];
      // Bring back everything already said with this mind.
      if (isAuthenticated && mindId) {
        let cancelled = false;
        setLoadingHistory(true);
        void (async () => {
          try {
            const rows = await loadHistory({ data: { mindId } });
            if (!cancelled) {
              setMessages(
                rows.map((r) => ({ id: r.id, role: r.role === "user" ? "user" : "agent", text: r.body }) as Msg),
              );
            }
          } catch {
            // no saved history yet
          } finally {
            if (!cancelled) setLoadingHistory(false);
          }
        })();
        return () => {
          cancelled = true;
        };
      }
    } else {
      void mergeCurrentSession();
      call.stop();
    }
    return undefined;
  }, [open, mindId, isAuthenticated]);

  // The creator's own face, only when they built and consented to a face clone.
  useEffect(() => {
    setFaceUrl(null);
    if (!open || !mindId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/mind-face?mindId=${encodeURIComponent(mindId)}`);
        const data = (await res.json()) as { imageUrl?: string | null };
        if (!cancelled) setFaceUrl(data.imageUrl ?? null);
      } catch {
        /* stand-in face is fine */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mindId]);

  // Video call: the Mind looks at the caller (frames are read live, never kept).
  useEffect(() => {
    if (callMode !== "video" || !camRef.current) {
      call.stopCamera();
      return;
    }
    void call.startCamera(camRef.current, mindName).catch(() => {});
  }, [callMode, mindName]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  if (!open) return null;

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setAttachError(null);
    for (const file of Array.from(list).slice(0, 5)) {
      setAttaching((n) => n + 1);
      try {
        const block = await readAttachment(file);
        setAttachments((a) => [...a, { name: file.name, block }]);
      } catch (e) {
        setAttachError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setAttaching((n) => n - 1);
      }
    }
  };

  const send = async (spoken?: string) => {
    const typed = (spoken ?? input).trim();
    const files = spoken ? "" : attachments.map((a) => a.block).join("");
    const text = `${typed || (files ? (lang === "mn" ? "Энэ файлыг хараарай." : lang === "ko" ? "이 파일을 봐 주세요." : "Take a look at this file.") : "")}${files}`;
    if (!text || busy || attaching > 0) return;
    if (!spoken) setAttachments([]);
    // Editing an earlier message: everything from that point on is replaced.
    let base = messages;
    if (editIndex !== null) {
      base = messages.slice(0, editIndex);
      const dropped = messages.slice(editIndex).map((m) => m.id).filter((x): x is string => !!x);
      if (dropped.length) void removeMessages({ data: { ids: dropped } }).catch(() => {});
      setEditIndex(null);
    }
    const next: Msg[] = [...base, { role: "user", text }];
    setMessages(next);
    turnsRef.current = [...turnsRef.current, { role: "user", text }];
    setInput("");
    setBusy(true);
    try {
      if (!mindId) throw new Error("This mind is still private to its creator.");
      const live = callMode !== "chat";
      const res = await apiFetch("/api/mind-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mindId,
          lang,
          messages: next,
          stream: live,
          seen: call.sees || undefined,
          aiLevel,
        }),
      });

      // On a call the answer is spoken phrase by phrase while it is still being
      // written, so the voice starts almost immediately instead of after a wait.
      if (live && res.ok && res.body && (res.headers.get("Content-Type") ?? "").includes("text/event-stream")) {
        const voice = call.speakStreaming();
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let carry = "";
        let full = "";
        setMessages([...next, { role: "agent", text: "" }]);
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          carry += value;
          const lines = carry.split("\n");
          carry = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload) as { delta?: string; error?: string };
              if (evt.error) throw new Error(evt.error);
              if (!evt.delta) continue;
              full += evt.delta;
              const clean = full.replace(/\[\[clip:[^\]]+\]\]/g, "");
              voice.push(evt.delta.replace(/\[\[clip:[^\]]+\]\]/g, ""));
              setMessages([...next, { role: "agent", text: clean }]);
            } catch {
              /* keep-alive */
            }
          }
        }
        voice.end();
        const answer = full.replace(/\[\[clip:[^\]]+\]\]/g, "").trim();
        if (!answer) throw new Error(lang === "mn" ? "Сонгосон AI хариу өгсөнгүй. Дахин оролдоно уу." : lang === "ko" ? "선택한 AI가 답하지 않았습니다. 다시 시도하세요." : "The selected AI did not answer. Try again.");
        setMessages([...next, { role: "agent", text: answer }]);
        turnsRef.current = [...turnsRef.current, { role: "agent", text: answer }];
        void persistTurns([
          { role: "user", text },
          { role: "agent", text: answer },
        ]);
        return;
      }

      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`);
      const answer = (data.text ?? "").replace(/\[\[clip:[^\]]+\]\]/g, "").trim();
      if (!answer) throw new Error(lang === "mn" ? "Сонгосон AI хариу өгсөнгүй. Дахин оролдоно уу." : lang === "ko" ? "선택한 AI가 답하지 않았습니다. 다시 시도하세요." : "The selected AI did not answer. Try again.");
      setMessages([...next, { role: "agent", text: answer }]);
      turnsRef.current = [...turnsRef.current, { role: "agent", text: answer }];
      // Saved right away so closing the window never loses the conversation.
      void persistTurns([
        { role: "user", text },
        { role: "agent", text: answer },
      ]);
      if (callMode !== "chat") call.speak(answer);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setMessages([...next, { role: "agent", text: err }]);
      turnsRef.current = [...turnsRef.current, { role: "agent", text: err }];
    } finally {
      setBusy(false);
    }

  };
  sendRef.current = send;

  const deleteMessage = (i: number) => {
    const m = messages[i];
    if (!m || !window.confirm("Delete this message?")) return;
    setMessages((cur) => cur.filter((_, k) => k !== i));
    if (m.id) void removeMessages({ data: { ids: [m.id] } }).catch(() => {});
  };

  const resetChat = async () => {
    const target = mindId ?? lastMindRef.current;
    if (!window.confirm(resetConfirm)) return;
    setMessages([]);
    setEditIndex(null);
    turnsRef.current = [];
    if (isAuthenticated && target) {
      try { await clearHistory({ data: { mindId: target } }); } catch { /* ignore */ }
      // The Mind's memory of the viewer goes too — a full fresh start.
      try { await eraseBrainFn({ data: { mindId: target } }); } catch { /* ignore */ }
    }
  };

  return (
    <div className="dark fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
       <div className="flex h-[80vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card sm:h-[70vh] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {heading} — {mindName}
          </h2>
          <AiLevelButton level={aiLevel} open={showLevel} onToggle={() => setShowLevel((v) => !v)} />
          <button type="button" onClick={() => { void mergeCurrentSession(); setCallMode((mode) => mode === "voice" ? "chat" : "voice"); }} aria-label="Voice call" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Mic className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { void mergeCurrentSession(); setCallMode((mode) => mode === "video" ? "chat" : "video"); }} aria-label="Video call" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Video className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => void resetChat()} aria-label={newChatLabel} title={newChatLabel} className="flex items-center gap-1 rounded-full px-2 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Eraser className="h-4 w-4" />
            <span className="hidden text-[11px] sm:inline">{newChatLabel}</span>
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {showLevel && (
          <AiLevelSlider mindId={mindId} level={aiLevel} max={aiLevelMax} lang={lang} onChange={setAiLevel} />
        )}

        {callMode !== "chat" && (
          <div className="flex flex-col items-center gap-3 border-b border-border bg-muted/30 p-5">
            {callMode === "video" && (
              <div className="flex w-full items-center justify-center gap-4">
                <MindAvatar imageUrl={faceUrl} mouth={call.mouth} emotion={call.emotion} speaking={call.speaking} size={128} />
                <video ref={camRef} muted playsInline className="h-24 w-32 rounded-lg border border-border object-cover" />
              </div>
            )}
            {callMode === "voice" && (
              <MindAvatar imageUrl={faceUrl} mouth={call.mouth} emotion={call.emotion} speaking={call.speaking} size={96} />
            )}
            {callMode === "video" && call.sees && (
              <p className="max-w-xs text-center text-[11px] italic text-muted-foreground">Sees: {call.sees}</p>
            )}
            <p className="text-xs font-medium text-muted-foreground">{call.listening ? "Listening…" : call.speaking ? "Speaking…" : `${mindName} AI Mind call`}</p>

            <div className="flex gap-3">
              <button 
                type="button" 
                onPointerDown={(e) => { e.preventDefault(); try { void call.startListening(); } catch (error) { setMessages((current) => [...current, { role: "agent", text: error instanceof Error ? error.message : String(error) }]); } }}
                onPointerUp={(e) => { e.preventDefault(); call.stopListening(); }}
                onPointerLeave={() => { if (call.listening) call.stopListening(); }}
                aria-label={call.listening ? "Recording..." : "Hold to speak"}
                className={`rounded-full p-3 transition-transform active:scale-95 ${call.listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
              >
                {call.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button type="button" onClick={() => { void mergeCurrentSession(); call.stop(); setCallMode("chat"); }} aria-label="End call" className="rounded-full bg-destructive p-3 text-destructive-foreground">
                <PhoneOff className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {loadingHistory ? "…" : empty}
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`group flex items-center gap-1 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${editIndex === i ? "ring-2 ring-ring " : ""}${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {m.role === "agent" ? (
                <div className="prose prose-sm prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                </div>
              ) : (
                (() => {
                  const { body, files } = splitAttachments(m.text);
                  return (
                    <>
                      {files.map((f, k) => (
                        <span key={k} className="mb-1 flex items-center gap-1 rounded bg-primary-foreground/15 px-2 py-1 text-xs">
                          <FileText className="h-3 w-3 shrink-0" /> <span className="truncate">{f.name}</span>
                        </span>
                      ))}
                      {body}
                    </>
                  );
                })()
              )}
            </div>
            <div className="flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100">
              {m.role === "user" && (
                <button type="button" aria-label="Edit" onClick={() => { setEditIndex(i); setInput(splitAttachments(m.text).body); }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              <button type="button" aria-label="Delete" onClick={() => deleteMessage(i)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            </div>
          ))}
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Replying" />}
          <div ref={endRef} />
        </div>

        {editIndex !== null && (
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>Editing — messages after this one will be replaced.</span>
            <button type="button" onClick={() => { setEditIndex(null); setInput(""); }} className="underline">Cancel</button>
          </div>
        )}
        {(attachments.length > 0 || attaching > 0 || attachError) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 pt-2 text-xs">
            {attachments.map((a, k) => (
              <span key={k} className="flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                <FileText className="h-3 w-3" /> <span className="max-w-[140px] truncate">{a.name}</span>
                <button type="button" aria-label="Remove file" onClick={() => setAttachments((x) => x.filter((_, j) => j !== k))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {attaching > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> {lang === "mn" ? "Файл уншиж байна…" : lang === "ko" ? "파일 읽는 중…" : "Reading file…"}
              </span>
            )}
            {attachError && <span className="text-destructive">{attachError}</span>}
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-border p-3">
          <input ref={fileRef} type="file" multiple accept={ATTACH_ACCEPT} className="hidden" onChange={(e) => { void pickFiles(e.target.files); e.target.value = ""; }} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label={lang === "mn" ? "Файл хавсаргах" : lang === "ko" ? "파일 첨부" : "Attach file"}
            title={lang === "mn" ? "Зураг, дуу, видео, Word, PDF, Excel" : lang === "ko" ? "사진, 음성, 영상, Word, PDF, Excel" : "Photo, voice, video, Word, PDF, Excel"}
            className="rounded-lg p-2.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="rounded-lg bg-primary p-2.5 text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
