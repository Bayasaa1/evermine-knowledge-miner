import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Sparkles, X } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import type { Lang } from "@/lib/i18n";

type Msg = { role: "user" | "agent"; text: string };

/** Instant AI Q&A with the Mind behind a feed video. */
export function TalkToMindModal({
  open,
  onClose,
  mindId,
  mindName,
  lang = "en",
}: {
  open: boolean;
  onClose: () => void;
  mindId: string | null;
  mindName: string;
  lang?: Lang;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setMessages([]);
  }, [open, mindId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!open) return null;

  const send = async () => {
    const text = input.trim();
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
    } catch (e) {
      setMessages([...next, { role: "agent", text: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dark fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="flex h-[80vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card sm:h-[70vh] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {lang === "mn" ? "Оюунтай ярих" : lang === "ko" ? "대화하기" : "Talk to"} — {mindName}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {lang === "mn"
                ? "Энэ видеоны талаар шууд асуу — Оюун өөрийн мэдлэгээс хариулна."
                : lang === "ko"
                ? "이 영상에 대해 무엇이든 물어보세요 — 마인드가 자신의 채굴된 지식을 바탕으로 답합니다."
                : "Ask anything about this video — the Mind answers from its own mined brain."}
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
            placeholder={lang === "mn" ? "Асуултаа бичнэ үү…" : lang === "ko" ? "이 마인드에게 물어보세요…" : "Ask this mind…"}
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
