import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/hooks/use-auth";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { appendChatMessages } from "@/lib/cloud-vault.functions";
import remarkGfm from "remark-gfm";
import {
  Brain,
  Trash2,
  Heart,
  Bell,
  UserPlus,
  UserCheck,
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
  Languages,
  Captions,
  CaptionsOff,
  PlayCircle,
  SignalHigh,
  SignalMedium,
  SignalLow,
} from "lucide-react";
import { ModeSwitch } from "@/components/mode-switch";
import { MINDS, pickVisual, pickClip, findClip, type Mind, type VisualAsset, type SourceClip } from "@/lib/minds";
import { AiLevelButton, AiLevelSlider } from "@/components/ai-level-control";
import { DEFAULT_AI_LEVEL, loadAiLevel } from "@/lib/ai-level";
import { LANGUAGES, LANG_LIST, type LangCode } from "@/lib/languages";
import { useLang } from "@/lib/i18n";
import { startDub, type DubHandle } from "@/lib/voice-dub";
import {
  inferEmotion,
  emotionStyle,
  EMOTION_LABEL,
  NEUTRAL_EMOTION,
  type AvatarEmotion,
} from "@/lib/emotion";
import { startSession, endSession, recordQuery } from "@/lib/analytics";
import { useNetworkQuality, TIER_LABEL, type StreamTier } from "@/lib/network-quality";
import { startMiningCapture, MINING_PROFILES, formatBytes, type MiningRecorderHandle } from "@/lib/mining-audio";

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
  removeVaultItem,
  deleteVault,
  type UserVault,
  type VaultField,
} from "@/lib/user-vault";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import {
  loadFollows,
  saveFollows,
  toggleFollow,
  loadFavorites,
  saveFavorites,
  toggleFavorite,
  isFavorite,
  resolveFavorite,
  loadNotifications,
  saveNotifications,
  unreadCount,
  enablePushNotifications,
  pushNotification,
  nextCreatorUpdate,
  type FavoriteClip,
  type CreatorNotification,
} from "@/lib/social";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Evermind — Mind Feed" },
      {
        name: "description",
        content:
          "Swipe a vertical feed of Evermind Mind Vaults, chat in a bottom sheet or start a full-screen AI call — while your own Subconsciousness Vault is mined in the background.",
      },
      { property: "og:title", content: "Evermind — Mind Feed" },
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
  clip?: SourceClip | null;
};

const CLIP_MARKER = /\[\[clip:([a-z0-9_-]+)\]\]/gi;

/** Pulls the model's citation marker out of the reply and returns clean prose. */
function extractClipId(text: string): { text: string; clipId: string | null } {
  let clipId: string | null = null;
  const clean = text.replace(CLIP_MARKER, (_m, id: string) => {
    clipId = id;
    return "";
  });
  return { text: clean.trim(), clipId };
}

