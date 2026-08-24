import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  Square,
  Star,
  Volume2,
  X,
  Download,
  Sparkles,
} from "lucide-react";
import { ModeSwitch } from "@/components/mode-switch";
import { MINDS, pickVisual, type Mind, type VisualAsset } from "@/lib/minds";
import {
  applyDelta,
  emptyVault,
  exportUserVault,
  loadCaptureEnabled,
  loadVault,
  mineUserTurns,
  saveCaptureEnabled,
  saveVault,
  vaultSignals,
  type UserVault,
} from "@/lib/user-vault";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Evermine — Mind Feed" },
      {
        name: "description",
        content:
          "Swipe a vertical feed of Evermine Mind Vaults, chat in a bottom sheet or start a full-screen AI call — while your own Subconsciousness Vault is mined in the background.",
      },
      { property: "og:title", content: "Evermine — Mind Feed" },
      {
        property: "og:description",
        content: "Swipe AI Clone Mind Vaults, chat or call, and build your own Mind Vault as you talk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Explore,
});

type Via = "text" | "call";
type Msg = {
  id: string;
  role: "user" | "agent";
  text: string;
  via: Via;
  visual?: VisualAsset | null;
};

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
  const [index, setIndex] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);

  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [capture, setCapture] = useState(true);
  const [vault, setVault] = useState<UserVault>(() => emptyVault());
  const [mining, setMining] = useState(false);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const pendingRef = useRef<string[]>([]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const selected = MINDS[index] ?? MINDS[0]!;
  const messages = threads[selected.id] ?? [greeting(selected)];

  /* ---------- user vault bootstrapping ---------- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [v, c] = await Promise.all([loadVault(), loadCaptureEnabled()]);
      console.log("[miner] boot", JSON.stringify(v), c);
      if (!alive) return;
      setVault(v);
      setCapture(c);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- feed scroll tracking ---------- */
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = Math.round(el.scrollTop / el.clientHeight);
        setIndex((prev) => (next !== prev && next >= 0 && next < MINDS.length ? next : prev));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  const goTo = useCallback((next: number) => {
    const el = feedRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(MINDS.length - 1, next));
    el.scrollTo({ top: clamped * el.clientHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (chatOpen || callOpen || vaultOpen) return;
      if (e.key === "ArrowDown") goTo(index + 1);
      if (e.key === "ArrowUp") goTo(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, goTo, chatOpen, callOpen, vaultOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking, chatOpen]);

  useEffect(() => {
    if (chatOpen) composerRef.current?.focus();
  }, [chatOpen, thinking]);

  /* ---------- speech ---------- */
  function stopSpeaking() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  function speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text.replace(/[*_`#>[\]()]/g, ""));
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utter);
  }

  /* ---------- background Mind Miner ---------- */
  const flushMiner = useCallback(
    async (force = false) => {
      console.log("[miner] capture", capture);
      if (!capture) {
        pendingRef.current = [];
        return;
      }
      console.log("[miner] flush", force, pendingRef.current.length);
      const batch = pendingRef.current;
      if (batch.length === 0 || (!force && batch.length < 2)) return;
      pendingRef.current = [];
      setMining(true);
      const delta = await mineUserTurns(batch);
      if (delta) {
        setVault((prev) => {
          const next = applyDelta(prev, delta, batch.length);
          void saveVault(next);
          return next;
        });
      }
      setMining(false);
    },
    [capture],
  );

  /* ---------- conversation ---------- */
  async function send(rawText: string, via: Via) {
    const text = rawText.trim();
    if (!text || thinking) return;
    setError(null);
    setInput("");
    const userMsg: Msg = { id: uid(), role: "user", text, via };
    const history = [...messages, userMsg];
    setThreads((t) => ({ ...t, [selected.id]: history }));
    setThinking(true);

    if (capture) {
      pendingRef.current.push(text);
      void flushMiner(true);
    }

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
      setError(e instanceof Error ? e.message : "This mind could not answer right now.");
      reply =
        selected.coreBrain.sampleLines[history.length % selected.coreBrain.sampleLines.length] ??
        selected.coreBrain.sampleLines[0]!;
    }

    if (!reply) reply = "I don't have that in my mined brain yet.";
    const visual = pickVisual(selected, `${text} ${reply}`);
    setThreads((t) => ({
      ...t,
      [selected.id]: [...(t[selected.id] ?? history), { id: uid(), role: "agent", text: reply, via, visual }],
    }));
    setThinking(false);
    if (via === "call") speak(reply);
  }

  function toggleListening() {
    const SR =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
        : undefined;
    if (!SR) {
      setError("Voice input isn't supported in this browser — type instead.");
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
      if (said) void send(said, "call");
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

  function endCall() {
    recognitionRef.current?.stop();
    setListening(false);
    stopSpeaking();
    setCallOpen(false);
    void flushMiner(true);
  }

  async function toggleCapture(on: boolean) {
    setCapture(on);
    await saveCaptureEnabled(on);
    if (!on) pendingRef.current = [];
  }

  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");
  const lastUser = [...messages].reverse().find((m) => m.role === "user");

  return (
    <div className="dark relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Brain className="h-4.5 w-4.5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Mind Feed</p>
            <p className="text-[11px] text-white/60">Swipe up for the next Mind</p>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => setVaultOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-xs font-medium text-white backdrop-blur-md"
          >
            <Sparkles className={`h-4 w-4 ${mining ? "animate-pulse text-primary" : "text-white/70"}`} />
            My Vault
            <span className="rounded-full bg-primary/20 px-1.5 text-[10px] text-primary">
              {vaultSignals(vault)}
            </span>
          </button>
          <div className="hidden sm:block">
            <ModeSwitch />
          </div>
        </div>
      </header>

      {/* Vertical snap feed */}
      <div
        ref={feedRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {MINDS.map((mind, i) => (
          <section
            key={mind.id}
            className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden"
          >
            <img
              src={mind.cover}
              alt={`${mind.name} highlight`}
              loading={i === 0 ? "eager" : "lazy"}
              width={640}
              height={1152}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/60" />

            {/* Info overlay */}
            <div className="absolute inset-x-0 bottom-0 z-10 max-w-[calc(100%-5.5rem)] p-5 pb-8">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 text-base font-semibold text-white"
                  style={{ borderColor: mind.accent, background: `${mind.accent}33` }}
                >
                  {mind.shortName.slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{mind.name}</p>
                  <p className="truncate text-xs text-white/70">{mind.domain}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/90">{mind.highlight}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {mind.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/20 bg-black/30 px-2 py-0.5 text-[11px] text-white/80 backdrop-blur-sm"
                  >
                    {tag}
                  </span>
                ))}
                <span className="rounded-full bg-primary/25 px-2 py-0.5 text-[11px] text-primary">
                  ${mind.perQuery.toFixed(2)}/query
                </span>
              </div>
            </div>

            {/* Right action rail */}
            <div className="absolute bottom-8 right-3 z-20 flex flex-col items-center gap-5">
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/40 backdrop-blur-md">
                  <Star className="h-5 w-5 text-status-amber" />
                </div>
                <span className="text-[11px] text-white/80">{mind.rating.toFixed(1)}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => {
                    setIndex(i);
                    setChatOpen(true);
                  }}
                  aria-label={`Chat with ${mind.shortName}`}
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md transition-transform active:scale-95"
                >
                  <MessageSquare className="h-6 w-6" />
                </button>
                <span className="text-[11px] text-white/80">Chat</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => {
                    setIndex(i);
                    setCallOpen(true);
                  }}
                  aria-label={`Call ${mind.shortName}`}
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
                >
                  <Phone className="h-6 w-6" />
                </button>
                <span className="text-[11px] text-white/80">AI Call</span>
              </div>
            </div>

            {/* Desktop / accessible nav */}
            <div className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 lg:flex">
              <button
                onClick={() => goTo(i - 1)}
                disabled={i === 0}
                aria-label="Previous mind"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md disabled:opacity-30"
              >
                <ChevronUp className="h-5 w-5" />
              </button>
              <button
                onClick={() => goTo(i + 1)}
                disabled={i === MINDS.length - 1}
                aria-label="Next mind"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md disabled:opacity-30"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </div>
          </section>
        ))}
      </div>

      {/* Feed position dots */}
      <div className="pointer-events-none absolute left-2 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5">
        {MINDS.map((m, i) => (
          <span
            key={m.id}
            className={`h-1.5 w-1.5 rounded-full transition-colors ${
              i === index ? "bg-primary" : "bg-white/30"
            }`}
          />
        ))}
      </div>

      {/* Chat bottom sheet */}
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[78dvh] flex-col rounded-t-3xl border-t border-border bg-background/95 backdrop-blur-xl transition-transform duration-300 ${
          chatOpen ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!chatOpen}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-muted" />
        </div>
        <div className="flex items-center gap-3 px-4 pb-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold"
            style={{ borderColor: selected.accent, background: `${selected.accent}22` }}
          >
            {selected.shortName.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{selected.shortName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {capture ? "Mind Miner is capturing your side" : "Mind Miner off"}
            </p>
          </div>
          <button
            onClick={() => setCallOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-label="Start AI call"
          >
            <Phone className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => setChatOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground"
            aria-label="Close chat"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 pb-2">
          {messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                {m.role === "agent" ? (
                  <div className="markdown-chat leading-relaxed">
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
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Volume2 className="h-3 w-3" />
                    {speaking ? "Stop" : "Play voice"}
                  </button>
                )}
              </div>
            </div>
          ))}
          {thinking && (
            <div className="max-w-[80%] animate-pulse rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
              {selected.shortName} is thinking…
            </div>
          )}
          {error && <p className="text-xs text-status-red">{error}</p>}
        </div>

        <div className="flex items-end gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <textarea
            ref={composerRef}
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
            className="max-h-28 min-w-0 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => void send(input, "text")}
            disabled={!input.trim() || thinking}
            aria-label="Send message"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Full-screen AI video call */}
      {callOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-black">
          <img
            src={selected.cover}
            alt=""
            width={640}
            height={1152}
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/90" />

          <div className="relative z-10 flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-white">{selected.name}</p>
              <p className="text-[11px] text-white/70">
                {speaking ? "Speaking…" : thinking ? "Thinking…" : listening ? "Listening…" : "Connected"}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur-md">
              <Sparkles className={`h-3.5 w-3.5 ${mining ? "animate-pulse text-primary" : "text-white/50"}`} />
              {capture ? (mining ? "Mining your mind…" : "Mind Miner on") : "Mind Miner off"}
            </span>
          </div>

          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6">
            <div
              className={`flex h-36 w-36 items-center justify-center rounded-full border-4 text-4xl font-semibold text-white transition-transform ${
                speaking ? "scale-105 animate-pulse" : ""
              }`}
              style={{ borderColor: selected.accent, background: `${selected.accent}33` }}
            >
              {selected.shortName.slice(0, 2)}
            </div>
            <div className="max-h-40 w-full max-w-md space-y-2 overflow-y-auto text-center">
              {lastUser && <p className="text-xs text-white/60">You: {lastUser.text}</p>}
              {lastAgent && (
                <p className="text-base leading-relaxed text-white">
                  {lastAgent.text.replace(/[*_`#>[\]()]/g, "")}
                </p>
              )}
            </div>
            {error && <p className="text-xs text-status-red">{error}</p>}
          </div>

          <div className="relative z-10 space-y-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <label className="mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-xs text-white/85 backdrop-blur-md">
              <span>Capture my Subconsciousness during calls</span>
              <input
                type="checkbox"
                checked={capture}
                onChange={(e) => void toggleCapture(e.target.checked)}
                className="h-5 w-9 shrink-0 appearance-none rounded-full bg-white/20 transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-primary checked:before:translate-x-4.5"
              />
            </label>
            <div className="flex items-center justify-center gap-5">
              <button
                onClick={() => setChatOpen(true)}
                aria-label="Open chat"
                className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md active:scale-95"
              >
                <MessageSquare className="h-6 w-6" />
              </button>
              <button
                onClick={toggleListening}
                disabled={thinking}
                aria-label={listening ? "Stop listening" : "Start speaking"}
                className={`flex h-20 w-20 items-center justify-center rounded-full transition-transform active:scale-95 disabled:opacity-50 ${
                  listening ? "bg-status-red text-white" : "bg-primary text-primary-foreground"
                }`}
              >
                {listening ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
              </button>
              <button
                onClick={speaking ? stopSpeaking : endCall}
                aria-label={speaking ? "Stop voice" : "End call"}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-status-red/90 text-white active:scale-95"
              >
                {speaking ? <Square className="h-5 w-5" /> : <PhoneOff className="h-6 w-6" />}
              </button>
            </div>
            <p className="text-center text-[11px] text-white/50">
              Tap the mic, speak, and the clone answers out loud.
            </p>
          </div>
        </div>
      )}

      {/* My Mind Vault sheet */}
      {vaultOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <Brain className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">My Subconsciousness Vault</p>
              <p className="text-[11px] text-muted-foreground">
                Mined from your own turns · {vault.turns} captured · stays on this device
              </p>
            </div>
            <button
              onClick={() => setVaultOpen(false)}
              aria-label="Close vault"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <label className="flex items-center justify-between gap-3 rounded-[12px] border border-border bg-card px-4 py-3 text-sm">
              <span>Capture my Subconsciousness during calls</span>
              <input
                type="checkbox"
                checked={capture}
                onChange={(e) => void toggleCapture(e.target.checked)}
                className="h-5 w-9 shrink-0 appearance-none rounded-full bg-muted transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-primary checked:before:translate-x-4.5"
              />
            </label>
            {(
              [
                ["Interests", vault.interests],
                ["Beliefs & values", vault.beliefs],
                ["Problems you're solving", vault.questions],
                ["Tone notes", vault.toneNotes],
              ] as const
            ).map(([label, items]) => (
              <div key={label} className="rounded-[12px] border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                {items.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Nothing mined yet — talk to a Mind and this fills itself in.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm text-foreground">
                    {items.map((it) => (
                      <li key={it} className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <button
              onClick={() => exportUserVault(vault)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              <Download className="h-4 w-4" /> Export my Mind Vault
            </button>
            <div className="sm:hidden">
              <ModeSwitch />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
