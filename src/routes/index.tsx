import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Captions,
  Volume2,
  VolumeX,
  X,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { TalkToMindModal } from "@/components/talk-to-mind-modal";
import { RobotSyncModal } from "@/components/robot-sync-modal";
import { MindFeedback } from "@/components/mind-feedback";
import { YouTubeStage } from "@/components/youtube-stage";
import { loadFeed, loadFeedTracks, type FeedItem } from "@/lib/feed";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pickCopy, useDisplayText, useDisplayTexts, useLang } from "@/lib/i18n";
import type { TimelineMark } from "@/lib/projects";
import { capabilitiesFor, primaryActionFor, type Capability } from "@/lib/capabilities";
import { listPurchases, purchaseMind } from "@/lib/purchases";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

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

type TimedCue = { start: number; end: number; speech: string; speaker: string };

const MAX_SUBTITLE_WORDS = 7;
const MAX_SUBTITLE_CHARS = 46;
/** Shortest time a caption phrase may stay on screen. */
const MIN_PART_SECONDS = 1.1;

/** Break dense mined transcript lines into readable caption-sized phrases.
 *  Splits on word count AND character length so long words / CJK text still fit. */
function splitSubtitle(speech: string): string[] {
  const text = speech.trim();
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const parts: string[] = [];
  let current: string[] = [];
  let length = 0;
  const flush = () => {
    if (current.length) parts.push(current.join(" "));
    current = [];
    length = 0;
  };
  for (const word of words) {
    const next = length + word.length + (current.length ? 1 : 0);
    if (current.length && (current.length >= MAX_SUBTITLE_WORDS || next > MAX_SUBTITLE_CHARS)) flush();
    // A single oversized token: hard-wrap it so it can never overflow the frame.
    if (word.length > MAX_SUBTITLE_CHARS) {
      flush();
      for (let i = 0; i < word.length; i += MAX_SUBTITLE_CHARS) parts.push(word.slice(i, i + MAX_SUBTITLE_CHARS));
      continue;
    }
    current.push(word);
    length = next;
  }
  flush();
  return mergeStragglers(parts);
}

/** Fold a tiny trailing fragment ("...and", "ok") back into the previous phrase
 *  so captions never flash one lonely word. */
function mergeStragglers(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const previous = out[out.length - 1];
    const tiny = part.split(/\s+/).length <= 1 && part.length <= 12;
    if (previous && tiny && previous.length + part.length + 1 <= MAX_SUBTITLE_CHARS + 10) {
      out[out.length - 1] = `${previous} ${part}`;
      continue;
    }
    out.push(part);
  }
  return out;
}

/** Re-join phrases until each one can stay on screen for at least MIN_PART_SECONDS.
 *  Without this a long line inside a short window is shown word-by-word and the
 *  tail of the sentence keeps running after the speaker moved on. */
function fitPartsToWindow(parts: string[], seconds: number): string[] {
  const maxParts = Math.max(1, Math.floor(seconds / MIN_PART_SECONDS));
  if (parts.length <= maxParts) return parts;
  const perChunk = Math.ceil(parts.length / maxParts);
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i += perChunk) merged.push(parts.slice(i, i + perChunk).join(" "));
  return merged;
}


/** Parse "MM:SS", "HH:MM:SS" or a "start - end" range. Returns null when unusable. */
function parseStamp(raw: string): { start: number; end: number | null } | null {
  const parts = String(raw ?? "").split(/[-–—>]+/).map((p) => p.trim()).filter(Boolean);
  const toSec = (v: string) => {
    const m = v.match(/(?:(\d+):)?(\d{1,2}):(\d{1,2})/);
    if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
    const only = v.match(/^(\d+)(?:[.,]\d+)?$/);
    return only ? Number(only[1]) : null;
  };
  if (!parts.length) return null;
  const start = toSec(parts[0]!);
  if (start == null) return null;
  const end = parts[1] ? toSec(parts[1]) : null;
  return { start, end };
}

/**
 * Build playback-aligned cue windows.
 * Cues mined without timestamps are spread across the video proportionally to
 * their spoken length, so subtitles still advance instead of freezing on one line.
 */
