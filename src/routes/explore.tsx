import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Brain,
  Compass,
  Search,
  Sparkles,
  Send,
  Star,
  Clock,
  MessageSquare,
  ShieldCheck,
  Mic,
  MicOff,
  Video,
  Volume2,
  Square,
} from "lucide-react";
import { ModeSwitch } from "@/components/mode-switch";
import { MINDS, pickVisual, type Mind, type VisualAsset } from "@/lib/minds";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Evermine — Mind Marketplace" },
      {
        name: "description",
        content:
          "Browse Evermine Mind Vaults and talk with an AI Clone by text, voice or video avatar — grounded in the creator's mined Core Brain.",
      },
      { property: "og:title", content: "Evermine — Mind Marketplace" },
      {
        property: "og:description",
        content: "Browse Mind Vaults and talk with AI Clones by text, voice or video.",
      },
    ],
  }),
  component: Explore,
});

type Mode = "text" | "voice" | "video";
type Msg = {
  id: string;
  role: "user" | "agent";
  text: string;
  via: Mode;
  visual?: VisualAsset | null;
};

const MODES: { id: Mode; label: string; emoji: string; icon: typeof MessageSquare }[] = [
  { id: "text", label: "Text Chat", emoji: "💬", icon: MessageSquare },
  { id: "voice", label: "Voice Talk", emoji: "🎙️", icon: Mic },
  { id: "video", label: "Video Avatar", emoji: "📹", icon: Video },
];

function uid() {
  return Math.random().toString(36).slice(2);
}

function greeting(mind: Mind): Msg {
  return {
    id: uid(),
    role: "agent",
    via: "text",
    text: `You're talking with **${mind.name}**, a preview clone built from this Mind Vault's Core Brain. Ask me about ${mind.domain.toLowerCase()} — I answer in my own words, from my own beliefs.`,
  };
}

