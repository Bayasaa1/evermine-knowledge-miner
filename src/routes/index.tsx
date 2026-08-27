import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Heart, MessageCircle, Pause, Play, Sparkles, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { BottomNav } from "@/components/bottom-nav";
import { TalkToMindModal } from "@/components/talk-to-mind-modal";
import { RobotSyncModal } from "@/components/robot-sync-modal";
import { loadFeed, marketplaceFeed, type FeedItem } from "@/lib/feed";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Evermine Feed — Talk to real minds" },
      {
        name: "description",
        content:
          "A vertical video feed of AI Minds mined from real creators. Talk to any mind instantly, or sync its VLA robot brain over the air.",
      },
      { property: "og:title", content: "Evermine Feed — Talk to real minds" },
      {
        property: "og:description",
        content: "Scroll real creators' minds, ask them anything, and deploy their robot brains via QR.",
      },
    ],
  }),
  component: HomeFeed,
});

function HomeFeed() {
  const [items, setItems] = useState<FeedItem[]>(() => marketplaceFeed());
  const [muted, setMuted] = useState(true);
  const [active, setActive] = useState(0);
  const [talk, setTalk] = useState<FeedItem | null>(null);
  const [robot, setRobot] = useState<FeedItem | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [subscribed, setSubscribed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void loadFeed().then(setItems).catch(() => undefined);
  }, []);

  return (
    <div className="dark min-h-screen bg-black text-white">
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between px-4 py-3">
        <span className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Evermine
        </span>
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
            subscribed={!!subscribed[item.id]}
            onLike={() => setLiked((s) => ({ ...s, [item.id]: !s[item.id] }))}
            onSubscribe={() => {
              setSubscribed((s) => ({ ...s, [item.id]: !s[item.id] }));
              toast.success(
                subscribed[item.id]
                  ? `Unsubscribed from ${item.creator}`
                  : item.price > 0
                    ? `Subscribed to ${item.creator} — ${item.currency} ${item.price}/mo`
                    : `Subscribed to ${item.creator} — free`,
              );
            }}
            onTalk={() => setTalk(item)}
            onRobot={() => setRobot(item)}
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
      <BottomNav />
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
  subscribed,
  onLike,
  onSubscribe,
  onTalk,
  onRobot,
}: {
  item: FeedItem;
  muted: boolean;
  index: number;
  isActive: boolean;
  onVisible: (i: number) => void;
  liked: boolean;
  subscribed: boolean;
  onLike: () => void;
  onSubscribe: () => void;
  onTalk: () => void;
  onRobot: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

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

  return (
    <section
      ref={ref}
      className="relative flex h-[100dvh] w-full snap-start items-center justify-center overflow-hidden bg-neutral-950"
    >
      {item.src ? (
        <video
          ref={videoRef}
          src={item.src}
          poster={item.poster}
          muted={muted}
          loop
          playsInline
          onClick={toggle}
          className="h-full w-full object-cover"
        />
      ) : (
        <img src={item.poster} alt={item.title} className="h-full w-full object-cover" />
      )}

      {paused && item.src && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center bg-black/20"
        >
          <Play className="h-14 w-14 opacity-80" />
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      {/* Right action rail */}
      <div className="absolute bottom-28 right-3 z-10 flex flex-col items-center gap-5">
        <button type="button" onClick={onLike} aria-label="Like" className="flex flex-col items-center gap-1">
          <Heart className={`h-7 w-7 ${liked ? "fill-primary text-primary" : ""}`} />
          <span className="text-[10px]">Like</span>
        </button>
        <button type="button" onClick={onTalk} aria-label="Talk to Mind" className="flex flex-col items-center gap-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <MessageCircle className="h-5 w-5" />
          </span>
          <span className="text-[10px]">Talk to Mind</span>
        </button>
        <button type="button" onClick={onRobot} aria-label="Robot Sync QR" className="flex flex-col items-center gap-1">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur">
            <Bot className="h-5 w-5" />
          </span>
          <span className="text-[10px]">Robot Sync</span>
        </button>
        {item.src && (
          <button type="button" onClick={toggle} aria-label="Pause" className="opacity-70">
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* Creator overlay */}
      <div className="absolute inset-x-0 bottom-24 z-10 px-4 pr-20">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
            {item.creator.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.creator}</p>
            <p className="truncate text-[11px] text-white/60">{item.handle}</p>
          </div>
          <button
            type="button"
            onClick={onSubscribe}
            className={`ml-auto rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              subscribed ? "border border-white/40 bg-transparent" : "bg-primary text-primary-foreground"
            }`}
          >
            {subscribed ? "Subscribed" : item.price > 0 ? `Subscribe · ${item.currency} ${item.price}` : "Subscribe · Free"}
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
    </section>
  );
}
