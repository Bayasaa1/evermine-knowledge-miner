import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  FolderOpen,
  Heart,
  Loader2,
  MessageCircle,
  Pause,
  Phone,
  Play,
  Sparkles,
  Star,
  Video as VideoIcon,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { TalkToMindModal } from "@/components/talk-to-mind-modal";
import { RobotSyncModal } from "@/components/robot-sync-modal";
import { MindFeedback } from "@/components/mind-feedback";
import { MindReviews } from "@/components/mind-reviews";
import { YouTubeStage } from "@/components/youtube-stage";
import { loadFeed, marketplaceFeed, type FeedItem } from "@/lib/feed";
import type { TimelineMark } from "@/lib/projects";
import { capabilitiesFor, primaryActionFor, type Capability } from "@/lib/capabilities";
import { listPurchases, purchaseMind } from "@/lib/purchases";
import { useAuth } from "@/hooks/use-auth";

/** mm:ss stamp for mined timeline marks. */
function stamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Latest mark whose timestamp has already passed. */
function markAt(marks: TimelineMark[] | undefined, now: number): TimelineMark | null {
  if (!marks?.length) return null;
  let found: TimelineMark | null = null;
  for (const m of marks) {
    if (m.t <= now + 0.5) found = m;
    else break;
  }
  return found;
}


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Evermind Feed — Talk to real minds" },
      {
        name: "description",
        content:
          "A vertical video feed of AI Minds mined from real creators. Talk to any mind instantly, or unlock its VLA robot brain after purchase.",
      },
      { property: "og:title", content: "Evermind Feed — Talk to real minds" },
      {
        property: "og:description",
        content: "Scroll real creators' minds, ask them anything, and unlock robot deployment after buying.",
      },
    ],
  }),
  component: HomeFeed,
});

const mindKey = (item: FeedItem) => item.mindId ?? item.id;

function HomeFeed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>(() => marketplaceFeed());
  const [muted, setMuted] = useState(true);
  const [active, setActive] = useState(0);
  const [talk, setTalk] = useState<FeedItem | null>(null);
  const [robot, setRobot] = useState<FeedItem | null>(null);
  const [feedback, setFeedback] = useState<FeedItem | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    void loadFeed().then(setItems).catch(() => undefined);
  }, []);

  const refreshPurchases = useCallback(async () => {
    if (!user) {
      setOwned({});
      return;
    }
    const rows = await listPurchases().catch(() => []);
    setOwned(Object.fromEntries(rows.map((r) => [r.mind_id, true])));
  }, [user]);

  useEffect(() => {
    void refreshPurchases();
  }, [refreshPurchases]);

  const buy = async (item: FeedItem) => {
    if (!user) {
      toast.error("Sign in to buy this mind.");
      void navigate({ to: "/auth" });
      return;
    }
    const key = mindKey(item);
    setBuying(key);
    const { error } = await purchaseMind({ mindId: key, category: item.category });
    setBuying(null);
    if (error) {
      toast.error(`Purchase failed: ${error}`);
      return;
    }
    setOwned((s) => ({ ...s, [key]: true }));
    toast.success(
      item.price > 0
        ? `Unlocked ${item.creator} — ${item.currency} ${item.price}`
        : `Unlocked ${item.creator} — free`,
    );
  };

  const runPrimary = (item: FeedItem) => {
    const action = primaryActionFor(item.category);
    if (action.capability === "robot") setRobot(item);
    else if (action.capability === "voice") setTalk(item);
    else void navigate({ to: "/vaults" });
  };

  return (
    <div className="dark min-h-screen bg-black pb-28 text-white">
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 py-3">
        <h1 className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Evermind — Talk to real minds
        </h1>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Unmute" : "Mute"}
          className="pointer-events-auto rounded-full bg-black/40 p-2 backdrop-blur"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </header>

      <main className="h-[100dvh] snap-y snap-mandatory overflow-y-scroll">
        {items.map((item, i) => (
          <FeedCard
            key={item.id}
            item={item}
            muted={muted}
            index={i}
            onVisible={setActive}
            isActive={active === i}
            liked={!!liked[item.id]}
            purchased={!!owned[mindKey(item)]}
            buying={buying === mindKey(item)}
            onLike={() => setLiked((s) => ({ ...s, [item.id]: !s[item.id] }))}
            onBuy={() => void buy(item)}
            onPrimary={() => runPrimary(item)}
            onTalk={() => setTalk(item)}
            onRobot={() => setRobot(item)}
            onVault={() => void navigate({ to: "/vaults" })}
            onFeedback={() => setFeedback(item)}
          />
        ))}
      </main>

      <TalkToMindModal
        open={!!talk}
        onClose={() => setTalk(null)}
        mindId={talk?.mindId ?? null}
        mindName={talk?.creator ?? ""}
      />
      <RobotSyncModal open={!!robot} onClose={() => setRobot(null)} item={robot} />
      {feedback && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-background p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{feedback.title}</h2>
              <button type="button" aria-label="Close" onClick={() => setFeedback(null)}>
                <X className="h-5 w-5 text-foreground" />
              </button>
            </div>
            <MindFeedback mindId={mindKey(feedback)} purchased={!!owned[mindKey(feedback)]} />
          </div>
        </div>
      )}
    </div>
  );
}