function Explore() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Mind>(MINDS[0]!);
  const [mode, setMode] = useState<Mode>("text");
  const [messages, setMessages] = useState<Msg[]>(() => [greeting(MINDS[0]!)]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MINDS;
    return MINDS.filter((m) =>
      [m.name, m.domain, m.bio, ...m.tags].some((v) => v.toLowerCase().includes(q)),
    );
  }, [query]);

  useEffect(() => {
    setMessages([greeting(selected)]);
    setError(null);
    stopSpeaking();
  }, [selected]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSpeechSupported("speechSynthesis" in window);
  }, []);

  useEffect(() => {
    if (mode === "text") textareaRef.current?.focus();
  }, [mode, thinking]);

  function stopSpeaking() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.replace(/[*_`#>\[\]()]/g, ""));
    utter.rate = 1;
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }

  async function send(rawText: string, via: Mode) {
    const text = rawText.trim();
    if (!text || thinking) return;
    setError(null);
    setInput("");
    const userMsg: Msg = { id: uid(), role: "user", text, via };
    const history = [...messages, userMsg];
    setMessages(history);
    setThinking(true);

    let reply = "";
    try {
      const res = await fetch("/api/mind-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mindId: selected.id,
          messages: history.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "This mind could not answer right now.");
      reply = (data.text ?? "").trim();
    } catch (e) {
      const message = e instanceof Error ? e.message : "This mind could not answer right now.";
      setError(message);
      reply =
        selected.coreBrain.sampleLines[history.length % selected.coreBrain.sampleLines.length] ??
        selected.coreBrain.sampleLines[0]!;
    }

    if (!reply) reply = "I don't have that in my mined brain yet.";
    const visual = pickVisual(selected, `${text} ${reply}`);
    setMessages((m) => [...m, { id: uid(), role: "agent", text: reply, via, visual }]);
    setThinking(false);
    if (via !== "text") speak(reply);
  }

  function toggleListening() {
    const SR =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) {
      setError("Voice input isn't supported in this browser — type your message instead.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      const said = ev.results[0]?.[0]?.transcript ?? "";
      if (said) void send(said, mode);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      setError("Couldn't hear that — check microphone permission.");
    };
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="mx-auto flex min-w-0 max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Brain className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                Mind Marketplace
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Browse Mind Vaults and talk with AI Clones
              </p>
            </div>
          </div>
          <ModeSwitch />
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex min-w-0 flex-wrap items-center gap-4 rounded-[12px] border border-border bg-card px-4 py-4 sm:px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Compass className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Explorer Mode
            </p>
            <p className="text-sm font-semibold text-foreground">
              {MINDS.length} Mind Vaults available in preview
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-status-green" />
            Signed vaults only
          </div>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[1fr_1.05fr]">
          {/* Marketplace list */}
          <section className="min-w-0 space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search minds, skills or domains…"
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {filtered.map((m) => {
                const active = m.id === selected.id;
                return (
                  <article
                    key={m.id}
                    className={`flex min-w-0 flex-col rounded-[12px] border bg-card p-5 transition-colors ${
                      active ? "border-primary/70" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-foreground">
                          {m.name}
                        </h3>
                        <p className="truncate text-xs text-muted-foreground">{m.domain}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-foreground">
                        <Star className="h-3 w-3 text-status-amber" />
                        {m.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-3 flex-1 text-sm text-muted-foreground">{m.bio}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />${m.hourly}/hr
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5" />${m.perQuery.toFixed(2)}/query
                        </span>
                      </div>
                      <button
                        onClick={() => setSelected(m)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {active ? "Talking" : "Talk"}
                      </button>
                    </div>
                  </article>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground">No minds match that search.</p>
              )}
            </div>
          </section>

          {/* Mind interaction */}
          <section className="flex min-w-0 flex-col rounded-[12px] border border-border bg-card">
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-foreground">{selected.name}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  Preview clone · {selected.access === "public" ? "Public vault" : "Private vault"} ·
                  ${selected.perQuery.toFixed(2)}/query
                </p>
              </div>
            </div>

            {/* Mode switcher */}
            <div className="border-b border-border p-4">
              <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted p-1">
                {MODES.map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setMode(m.id);
                        if (m.id === "text") stopSpeaking();
                      }}
                      className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span aria-hidden="true">{m.emoji}</span>
                      <Icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{m.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Switch modes anytime — the conversation stays the same.
              </p>
            </div>

            {/* Video avatar stage */}
            {mode === "video" && (
              <div className="border-b border-border p-5">
                <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-[12px] border border-border bg-gradient-to-b from-muted to-background">
                  <div
                    className={`flex h-20 w-20 items-center justify-center rounded-full border-2 text-2xl font-semibold text-foreground transition-transform ${
                      speaking ? "animate-pulse scale-105" : ""
                    }`}
                    style={{ borderColor: selected.accent, background: `${selected.accent}22` }}
                  >
                    {selected.shortName.slice(0, 2)}
                  </div>
                  <span className="absolute bottom-3 left-3 rounded-full bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground">
                    {speaking ? "Speaking…" : thinking ? "Thinking…" : "Avatar idle"}
                  </span>
                  {speaking && (
                    <button
                      onClick={stopSpeaking}
                      className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-[11px] text-foreground"
                    >
                      <Square className="h-3 w-3" /> Stop
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Video avatar preview drives the mined voice profile; photoreal rendering unlocks
                  with a full vault license.
                </p>
              </div>
            )}

            {/* Transcript (shared across all modes) */}
            <div ref={scrollRef} className="min-h-[300px] flex-1 space-y-3 overflow-y-auto p-5">
              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div
                    className={`max-w-[88%] rounded-[12px] px-3.5 py-2.5 text-sm ${
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {m.via !== "text" && (
                      <span className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider opacity-70">
                        {m.via === "voice" ? <Mic className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                        {m.via}
                      </span>
                    )}
                    {m.role === "agent" ? (
                      <div className="markdown-chat space-y-2 leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    )}
                    {m.visual && (
                      <figure className="mt-3 overflow-hidden rounded-lg border border-border">
                        <img
                          src={m.visual.src}
                          alt={m.visual.label}
                          loading="lazy"
                          width={768}
                          height={512}
                          className="h-auto w-full"
                        />
                        <figcaption className="bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground">
                          Visual Data · {m.visual.label} · [{m.visual.timestamp}]
                        </figcaption>
                      </figure>
                    )}
                    {m.role === "agent" && (
                      <button
                        onClick={() => (speaking ? stopSpeaking() : speak(m.text))}
                        disabled={!speechSupported}
                        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                      >
                        <Volume2 className="h-3 w-3" />
                        {speaking ? "Stop" : "Play voice"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="max-w-[85%] animate-pulse rounded-[12px] bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                  {selected.shortName} is thinking…
                </div>
              )}
            </div>

            {error && (
              <p className="border-t border-border px-5 py-2 text-xs text-status-red">{error}</p>
            )}

            {/* Composer */}
            <div className="border-t border-border p-4">
              {mode === "text" ? (
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    rows={1}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send(input, "text");
                      }
                    }}
                    placeholder={`Ask ${selected.shortName} something…`}
                    className="max-h-32 min-w-0 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => void send(input, "text")}
                    disabled={!input.trim() || thinking}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={toggleListening}
                    disabled={thinking}
                    className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                      listening
                        ? "bg-status-red/15 text-status-red"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {listening ? "Listening — tap to stop" : "Hold a conversation"}
                  </button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void send(input, mode);
                    }}
                    placeholder="…or type instead"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => void send(input, mode)}
                    disabled={!input.trim() || thinking}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