/** A question is "complex" when it asks for reasoning, method or judgement. */
function isComplexQuestion(text: string): boolean {
  const t = text.toLowerCase();
  if (t.length > 60) return true;
  return /\b(how|why|what|when|should|explain|teach|best|difference|hyaltai|яаж|яагаад|юу)\b/.test(t);
}

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
  // How much the AI may add on top of what this mind learned (per mind).
  const [aiLevel, setAiLevel] = useState(DEFAULT_AI_LEVEL);
  const [showLevel, setShowLevel] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);

  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const { isAuthenticated: authed } = useAuth();
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { lang, setLang } = useLang();
  const [langOpen, setLangOpen] = useState(false);
  const [mouth, setMouth] = useState(0);
  const [emotion, setEmotion] = useState<AvatarEmotion>(NEUTRAL_EMOTION);
  const [dubbing, setDubbing] = useState(false);
  const [captions, setCaptions] = useState(false);

  const [capture, setCapture] = useState(true);
  const [vault, setVault] = useState<UserVault>(() => emptyVault());
  const [mining, setMining] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [follows, setFollows] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<FavoriteClip[]>([]);
  const [notifs, setNotifs] = useState<CreatorNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [openClip, setOpenClip] = useState<SourceClip | null>(null);
  const callSessionRef = useRef<string | null>(null);
  const chatSessionRef = useRef<string | null>(null);

  const feedRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const pendingRef = useRef<string[]>([]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const dubRef = useRef<DubHandle | null>(null);
  const minerAudioRef = useRef<MiningRecorderHandle | null>(null);

  /* ---------- adaptive streaming ---------- */
  const net = useNetworkQuality(callOpen);
  const [forceHd, setForceHd] = useState(false);
  const tier: StreamTier = forceHd ? "hd" : net.tier;
  const tierRef = useRef<StreamTier>(tier);
  tierRef.current = tier;
  const degraded = tier !== "hd";
  const [audioBytes, setAudioBytes] = useState(0);
  const [savedBytes, setSavedBytes] = useState(0);

  useEffect(() => {
    if (!callOpen) setForceHd(false);
  }, [callOpen]);

  /* ---------- compressed background mining capture ---------- */
  useEffect(() => {
    if (!callOpen || !capture) return;
    let handle: MiningRecorderHandle | null = null;
    let alive = true;
    void (async () => {
      handle = await startMiningCapture({
        getTier: () => tierRef.current,
        onBytes: (total, saved) => {
          setAudioBytes(total);
          setSavedBytes(saved);
        },
      });
      if (!alive) handle?.stop();
      else minerAudioRef.current = handle;
    })();
    return () => {
      alive = false;
      handle?.stop();
      minerAudioRef.current?.stop();
      minerAudioRef.current = null;
    };
  }, [callOpen, capture]);


  const selected = MINDS[index] ?? MINDS[0]!;
  const messages = threads[selected.id] ?? [greeting(selected)];

  /* ---------- user vault bootstrapping ---------- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [v, c] = await Promise.all([loadVault(), loadCaptureEnabled()]);
      if (!alive) return;
      setVault(v);
      setCapture(c);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- social: follows, favorites, notifications ---------- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [f, fav, n] = await Promise.all([loadFollows(), loadFavorites(), loadNotifications()]);
      if (!alive) return;
      setFollows(f);
      setFavorites(fav);
      setNotifs(n);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const onFollow = useCallback(
    async (mindId: string, shortName: string) => {
      const next = toggleFollow(follows, mindId);
      setFollows(next);
      await saveFollows(next);
      if (next.includes(mindId)) {
        const perm = await enablePushNotifications();
        toast.success(`Following ${shortName}`, {
          description:
            perm === "granted"
              ? "You'll get a push when they post a new video or update their AI Brain."
              : "Enable notifications to get alerts for new videos and Brain updates.",
        });
      } else {
        toast(`Unfollowed ${shortName}`);
      }
    },
    [follows],
  );

  const onFavorite = useCallback(
    async (mindId: string, clipId: string) => {
      const next = toggleFavorite(favorites, mindId, clipId);
      setFavorites(next);
      await saveFavorites(next);
      toast.success(isFavorite(next, clipId) ? "Saved to Favorite Clips" : "Removed from favorites");
    },
    [favorites],
  );

  /* Poll followed creators for new videos / Brain updates and push them. */
  const checkUpdates = useCallback(async () => {
    if (follows.length === 0) return;
    const n = await nextCreatorUpdate(follows);
    if (!n) return;
    setNotifs((prev) => {
      const list = [...prev, n];
      void saveNotifications(list);
      return list;
    });
    const delivered = await pushNotification(n);
    if (!delivered) toast(n.title, { description: n.body });
  }, [follows]);

  useEffect(() => {
    if (follows.length === 0) return;
    const t = window.setTimeout(() => void checkUpdates(), 6000);
    return () => window.clearTimeout(t);
  }, [follows, checkUpdates]);

  // Paused while the tab is hidden — no background polling.
  useVisibleInterval(() => void checkUpdates(), 45000, follows.length > 0);

  const openNotifications = useCallback(() => {
    setNotifOpen(true);
    setNotifs((prev) => {
      const list = prev.map((n) => ({ ...n, read: true }));
      void saveNotifications(list);
      return list;
    });
  }, []);

  const deleteOne = useCallback(

    async (field: VaultField, item: string) => {
      const next = removeVaultItem(vault, field, item);
      setVault(next);
      await saveVault(next);
      toast.success("Data point deleted");
    },
    [vault],
  );

  const deleteAll = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    setConfirmDelete(false);
    const fresh = await deleteVault();
    setVault(fresh);
    toast.success("All mined memory deleted from this device");
  }, [confirmDelete]);


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

  // Each mind remembers its own AI level on this device.
  useEffect(() => {
    setAiLevel(loadAiLevel(selected?.id ?? null));
  }, [selected?.id]);

  /* ---------- native voice dubbing + lip-sync ---------- */
  function stopSpeaking() {
    dubRef.current?.stop();
    dubRef.current = null;
    setSpeaking(false);
    setDubbing(false);
    setMouth(0);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function speak(text: string, emotionTag?: AvatarEmotion) {
    stopSpeaking();
    const clean = text.replace(/[*_`#>[\]()]/g, "").trim();
    if (!clean) return;
    const active = emotionTag ?? inferEmotion(clean);
    setEmotion(active);
    setDubbing(true);
    setSpeaking(true);
    const handle = startDub({
      mindId: selected.id,
      text: clean,
      lang,
      emotion: active,
      onViseme: setMouth,
      onStart: () => setDubbing(false),
      onError: (message) => {
        setError(message);
        setDubbing(false);
        setSpeaking(false);
        setMouth(0);
      },
    });
    dubRef.current = handle;
    void handle.done.then(() => {
      if (dubRef.current === handle) {
        dubRef.current = null;
        setSpeaking(false);
        setDubbing(false);
        setMouth(0);
      }
    });
  }

  useEffect(() => () => dubRef.current?.stop(), []);

  /* ---------- background Mind Miner ---------- */
  const flushMiner = useCallback(
    async (force = false) => {
      if (!capture) {
        pendingRef.current = [];
        return;
      }
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

    void (async () => {
      const ref = via === "call" ? callSessionRef : chatSessionRef;
      if (!ref.current) ref.current = await startSession(via === "call" ? "call" : "chat", selected.id);
      await recordQuery(ref.current);
    })();

    if (capture) {
      pendingRef.current.push(text);
      void flushMiner(true);
    }

    let reply = "";
    try {
      // Every answer runs on the caller's own key — the one they assigned to
      // "Chatting" in the API Manager, else their newest working key.
      const { credentialPayload } = await import("@/lib/api-keys");
      const res = await apiFetch("/api/mind-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mindId: selected.id,
          lang,
          messages: history.map((m) => ({ role: m.role, text: m.text })),
          aiLevel,
          ...(await credentialPayload("chat")),
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
    const { text: cleanReply, clipId } = extractClipId(reply);
    reply = cleanReply || reply;
    const visual = pickVisual(selected, `${text} ${reply}`);
    const clip =
      (clipId ? findClip(selected, clipId) : null) ??
      (isComplexQuestion(text) ? pickClip(selected, `${text} ${reply}`) : null);
    setThreads((t) => ({
      ...t,
      [selected.id]: [...(t[selected.id] ?? history), { id: uid(), role: "agent", text: reply, via, visual, clip }],
    }));
    setThinking(false);
    // Signed-in explorers keep a private, account-scoped copy of the thread.
    if (authed) {
      void appendChatMessages({
        data: {
          mindId: selected.id,
          lang,
          messages: [
            { role: "user" as const, body: text },
            { role: "agent" as const, body: reply },
          ],
        },
      }).catch(() => undefined);
    }
    // Dynamic emotion engine: the reply's emotion drives face + voice.
    const replyEmotion = inferEmotion(reply, selected.voiceProfile?.emotion);
    setEmotion(replyEmotion);
    if (via === "call") speak(reply, replyEmotion);

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
    rec.lang = LANGUAGES[lang].speechLang;
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
    if (callSessionRef.current) {
      void endSession(callSessionRef.current);
      callSessionRef.current = null;
    }
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
            <h1 className="text-sm font-semibold">Explore AI Minds — Evermind Mind Feed</h1>
            <p className="text-[11px] text-white/60">Swipe up for the next Mind</p>
          </div>
        </div>
        <div className="pointer-events-auto relative flex items-center gap-2">
          <button
            onClick={() => setLangOpen((o) => !o)}
            aria-label="Choose your native language"
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 text-xs font-medium text-white backdrop-blur-md"
          >
            <Languages className="h-4 w-4 text-primary" />
            {LANGUAGES[lang].native}
          </button>
          {langOpen && (
            <div className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-[12px] border border-border bg-card/95 shadow-xl backdrop-blur-xl">
              <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                Native voice dubbing — no subtitles
              </p>
              {LANG_LIST.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    stopSpeaking();
                    setLang(l.code);
                    setLangOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm ${
                    l.code === lang ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <span>{l.native}</span>
                  <span className="text-[11px] text-muted-foreground">{l.name}</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={openNotifications}
            aria-label="Creator updates"
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md"
          >
            <Bell className="h-4.5 w-4.5" />
            {unreadCount(notifs) > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {unreadCount(notifs)}
              </span>
            )}
          </button>
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
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-white">{mind.name}</p>
                  <p className="truncate text-xs text-white/70">{mind.domain}</p>
                </div>
                <button
                  onClick={() => void onFollow(mind.id, mind.shortName)}
                  aria-pressed={follows.includes(mind.id)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-colors ${
                    follows.includes(mind.id)
                      ? "border border-white/25 bg-black/40 text-white backdrop-blur-md"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {follows.includes(mind.id) ? (
                    <>
                      <UserCheck className="h-4 w-4" /> Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" /> Follow Mind
                    </>
                  )}
                </button>
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

              {mind.clips.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-white/60">
                    Favorite Clips
                  </p>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {mind.clips.map((clip) => (
                      <div
                        key={clip.id}
                        className="relative w-32 shrink-0 overflow-hidden rounded-[12px] border border-white/15 bg-black/40 backdrop-blur-md"
                      >
                        <button
                          onClick={() => setOpenClip(clip)}
                          className="block w-full text-left"
                          aria-label={`Play ${clip.label}`}
                        >
                          <img
                            src={clip.poster}
                            alt={clip.label}
                            loading="lazy"
                            className="h-16 w-full object-cover"
                          />
                          <p className="line-clamp-2 px-2 py-1.5 text-[10px] leading-snug text-white/85">
                            {clip.label}
                          </p>
                        </button>
                        <button
                          onClick={() => void onFavorite(mind.id, clip.id)}
                          aria-label={
                            isFavorite(favorites, clip.id)
                              ? `Remove ${clip.label} from favorites`
                              : `Favorite ${clip.label}`
                          }
                          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm"
                        >
                          <Heart
                            className={`h-3.5 w-3.5 ${
                              isFavorite(favorites, clip.id)
                                ? "fill-primary text-primary"
                                : "text-white/80"
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

        {/* Select Persona / Specialization — chat and calls only ever query the
            selected Mind Vault's Core Brain, keeping tone and logic isolated. */}
        <div className="border-b border-border px-4 pb-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Select Persona / Specialization
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {MINDS.map((m, i) => {
              const active = m.id === selected.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setIndex(i)}
                  aria-pressed={active}
                  className={`flex w-36 shrink-0 items-center gap-2 rounded-[12px] border p-2 text-left transition-colors ${
                    active
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold"
                    style={{ borderColor: m.accent, background: `${m.accent}22` }}
                  >
                    {m.shortName.slice(0, 2)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-foreground">
                      {m.shortName}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {m.domain}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full border text-xs font-semibold"
            style={{ borderColor: selected.accent, background: `${selected.accent}22` }}
          >
            {selected.shortName.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{selected.shortName}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {LANGUAGES[lang].native} voice · {capture ? "Mind Miner on" : "Mind Miner off"}
            </p>
          </div>
          <AiLevelButton level={aiLevel} open={showLevel} onToggle={() => setShowLevel((v) => !v)} />
          <button
            onClick={() => setCallOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
            aria-label="Start AI call"
          >
            <Phone className="h-4.5 w-4.5" />
          </button>
          <button
            onClick={() => {
              setChatOpen(false);
              if (chatSessionRef.current) {
                void endSession(chatSessionRef.current);
                chatSessionRef.current = null;
              }
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground"
            aria-label="Close chat"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {showLevel && (
          <AiLevelSlider mindId={selected.id} level={aiLevel} lang={lang} onChange={setAiLevel} />
        )}

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
                {m.role === "agent" && m.clip && (
                  <button
                    onClick={() => setOpenClip(m.clip ?? null)}
                    className="mt-3 flex w-full items-center gap-2.5 rounded-lg border border-border bg-card p-2 text-left transition-colors hover:border-primary/60"
                  >
                    <span className="relative block h-12 w-20 shrink-0 overflow-hidden rounded-md">
                      <img src={m.clip.poster} alt="" width={160} height={96} className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <PlayCircle className="h-5 w-5 text-white" />
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold text-primary">Source Clip · 5s</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {m.clip.label} · [{m.clip.timestamp}]
                      </span>
                    </span>
                  </button>
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

      {/* Creator updates from Minds you follow */}
      {notifOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl">
          <div className="flex items-center gap-3 border-b border-border p-4">
            <Bell className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Creator updates</p>
              <p className="text-[11px] text-muted-foreground">
                {follows.length} Mind{follows.length === 1 ? "" : "s"} followed
              </p>
            </div>
            <button
              onClick={() => setNotifOpen(false)}
              aria-label="Close notifications"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission !== "granted" && (
                <button
                  onClick={() => void enablePushNotifications()}
                  className="w-full rounded-[12px] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                >
                  Enable push notifications
                </button>
              )}
            {notifs.length === 0 ? (
              <p className="pt-6 text-center text-sm text-muted-foreground">
                Follow a Mind and you'll be notified here when they upload a new video or update
                their AI Brain.
              </p>
            ) : (
              [...notifs].reverse().map((n) => (
                <div key={n.id} className="rounded-[12px] border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-wider text-primary">
                    {n.kind === "video" ? "New video" : "Brain update"}
                  </p>
                </div>
              ))
            )}
            {favorites.length > 0 && (
              <div className="rounded-[12px] border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  My Favorite Clips
                </p>
                <div className="mt-3 space-y-2">
                  {favorites.map((f) => {
                    const r = resolveFavorite(f);
                    if (!r) return null;
                    return (
                      <button
                        key={f.clipId}
                        onClick={() => {
                          setNotifOpen(false);
                          setOpenClip(r.clip);
                        }}
                        className="flex w-full items-center gap-3 rounded-[12px] border border-border p-2 text-left"
                      >
                        <img
                          src={r.clip.poster}
                          alt=""
                          className="h-12 w-16 shrink-0 rounded-lg object-cover"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-foreground">
                            {r.clip.label}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {r.mind.shortName} · [{r.clip.timestamp}]
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {openClip && (
        <SourceClipModal
          clip={openClip}
          favorited={isFavorite(favorites, openClip.id)}
          onFavorite={() => {
            const owner = MINDS.find((m) => m.clips.some((c) => c.id === openClip.id));
            if (owner) void onFavorite(owner.id, openClip.id);
          }}
          onClose={() => setOpenClip(null)}
        />
      )}

      {/* Full-screen AI video call */}
      {callOpen && (
        <div className="absolute inset-0 z-50 flex flex-col bg-black">
          {tier === "hd" && (
            <img
              src={selected.cover}
              alt=""
              width={640}
              height={1152}
              className="absolute inset-0 h-full w-full object-cover opacity-40"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/90" />

          <div className="relative z-10 flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold text-white">{selected.name}</p>
              <p className="text-[11px] text-white/70">
                {dubbing
                  ? `Dubbing in ${LANGUAGES[lang].native}…`
                  : speaking
                    ? `Speaking ${LANGUAGES[lang].native}`
                    : thinking
                      ? "Thinking…"
                      : listening
                        ? "Listening…"
                        : `Connected · ${LANGUAGES[lang].native} voice`}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur-md">
              <Sparkles className={`h-3.5 w-3.5 ${mining ? "animate-pulse text-primary" : "text-white/50"}`} />
              {capture ? (mining ? "Mining your mind…" : "Mind Miner on") : "Mind Miner off"}
            </span>
          </div>

          {/* Connectivity status + auto-fallback banner */}
          <div className="relative z-10 mx-4 -mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-md"
              style={{
                borderColor: degraded ? "rgba(245,158,11,.5)" : "rgba(34,197,94,.45)",
                color: degraded ? "hsl(38 92% 62%)" : "hsl(142 60% 62%)",
                background: "rgba(0,0,0,.4)",
              }}
            >
              {net.offline ? (
                <SignalLow className="h-3.5 w-3.5" />
              ) : degraded ? (
                <SignalMedium className="h-3.5 w-3.5" />
              ) : (
                <SignalHigh className="h-3.5 w-3.5" />
              )}
              {TIER_LABEL[tier]}
              {net.latency !== null && <span className="text-white/60">· {net.latency} ms</span>}
            </span>
            {degraded && !forceHd && (
              <>
                <span className="text-white/70">
                  {net.offline
                    ? "Connection lost — staying on voice."
                    : `Latency above 200 ms — video dropped automatically.`}
                </span>
                <button
                  onClick={() => setForceHd(true)}
                  className="rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-white/85 backdrop-blur-md"
                >
                  Force HD
                </button>
              </>
            )}
            {forceHd && (
              <button
                onClick={() => setForceHd(false)}
                className="rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-white/85 backdrop-blur-md"
              >
                Auto quality
              </button>
            )}
          </div>


          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6">
            {/* Lip-synced avatar: the mouth is driven by the live dubbed waveform */}
            <div
              className="relative flex h-40 w-40 items-center justify-center rounded-full border-4 transition-transform duration-75"
              style={{
                borderColor: selected.accent,
                background: `${selected.accent}33`,
                transform: `scale(${(1 + mouth * 0.06) * emotionStyle(emotion).scale})`,
                boxShadow: `0 0 ${20 + mouth * 60 + emotion.expression_intensity * 30}px ${selected.accent}${speaking ? "88" : "22"}, 0 0 ${30 * emotion.expression_intensity}px ${emotionStyle(emotion).glow}`,
              }}
            >
              {tier !== "audio" && (
                <img
                  src={selected.cover}
                  alt=""
                  width={320}
                  height={320}
                  className="absolute inset-0 h-full w-full rounded-full object-cover opacity-70"
                />
              )}
              <span className="relative text-4xl font-semibold text-white drop-shadow">
                {selected.shortName.slice(0, 2)}
              </span>
              {/* eyebrows shift with the active emotion */}
              <span
                aria-hidden
                className="absolute top-12 left-1/2 flex w-20 -translate-x-1/2 justify-between transition-transform duration-300"
                style={{ transform: `translateX(-50%) translateY(${-emotionStyle(emotion).browLift}px)` }}
              >
                <span className="h-[3px] w-7 rounded-full bg-black/60" style={{ transform: `rotate(${-emotionStyle(emotion).browLift}deg)` }} />
                <span className="h-[3px] w-7 rounded-full bg-black/60" style={{ transform: `rotate(${emotionStyle(emotion).browLift}deg)` }} />
              </span>
              {/* mouth: openness from the waveform, curve from the emotion */}
              <span
                aria-hidden
                className="absolute bottom-9 left-1/2 -translate-x-1/2 bg-black/70 transition-[height,width,border-radius] duration-75"
                style={{
                  width: `${34 + mouth * 16}px`,
                  height: `${3 + mouth * 26}px`,
                  opacity: speaking ? 0.85 : 0.25,
                  borderRadius:
                    emotionStyle(emotion).mouthCurve >= 0
                      ? `40% 40% 60% 60% / 20% 20% ${60 + emotionStyle(emotion).mouthCurve * 4}% ${60 + emotionStyle(emotion).mouthCurve * 4}%`
                      : `60% 60% 40% 40% / ${60 - emotionStyle(emotion).mouthCurve * 4}% ${60 - emotionStyle(emotion).mouthCurve * 4}% 20% 20%`,
                }}
              />
            </div>
            <p className="text-[11px] uppercase tracking-wide text-white/70">
              {lang === "mn" ? EMOTION_LABEL[emotion.primary_emotion].mn : EMOTION_LABEL[emotion.primary_emotion].en}
              <span className="ml-2 text-white/40">{Math.round(emotion.expression_intensity * 100)}%</span>
            </p>
            <p className="text-center text-[11px] text-white/60">
              {selected.shortName}'s cloned voice · speaking {LANGUAGES[lang].name} ·{" "}
              {tier === "hd" ? "HD video + lip-sync" : tier === "voice" ? "audio-reactive avatar" : "voice only"}
            </p>
            {capture && audioBytes > 0 && (
              <p className="text-center text-[11px] text-white/45">
                Mining audio compressed · {MINING_PROFILES[tier].label} · {formatBytes(audioBytes)} used ·{" "}
                {formatBytes(savedBytes)} saved
              </p>
            )}

            {captions && (
              <div className="max-h-40 w-full max-w-md space-y-2 overflow-y-auto text-center">
                {lastUser && <p className="text-xs text-white/60">You: {lastUser.text}</p>}
                {lastAgent && (
                  <p className="text-base leading-relaxed text-white">
                    {lastAgent.text.replace(/[*_`#>[\]()]/g, "")}
                  </p>
                )}
              </div>
            )}
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
                onClick={() => setCaptions((c) => !c)}
                aria-label={captions ? "Hide captions" : "Show captions"}
                className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md active:scale-95"
              >
                {captions ? <Captions className="h-6 w-6" /> : <CaptionsOff className="h-6 w-6 text-white/60" />}
              </button>
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
              Tap the mic and speak — {selected.shortName} answers out loud in{" "}
              {LANGUAGES[lang].native}, in their own cloned voice. Captions off by default.
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
            <div className="rounded-[12px] border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Privacy controls
              </p>
              <label className="mt-3 flex items-center justify-between gap-3 text-sm">
                <span>
                  Background Mind Mining
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {capture ? "Active during calls & chats" : "Paused — nothing is being mined"}
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={capture}
                  onChange={(e) => void toggleCapture(e.target.checked)}
                  className="h-5 w-9 shrink-0 appearance-none rounded-full bg-muted transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-primary checked:before:translate-x-4.5"
                />
              </label>
              <button
                onClick={() => void toggleCapture(!capture)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[12px] border border-border px-4 py-2.5 text-sm font-medium"
              >
                {capture ? <Square className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                {capture ? "Pause Background Mining" : "Resume Background Mining"}
              </button>
            </div>
            {(
              [
                ["Interests", "interests", vault.interests],
                ["Beliefs & values", "beliefs", vault.beliefs],
                ["Problems you're solving", "questions", vault.questions],
                ["Tone notes", "toneNotes", vault.toneNotes],
              ] as const
            ).map(([label, field, items]) => (
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
                      <li key={it} className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span className="flex-1">{it}</span>
                        <button
                          onClick={() => void deleteOne(field, it)}
                          aria-label={`Delete "${it}"`}
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
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
            <button
              onClick={() => void deleteAll()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[12px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              {confirmDelete ? "Tap again to permanently delete" : "Delete all my memory"}
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              Everything here lives only on this device. Deleting is immediate and irreversible.
            </p>

            <div className="sm:hidden">
              <ModeSwitch />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Plays the cited 5-second window from the creator's original source video. */
function SourceClipModal({
  clip,
  onClose,
  favorited,
  onFavorite,
}: {
  clip: SourceClip;
  onClose: () => void;
  favorited?: boolean;
  onFavorite?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clip.start;
    void v.play().catch(() => undefined);
    const onTime = () => {
      if (v.currentTime >= clip.end || v.currentTime < clip.start - 0.1) v.currentTime = clip.start;
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [clip]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-label="Source clip"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">Source Clip · [{clip.timestamp}]</p>
            <p className="truncate text-sm font-medium text-foreground">{clip.label}</p>
          </div>
          {onFavorite && (
            <button
              onClick={onFavorite}
              aria-label={favorited ? "Remove from favorites" : "Add to Favorite Clips"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"
            >
              <Heart className={`h-4 w-4 ${favorited ? "fill-primary text-primary" : "text-foreground"}`} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close clip"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <video
          ref={videoRef}
          src={clip.src}
          poster={clip.poster}
          playsInline
          muted
          controls
          className="max-h-[55dvh] w-full bg-black object-contain"
        />
        <blockquote className="border-t border-border px-4 py-3 text-sm italic text-muted-foreground">
          “{clip.quote}”
        </blockquote>
      </div>
    </div>
  );
}
