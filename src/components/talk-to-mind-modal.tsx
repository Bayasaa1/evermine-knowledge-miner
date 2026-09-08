import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mic, MicOff, PhoneOff, Send, Sparkles, Video, X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { useDisplayTexts, useLang, type Lang } from "@/lib/i18n";
import { useMindCall } from "@/hooks/use-mind-call";
import { MindAvatar } from "@/components/mind-avatar";


type Msg = { role: "user" | "agent"; text: string };

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
  const [heading, empty, placeholder] = useDisplayTexts([
    "Talk to",
    "Ask anything about this video — the Mind answers from its own mined brain.",
    "Ask this mind…",
  ]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [callMode, setCallMode] = useState<"chat" | "voice" | "video">("chat");
  const endRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => undefined);
  const call = useMindCall(mindId, lang, (text) => void sendRef.current(text));
  const avatarStyle = emotionStyle(call.emotion);

  useEffect(() => {
    if (open) setMessages([]);
    else call.stop();
  }, [open, mindId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!open) return null;

  const send = async (spoken?: string) => {
    const text = (spoken ?? input).trim();
    if (!text || busy) return;
    const next: Msg[] = [...messages, { role: "user", text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      if (!mindId) throw new Error("This mind is still private to its creator.");
      const res = await apiFetch("/api/mind-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mindId, lang, messages: next }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `Request failed (${res.status})`);
      const answer = (data.text ?? "").replace(/\[\[clip:[^\]]+\]\]/g, "").trim();
      setMessages([...next, { role: "agent", text: answer || "…" }]);
      if (callMode !== "chat") call.speak(answer);
    } catch (e) {
      setMessages([...next, { role: "agent", text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  };
  sendRef.current = send;

  return (
    <div className="dark fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
       <div className="flex h-[80vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card sm:h-[70vh] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {heading} — {mindName}
          </h2>
          <button type="button" onClick={() => setCallMode((mode) => mode === "voice" ? "chat" : "voice")} aria-label="Voice call" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Mic className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setCallMode((mode) => mode === "video" ? "chat" : "video")} aria-label="Video call" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Video className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {callMode !== "chat" && (
          <div className="flex flex-col items-center gap-3 border-b border-border bg-muted/30 p-5">
            {callMode === "video" && (
              <div className={`relative flex h-28 w-28 items-center justify-center rounded-full bg-card ring-4 ${avatarStyle.ring}`}>
                <Sparkles className="h-10 w-10 text-primary" />
                <span className="absolute bottom-6 h-1.5 rounded-full bg-foreground transition-all" style={{ width: `${18 + call.mouth * 22}px`, transform: `scaleY(${1 + call.mouth * 3})` }} />
              </div>
            )}
            <p className="text-xs font-medium text-muted-foreground">{call.listening ? "Listening…" : call.speaking ? "Speaking…" : `${mindName} AI Mind call`}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => { try { call.listen(); } catch (error) { setMessages((current) => [...current, { role: "agent", text: error instanceof Error ? error.message : String(error) }]); } }} aria-label={call.listening ? "Stop listening" : "Speak"} className={`rounded-full p-3 ${call.listening ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
                {call.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button type="button" onClick={() => { call.stop(); setCallMode("chat"); }} aria-label="End call" className="rounded-full bg-destructive p-3 text-destructive-foreground">
                <PhoneOff className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {empty}
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
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
                m.text
              )}
            </div>
          ))}
          {busy && <div className="text-xs text-muted-foreground">…</div>}
          <div ref={endRef} />
        </div>

        <div className="flex items-center gap-2 border-t border-border p-3">
          <input
            value={input}
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