function buildCues(cues: FeedItem["transcript"], duration: number): TimedCue[] {
  if (!cues?.length) return [];
  // Drop duplicate lines the miner sometimes repeats with a coarser stamp.
  const seen = new Set<string>();
  const list = cues.filter((c) => {
    const key = c.speech.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!list.length) return [];

  const parsed = list.map((c) => ({ cue: c, time: parseStamp(c.timestamp) }));

  // Some older five-minute mining checkpoints returned chunk-local times
  // (00:00 again at each checkpoint). Repair each reset into a continuous
  // whole-video timeline before matching captions to playback.
  let timelineOffset = 0;
  let previousStart = -1;
  for (const entry of parsed) {
    if (!entry.time) continue;
    let start = entry.time.start + timelineOffset;
    if (previousStart >= 0 && start < previousStart - 20) {
      timelineOffset += Math.ceil((previousStart - start) / 300) * 300;
      start = entry.time.start + timelineOffset;
    }
    entry.time = {
      start,
      end: entry.time.end == null ? null : entry.time.end + timelineOffset,
    };
    previousStart = start;
  }
  const span = duration > 0 ? duration : Math.max(...parsed.map((p) => p.time?.end ?? p.time?.start ?? 0), list.length * 5);

  // Anchor known timestamps, then spread untimed runs evenly between anchors.
  const starts: number[] = new Array(list.length).fill(0);
  const ends: (number | null)[] = new Array(list.length).fill(null);
  let i = 0;
  while (i < list.length) {
    if (parsed[i]!.time) {
      starts[i] = parsed[i]!.time!.start;
      ends[i] = parsed[i]!.time!.end;
      i += 1;
      continue;
    }
    // Untimed run [i, j): share the gap by how much is actually said in each
    // line, so long lines hold longer and short ones flash by.
    let j = i;
    while (j < list.length && !parsed[j]!.time) j += 1;
    const prev = i > 0 ? starts[i - 1]! + 1 : 0;
    const next = j < list.length ? parsed[j]!.time!.start : span;
    const gap = Math.max(next - prev, (j - i) * 1.2);
    const weights = list.slice(i, j).map((c) => Math.max(1, c.speech.trim().length));
    const total = weights.reduce((sum, w) => sum + w, 0) || 1;
    let used = 0;
    for (let k = i; k < j; k += 1) {
      starts[k] = prev + (gap * used) / total;
      used += weights[k - i]!;
      ends[k] = prev + (gap * used) / total;
    }
    i = j;

  }

  const windows = list.map((c, idx) => {
    const start = starts[idx] ?? 0;
    const next = starts[idx + 1];
    const fallback = start + Math.max(2, Math.min(8, c.speech.length / 14));
    const explicitEnd = ends[idx];
    const end = explicitEnd != null
      ? Math.min(explicitEnd, next ?? explicitEnd, start + Math.max(3, Math.min(12, c.speech.length / 12)))
      : next != null ? Math.min(next, fallback) : fallback;
    return { start, end: Math.max(end, start + 1.2), speech: c.speech, speaker: c.speaker };
  }).sort((a, b) => a.start - b.start);

  return windows.flatMap((cue) => {
    const window = Math.max(0.6, cue.end - cue.start);
    const parts = fitPartsToWindow(splitSubtitle(cue.speech), window);
    if (parts.length <= 1) return [cue];
    // Stay strictly inside this line's own window: spilling over is what made
    // captions lag behind the speaker.
    const weights = parts.map((part) => Math.max(1, part.length));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let elapsed = 0;
    return parts.map((speech, index) => {
      const start = cue.start + window * (elapsed / totalWeight);
      elapsed += weights[index] ?? 1;
      const end = index === parts.length - 1 ? cue.end : cue.start + window * (elapsed / totalWeight);
      return { ...cue, start, end: Math.max(start + 0.4, end), speech };
    });
  });
}


/** Active cue at the given playback position; null between cues. */
function cueAt(cues: TimedCue[], now: number): TimedCue | null {
  for (const cue of cues) {
    if (now + 0.25 >= cue.start && now <= cue.end + 0.25) return cue;
    if (cue.start > now + 0.25) break;
  }
  return null;
}


/** Feed chrome copy. Missing locales stream through the dynamic translator. */
const FEED_COPY = {
  en: {
    headline: "Evermind — Talk to real minds",
    like: "Like",
    textChat: "Text Chat",
    previewChat: "Preview Chat",
    voiceCall: "Voice Call",
    videoCall: "Video Call",
    robot: "Deploy to Robot",
    assets: "Assets",
    reviews: "Reviews",
    buy: "Buy",
    free: "Get · Free",
    minedTimeline: "Mined timeline",
    emotions: "Emotions",
    signIn: "Sign in to buy this mind.",
    locked: "Purchase this mind to unlock this service.",
  },
  mn: {
    headline: "Evermind — Жинхэнэ оюунтай ярь",
    like: "Таалагдлаа",
    textChat: "Бичвэр чат",
    previewChat: "Туршилтын чат",
    voiceCall: "Дуут дуудлага",
    videoCall: "Видео дуудлага",
    robot: "Робот руу байршуулах",
    assets: "Файлууд",
    reviews: "Сэтгэгдэл",
    buy: "Худалдан авах",
    free: "Авах · Үнэгүй",
    minedTimeline: "Задлагдсан цагийн хэлхээ",
    emotions: "Сэтгэл хөдлөл",
    signIn: "Энэ оюуныг авахын тулд нэвтэрнэ үү.",
    locked: "Энэ үйлчилгээг нээхийн тулд оюуныг худалдан авна уу.",
  },
  ko: {
    headline: "Evermind — 진짜 마인드와 대화하세요",
    like: "좋아요",
    textChat: "텍스트 채팅",
    previewChat: "미리보기 채팅",
    voiceCall: "음성 통화",
    videoCall: "영상 통화",
    robot: "로봇에 배포",
    assets: "자료",
    reviews: "리뷰",
    buy: "구매",
    free: "무료로 받기",
    minedTimeline: "마이닝 타임라인",
    emotions: "감정",
    signIn: "이 마인드를 구매하려면 로그인하세요.",
    locked: "이 기능을 사용하려면 마인드를 구매하세요.",
  },
};

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
  const queryClient = useQueryClient();
  const { lang } = useLang();
  const c = pickCopy(FEED_COPY, lang);
  const { data: items = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["home-feed"],
    queryFn: loadFeed,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: 2,
  });


  // Newly mined VISUAL_CONTENT shows up instantly, without a page reload.
  useEffect(() => {
    const channel = supabase
      .channel("home-feed-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "project_content" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["home-feed"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["home-feed"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const [muted, setMuted] = useState(true);
  const [active, setActive] = useState(0);
  const [talk, setTalk] = useState<FeedItem | null>(null);
  const [robot, setRobot] = useState<FeedItem | null>(null);
  const [feedback, setFeedback] = useState<FeedItem | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const [buying, setBuying] = useState<string | null>(null);


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
      toast.error(c.signIn);
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
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center px-4 py-3">
        <h1 className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> {c.headline}
        </h1>
      </header>
      {/* Sits below the language selector so it is never covered by it */}
      <button
        type="button"
        onClick={() => setMuted((m) => !m)}
        aria-label={muted ? "Unmute" : "Mute"}
        className="fixed right-3 top-16 z-40 rounded-full bg-black/40 p-2 backdrop-blur"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      <main className="h-[100dvh] snap-y snap-mandatory overflow-y-scroll">
        {isLoading && <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
        {isError && <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"><p className="text-sm text-muted-foreground">Creator feed could not load.</p><button type="button" onClick={() => void refetch()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Retry</button></div>}
        {items.map((item, i) => (
          <FeedCard
            key={item.id}
            item={item}
            muted={muted}
            index={i}
            onVisible={setActive}
            isActive={active === i}
            // Only the current clip and its immediate neighbours load a player;
            // mounting every video at once is what made the feed stutter.
            near={Math.abs(active - i) <= 1}
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
  near,
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
  near: boolean;
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
  const [duration, setDuration] = useState(0);
  const [captions, setCaptions] = useState(true);
  const [subtitleSize, setSubtitleSize] = useState(18);
  const [subtitlePosition, setSubtitlePosition] = useState(38);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Subtitles and mined moments are large; fetch them only for the clip on
  // screen (and keep them cached so scrolling back is instant).
  const { data: tracks } = useQuery({
    queryKey: ["feed-tracks", item.contentId],
    queryFn: () => loadFeedTracks(item.contentId!),
    enabled: !!item.contentId && near,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
  const transcript = tracks?.transcript ?? item.transcript;
  const timeline = tracks?.timeline ?? item.timeline;
  const emotionTimeline = tracks?.emotion_timeline ?? item.emotionTimeline;

  const { lang } = useLang();
  const c = pickCopy(FEED_COPY, lang);
  const shownTitle = useDisplayText(item.title);
  const shownDescription = useDisplayText(item.description);
  const shownTags = useDisplayTexts(item.tags);
  // Translating every mined label of every card at once flooded the app with
  // requests — only the visible card needs translated moment labels.
  const shownMarks = useDisplayTexts(isActive ? (timeline ?? []).map((m) => m.label) : []);
  const shownEmotions = useDisplayTexts(
    isActive ? (emotionTimeline ?? []).map((m) => m.emotion ?? m.label) : [],
  );

  const caps = capabilitiesFor(item.category);
  const primary = primaryActionFor(item.category);
  const shownPrimary = useDisplayText(primary.en);
  const has = (c: Capability) => caps.includes(c);
  const activeMark = markAt(timeline, now);
  const activeEmotion = markAt(emotionTimeline, now);
  const timedCues = useMemo(() => buildCues(transcript, duration), [transcript, duration]);
  const activeSubtitle = cueAt(timedCues, now + subtitleOffset);



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
  const locked = () => toast.error(c.locked);

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
      <div className="relative h-[100dvh] w-full overflow-hidden @container md:h-auto md:w-[min(calc((100dvh-2rem)*9/16),92vw)] md:shrink-0 md:rounded-lg md:border md:border-white/10 md:shadow-2xl md:[aspect-ratio:9/16] 2xl:w-[min(calc((100dvh-3rem)*9/16),92vw)]">
        {item.youtubeId && near ? (
          <YouTubeStage
            videoId={item.youtubeId}
            active={isActive}
            muted={muted}
            paused={paused}
            onTime={(seconds, total) => {
              setNow(seconds);
              if (total > 0) setDuration((d) => (Math.abs(d - total) > 1 ? total : d));
            }}
            onToggle={toggle}
          />
        ) : item.youtubeId ? (
          <img
            src={item.poster}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover md:object-contain md:bg-black"
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
            onTimeUpdate={(event) => setNow(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
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
        {captions && activeSubtitle && (
          <p
            className="pointer-events-none absolute inset-x-3 z-30 mx-auto line-clamp-3 w-fit max-w-[92%] overflow-hidden rounded-md bg-background/85 px-3 py-1.5 text-center font-semibold leading-snug text-balance break-words hyphens-auto text-foreground shadow-lg sm:inset-x-6"
            style={{ bottom: `${subtitlePosition}%`, fontSize: `min(${subtitleSize}px, ${(subtitleSize / 4).toFixed(2)}cqw)` }}
          >
            {activeSubtitle.speech}
          </p>
        )}
        {!!transcript?.length && (
          <div className="absolute right-3 top-28 z-30 flex flex-col gap-2">
            <Button type="button" size="icon" variant="secondary" onClick={() => setCaptions((value) => !value)} aria-label={captions ? "Hide subtitles" : "Show subtitles"} className="h-9 w-9 bg-background/75 backdrop-blur">
              <Captions className={`h-4 w-4 ${captions ? "text-primary" : "text-muted-foreground"}`} />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="icon" variant="secondary" aria-label="Subtitle settings" className="h-9 w-9 bg-background/75 backdrop-blur">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="left" align="start" className="w-64 space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs"><span>Subtitle size</span><span>{subtitleSize}px</span></div>
                  <Slider min={14} max={30} step={1} value={[subtitleSize]} onValueChange={(value) => setSubtitleSize(value[0] ?? 18)} aria-label="Subtitle size" />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs"><span>Vertical position</span><span>{subtitlePosition}%</span></div>
                  <Slider min={18} max={72} step={1} value={[subtitlePosition]} onValueChange={(value) => setSubtitlePosition(value[0] ?? 38)} aria-label="Subtitle vertical position" />
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-xs"><span>Timing</span><span>{subtitleOffset > 0 ? "+" : ""}{subtitleOffset.toFixed(1)}s</span></div>
                  <Slider min={-10} max={10} step={0.5} value={[subtitleOffset]} onValueChange={(value) => setSubtitleOffset(value[0] ?? 0)} aria-label="Subtitle timing" />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Live mined knowledge + emotion tags, aligned to what is playing.
            Kept to a single compact chip so it never collides with the caption or header. */}
        {(activeMark || activeEmotion) && (
          <div className="pointer-events-none absolute left-3 top-16 z-20 flex max-w-[58%] items-center gap-1.5">
            {activeMark && (
              <p className="line-clamp-2 rounded-xl bg-black/55 px-2.5 py-1.5 text-[11px] leading-snug backdrop-blur">
                <span className="mr-1.5 font-mono text-primary">{stamp(activeMark.t)}</span>
                {shownMarks[(timeline ?? []).indexOf(activeMark)] || activeMark.label}
              </p>
            )}
            {activeEmotion && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-primary/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary backdrop-blur">
                {shownEmotions[(emotionTimeline ?? []).indexOf(activeEmotion)] ||

                  activeEmotion.emotion ||
                  activeEmotion.label}
              </span>
            )}
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      {/* Right action rail — only the services this creator enabled */}
      <div className="absolute bottom-28 right-3 z-20 flex flex-col items-center gap-5 md:bottom-8">
        <button type="button" onClick={onLike} aria-label="Like" className="flex flex-col items-center gap-1">
          <Heart className={`h-7 w-7 ${liked ? "fill-primary text-primary" : ""}`} />
          <span className="text-[10px]">{c.like}</span>
        </button>

        {has("chat") && (
          <button type="button" onClick={onTalk} aria-label="Text Chat" className="flex flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="text-[10px]">{purchased ? c.textChat : c.previewChat}</span>
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
            <span className="text-[10px]">{c.voiceCall}</span>
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
            <span className="text-[10px]">{c.videoCall}</span>
          </button>
        )}

        {/* Robot deployment only exists after purchase — never a free action */}
        {has("robot") && purchased && (
          <button type="button" onClick={onRobot} aria-label="Deploy to Robot" className="flex flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur">
              <Bot className="h-5 w-5" />
            </span>
            <span className="text-[10px]">{c.robot}</span>
          </button>
        )}

        {has("asset") && purchased && (
          <button type="button" onClick={onVault} aria-label="Files and assets" className="flex flex-col items-center gap-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-black/40 backdrop-blur">
              <FolderOpen className="h-5 w-5" />
            </span>
            <span className="text-[10px]">{c.assets}</span>
          </button>
        )}

        <button type="button" onClick={onFeedback} aria-label="Comments and mind reviews" className="flex flex-col items-center gap-1">
          <Star className="h-7 w-7" />
          <span className="text-[10px]">{c.reviews}</span>
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
              ? shownPrimary
              : item.price > 0
                ? `${c.buy} · ${item.currency} ${item.price}`
                : c.free}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="pointer-events-auto block w-full text-left"
          aria-expanded={expanded}
        >
          <p className={`text-sm font-medium ${expanded ? "" : "line-clamp-1"}`}>{shownTitle}</p>
          {expanded && (
            <>
              <p className="mt-1 line-clamp-3 text-xs text-white/70">{shownDescription}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {item.tags.slice(0, 3).map((tag, ti) => (
                  <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
                    #{shownTags[ti] || tag}
                  </span>
                ))}
              </div>
            </>
          )}
          {!expanded && (shownDescription || item.tags.length > 0) && (
            <span className="mt-0.5 inline-block text-[11px] font-semibold text-white/60">More</span>
          )}
        </button>
      </div>
      </div>

    </section>
  );
}