function FeedCard({
  item,
  muted,
  index,
  isActive,
  onVisible,
  liked,
  purchased,
  buying,
  onLike,
  onBuy,
  onPrimary,
  onTalk,
  onRobot,
  onVault,
  onFeedback,
}: {
  item: FeedItem;
  muted: boolean;
  index: number;
  isActive: boolean;
  onVisible: (i: number) => void;
  liked: boolean;
  purchased: boolean;
  buying: boolean;
  onLike: () => void;
  onBuy: () => void;
  onPrimary: () => void;
  onTalk: () => void;
  onRobot: () => void;
  onVault: () => void;
  onFeedback: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(0);

  const caps = capabilitiesFor(item.category);
  const primary = primaryActionFor(item.category);
  const has = (c: Capability) => caps.includes(c);
  const activeMark = markAt(item.timeline, now);
  const activeEmotion = markAt(item.emotionTimeline, now);


  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) onVisible(index);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [index, onVisible]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive && !paused) void v.play().catch(() => undefined);
    else v.pause();
  }, [isActive, paused]);

  const toggle = useCallback(() => setPaused((p) => !p), []);
  const locked = () => toast.error("Purchase this mind to unlock this service.");

  return (
    <section
      ref={ref}
      className="relative flex h-[100dvh] w-full snap-start items-center justify-center overflow-hidden bg-neutral-950"
    >
      {/* Blurred backdrop on desktop so wide screens never stretch the vertical video */}
      {item.poster && (
        <img
          src={item.poster}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden h-full w-full scale-110 object-cover opacity-50 blur-3xl lg:block"
        />
      )}
      <div className="pointer-events-none absolute inset-0 hidden bg-black/40 lg:block" />

      {/* 9:16 player frame: full-bleed mobile, contained pane on tablet, centered frame on desktop/4K */}
      <div className="relative h-[100dvh] w-full overflow-hidden md:h-[min(100dvh-6rem,860px)] md:w-auto md:max-w-[480px] md:rounded-2xl md:border md:border-white/10 md:shadow-2xl md:[aspect-ratio:9/16]">
        {item.youtubeId ? (
          <YouTubeStage
            videoId={item.youtubeId}
            active={isActive}
            muted={muted}
            paused={paused}
            onTime={setNow}
            onToggle={toggle}
          />
        ) : item.src ? (
          <video
            ref={videoRef}
            src={item.src}
            poster={item.poster}
            muted={muted}
            loop
            playsInline
            onClick={toggle}
            className="h-full w-full object-cover md:object-contain md:bg-black"
          />
        ) : (
          <img src={item.poster} alt={item.title} className="h-full w-full object-cover md:object-contain md:bg-black" />
        )}

        {paused && (item.src || item.youtubeId) && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Play"
            className="absolute inset-0 flex items-center justify-center bg-black/20"
          >
            <Play className="h-14 w-14 opacity-80" />
          </button>
        )}

        {/* Live mined knowledge + emotion tags, aligned to what is playing */}
        {(activeMark || activeEmotion) && (
          <div className="pointer-events-none absolute left-3 top-16 z-20 max-w-[62%] space-y-1.5">
            {activeMark && (
              <p className="rounded-xl bg-black/55 px-2.5 py-1.5 text-[11px] leading-snug backdrop-blur">
                <span className="mr-1.5 font-mono text-primary">{stamp(activeMark.t)}</span>
                {activeMark.label}
              </p>
            )}
            {activeEmotion && (
              <span className="inline-flex items-center rounded-full bg-primary/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
                {activeEmotion.emotion ?? activeEmotion.label}
              </span>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      {/* Right action rail — only the services this creator enabled */}
      <div className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-5 md:bottom-8">
        <button type="button" onClick={onLike} aria-label="Like" className="flex flex-col items-center gap-1">
          <Heart className={`h-7 w-7 ${liked ? "fill-primary text-primary" : ""}`} />
          <span className="text-[10px]">Like</span>
        </button>

        {has("chat") && (
          <button type="button" onClick={onTalk} aria-label="Text Chat" className="flex flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="text-[10px]">{purchased ? "Text Chat" : "Preview Chat"}</span>
          </button>
        )}

        {has("voice") && (
          <button
            type="button"
            onClick={purchased ? onTalk : locked}
            aria-label="Voice Call"
            className={`flex flex-col items-center gap-1 ${purchased ? "" : "opacity-40"}`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur">
              <Phone className="h-5 w-5" />
            </span>
            <span className="text-[10px]">Voice Call</span>
          </button>
        )}

        {has("video") && (
          <button
            type="button"
            onClick={purchased ? onTalk : locked}
            aria-label="Video Call AI"
            className={`flex flex-col items-center gap-1 ${purchased ? "" : "opacity-40"}`}
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur">
              <VideoIcon className="h-5 w-5" />
            </span>
            <span className="text-[10px]">Video Call</span>
          </button>
        )}

        {/* Robot deployment only exists after purchase — never a free action */}
        {has("robot") && purchased && (
          <button type="button" onClick={onRobot} aria-label="Deploy to Robot" className="flex flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur">
              <Bot className="h-5 w-5" />
            </span>
            <span className="text-[10px]">Deploy to Robot</span>
          </button>
        )}

        {has("asset") && purchased && (
          <button type="button" onClick={onVault} aria-label="Files and assets" className="flex flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur">
              <FolderOpen className="h-5 w-5" />
            </span>
            <span className="text-[10px]">Assets</span>
          </button>
        )}

        <button type="button" onClick={onFeedback} aria-label="Comments and reviews" className="flex flex-col items-center gap-1">
          <Star className="h-7 w-7" />
          <span className="text-[10px]">Reviews</span>
        </button>

        {item.src && (
          <button type="button" onClick={toggle} aria-label="Pause" className="opacity-70">
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* Creator overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 px-4 pr-20 md:bottom-6 md:pr-16">
        <div className="mb-2 flex items-center gap-3">
          {item.avatarUrl ? (
            <img
              src={item.avatarUrl}
              alt={item.creator}
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
              {item.creator.slice(0, 2).toUpperCase()}
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.creator}</p>
            <p className="truncate text-[11px] text-white/60">{item.handle}</p>
          </div>
          <button
            type="button"
            onClick={purchased ? onPrimary : onBuy}
            disabled={buying}
            className={`pointer-events-auto ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
              purchased ? "border border-white/40 bg-transparent" : "bg-primary text-primary-foreground"
            }`}
          >
            {buying && <Loader2 className="h-3 w-3 animate-spin" />}
            {purchased
              ? primary.en
              : item.price > 0
                ? `Buy · ${item.currency} ${item.price}`
                : "Get · Free"}
          </button>
        </div>
        <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
        <p className="mt-1 line-clamp-2 text-xs text-white/70">{item.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
              #{tag}
            </span>
          ))}
        </div>
      </div>
      </div>

      {/* Tablet dual-pane: mined knowledge, emotions, and reviews beside the video */}
      <aside className="hidden h-[min(100dvh-6rem,860px)] w-[340px] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/60 backdrop-blur md:ml-6 md:flex lg:hidden">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="truncate text-sm font-semibold">{item.title}</p>
          <p className="truncate text-xs text-white/60">{item.creator} · {item.handle}</p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {item.timeline?.length ? (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">Mined timeline</h3>
              <ul className="space-y-1.5">
                {item.timeline.map((m) => (
                  <li
                    key={`${m.t}-${m.label}`}
                    className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-snug ${
                      activeMark === m ? "bg-primary/20 text-white" : "bg-white/5 text-white/70"
                    }`}
                  >
                    <span className="mr-1.5 font-mono text-primary">{stamp(m.t)}</span>
                    {m.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {item.emotionTimeline?.length ? (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-primary">Emotions</h3>
              <div className="flex flex-wrap gap-1.5">
                {item.emotionTimeline.map((m) => (
                  <span
                    key={`${m.t}-${m.label}`}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      activeEmotion === m ? "bg-primary text-primary-foreground" : "bg-primary/20 text-primary"
                    }`}
                  >
                    {stamp(m.t)} · {m.emotion ?? m.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          <div className="dark rounded-xl">
            <MindReviews mindId={item.mindId ?? item.id} />
          </div>
        </div>
      </aside>
    </section>
  );
}
