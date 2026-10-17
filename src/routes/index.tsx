import { useScreenTranslations } from "@/hooks/use-screen-translations";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Share2,
  Star,
  Captions,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { TalkToMindModal } from "@/components/talk-to-mind-modal";
import { ShareSheet } from "@/components/share-sheet";
import { RobotSyncModal } from "@/components/robot-sync-modal";
import { MindFeedback } from "@/components/mind-feedback";
import { YouTubeStage } from "@/components/youtube-stage";
import { loadFeed, loadFeedTracks, type FeedItem } from "@/lib/feed";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pickCopy, useDisplayText, useDisplayTexts, useDisplayTextsIn, useLang } from "@/lib/i18n";
import { LANGUAGES, type LangCode } from "@/lib/languages";
import { createLiveDub, type LiveDub } from "@/lib/live-dub";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TimelineMark } from "@/lib/projects";
import { capabilitiesFor, primaryActionFor, type Capability } from "@/lib/capabilities";
import { cancelMind, listPurchases, purchaseMind } from "@/lib/purchases";
import { formatMoney, type PlanLength } from "@/lib/subscription";
import { useAuth } from "@/hooks/use-auth";
import { setChromeVisible, useChromeVisible } from "@/hooks/use-chrome-visible";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

/** Plain wording for the subtitle / voice controls, in the viewer's language. */
const VOICE_COPY = {
  en: {
    subtitleLang: "Subtitle language",
    original: "Original (as spoken)",
    voiceLang: "Voice language",
    speak: "Speak this video",
    speakNote: "Spoken in the creator's own voice, on their account. The original sound stays quiet underneath.",
    noVoice: "This creator has not made a voice yet, so this video cannot be spoken.",
  },
  mn: {
    subtitleLang: "Хадмалын хэл",
    original: "Эх хэлээр нь",
    voiceLang: "Дуу хоолойн хэл",
    speak: "Энэ бичлэгийг ярьж уншуулах",
    speakNote: "Бүтээгчийн өөрийнх нь хоолойгоор, түүний дансаар ярина. Эх дуу нь намуухан үлдэнэ.",
    noVoice: "Энэ бүтээгч хоолой үүсгээгүй тул уншуулах боломжгүй.",
  },
  ko: {
    subtitleLang: "자막 언어",
    original: "원래 언어 그대로",
    voiceLang: "음성 언어",
    speak: "이 영상 말로 듣기",
    speakNote: "제작자의 목소리로, 제작자 계정으로 말합니다. 원래 소리는 작게 유지됩니다.",
    noVoice: "이 제작자는 아직 목소리를 만들지 않아 말로 들을 수 없습니다.",
  },
};

/** Small device-saved viewer preferences (subtitle / voice language). */
function readPref<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  return (window.localStorage.getItem(key) as T | null) ?? fallback;
}

function writePref(key: string, value: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, value);
}

/** Shorts-style rail: bare white outline icon with a small label under it. */
const railBtn = "flex w-12 flex-col items-center gap-1 text-white [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.7))]";
const railIcon = "h-7 w-7 stroke-[2.2]";
const railLabel = "text-[11px] font-semibold leading-none";


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
  // Whole-number groups only: "373:19" is 373 minutes, never "73:19".
  const toSec = (v: string) => {
    const m = v.match(/(?:^|[^\d])(\d+):(\d{1,2})(?::(\d{1,2}))?(?:[.,]\d+)?(?![\d:])/) ?? v.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?/);
    if (m) return m[3] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
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
  // Drop only back-to-back repeats (same words within a few seconds). Common
  // replies like "Yeah" or "Тийм ээ" are said many times and must all show.
  const lastSeen = new Map<string, number | null>();
  const unique = cues.filter((c) => {
    const key = c.speech.trim();
    if (!key) return false;
    const at = parseStamp(c.timestamp)?.start ?? null;
    if (lastSeen.has(key)) {
      const prev = lastSeen.get(key);
      if (prev == null || at == null || Math.abs(at - prev) < 4) return false;
    }
    lastSeen.set(key, at);
    return true;
  });
  if (!unique.length) return [];

  let parsed = unique.map((c) => ({ cue: c, time: parseStamp(c.timestamp) }));
  // A stamp past the end of the video is a mis-read clock, never a real
  // moment. When the rest of the video is properly timed, such a line is
  // dropped (spreading it would flash a wrong line); otherwise it is untimed.
  if (duration > 0) {
    const timed = parsed.filter((p) => p.time).length;
    const mostlyTimed = timed >= parsed.length * 0.8;
    parsed = parsed.filter((p) => !(mostlyTimed && p.time && p.time.start > duration + 30));
    for (const entry of parsed) if (entry.time && entry.time.start > duration + 30) entry.time = null;
  }
  const list = parsed.map((p) => p.cue);
  if (!list.length) return [];

  // Saved stamps are already whole-video times confined to their 15-minute
  // part. A stamp that runs backwards is one mis-read line: it alone becomes
  // untimed and nothing is ever shifted.
  let previousStart = -1;
  for (const entry of parsed) {
    if (!entry.time) continue;
    if (previousStart >= 0 && entry.time.start < previousStart - 20) {
      entry.time = null;
      continue;
    }
    previousStart = entry.time.start;
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
    // Reading time grows with the line (~15 chars/s), so long speech no longer
    // vanishes after 8-12 s while the speaker is still talking.
    const readTime = Math.max(2, Math.min(30, c.speech.length / 15));
    const explicitEnd = ends[idx];
    const limit = next != null ? next : start + readTime;
    let end = explicitEnd != null ? Math.min(explicitEnd, limit) : Math.min(start + readTime, limit);
    // Overlapping talk: keep each line readable for at least 2 s.
    end = Math.max(end, next != null ? Math.min(start + 2, next + 0.8) : start + 2);
    const speaker = String(c.speaker ?? "").replace(/^\s*video\s*:\s*/i, "").trim();
    return { start, end, speech: c.speech, speaker };
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
    reviews: "Reviews",
    buy: "Subscribe",
    subscribed: "Subscribed",
    unsubscribed: "Subscription cancelled",
    cancelSub: "Cancel subscription",
    free: "Subscribe · Free",
    chooseLength: "Choose your subscription",
    checkoutSoon: "Paid subscriptions are coming soon — card checkout is not connected yet.",
    lifetimeNote: "One payment, never expires",
    lengths: { month: "1 month", quarter: "3 months", year: "1 year", lifetime: "Lifetime" },
    minedTimeline: "Mined timeline",
    emotions: "Emotions",
    signIn: "Sign in to subscribe to this mind.",
    locked: "Subscribe to this mind to unlock this service.",
  },
  mn: {
    headline: "Evermind — Жинхэнэ оюунтай ярь",
    like: "Таалагдлаа",
    textChat: "Бичвэр чат",
    previewChat: "Туршилтын чат",
    voiceCall: "Дуут дуудлага",
    videoCall: "Видео дуудлага",
    robot: "Робот руу байршуулах",
    reviews: "Сэтгэгдэл",
    buy: "Захиалах",
    subscribed: "Захиалсан",
    unsubscribed: "Захиалга цуцлагдлаа",
    cancelSub: "Захиалга цуцлах",
    free: "Захиалах · Үнэгүй",
    chooseLength: "Захиалгаа сонгоно уу",
    checkoutSoon: "Төлбөртэй захиалга удахгүй — картын төлбөр хараахан холбогдоогүй байна.",
    lifetimeNote: "Нэг удаа төлнө, хэзээ ч дуусахгүй",
    lengths: { month: "1 сар", quarter: "3 сар", year: "1 жил", lifetime: "Насан турш" },
    minedTimeline: "Задлагдсан цагийн хэлхээ",
    emotions: "Сэтгэл хөдлөл",
    signIn: "Захиалахын тулд нэвтэрнэ үү.",
    locked: "Энэ үйлчилгээг нээхийн тулд захиална уу.",
  },
  ko: {
    headline: "Evermind — 진짜 마인드와 대화하세요",
    like: "좋아요",
    textChat: "텍스트 채팅",
    previewChat: "미리보기 채팅",
    voiceCall: "음성 통화",
    videoCall: "영상 통화",
    robot: "로봇에 배포",
    reviews: "리뷰",
    buy: "구독하기",
    subscribed: "구독 중",
    unsubscribed: "구독이 취소되었습니다",
    cancelSub: "구독 취소",
    free: "무료로 구독",
    chooseLength: "구독 기간을 선택하세요",
    checkoutSoon: "유료 구독은 곧 제공됩니다 — 카드 결제가 아직 연결되지 않았습니다.",
    lifetimeNote: "1회 결제, 만료 없음",
    lengths: { month: "1개월", quarter: "3개월", year: "1년", lifetime: "평생" },
    minedTimeline: "마이닝 타임라인",
    emotions: "감정",
    signIn: "구독하려면 로그인하세요.",
    locked: "이 기능을 사용하려면 구독하세요.",
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const { data: allItems = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["home-feed"],
    queryFn: loadFeed,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    retry: 2,
  });
  // Videos YouTube refuses to play outside its own site (age limits, embedding
  // off) are dropped from the feed instead of showing an error card.
  const [unplayable, setUnplayable] = useState<Record<string, true>>({});
  const items = useMemo(() => allItems.filter((i) => !unplayable[i.id]), [allItems, unplayable]);




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
  // Mute button fades away with the rest of the on-screen controls.
  const pageChrome = useChromeVisible();
  const [active, setActive] = useState(0);
  const [talk, setTalk] = useState<FeedItem | null>(null);
  const [sharing, setSharing] = useState<FeedItem | null>(null);
  const [robot, setRobot] = useState<FeedItem | null>(null);
  const [feedback, setFeedback] = useState<FeedItem | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [owned, setOwned] = useState<Record<string, boolean>>({});
  const [buying, setBuying] = useState<string | null>(null);
  const [planPicker, setPlanPicker] = useState<FeedItem | null>(null);
  // Tapping a creator opens their profile with every video of theirs in the feed.
  const [creator, setCreator] = useState<FeedItem | null>(null);
  const creatorVideos = creator
    ? items.filter((it) => (it.mindId ?? it.creator) === (creator.mindId ?? creator.creator))
    : [];
  const jumpTo = (id: string) => {
    setCreator(null);
    requestAnimationFrame(() => {
      const idx = items.findIndex((it) => it.id === id);
      if (idx >= 0) document.getElementById(`feed-card-${idx}`)?.scrollIntoView({ behavior: "smooth" });
    });
  };
  const [swapped, setSwapped] = useState<Record<string, FeedItem>>({});
  const swipeProject = useCallback((item: FeedItem, direction: "older" | "newer") => {
    if (!item.projectId) return;
    const projectVideos = items
      .filter((candidate) => candidate.projectId === item.projectId)
      .sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0));
    const current = projectVideos.findIndex((candidate) => candidate.id === item.id);
    const target = projectVideos[current + (direction === "newer" ? 1 : -1)];
    if (!target) {
      toast(direction === "newer" ? "No newer video in this project" : "No earlier video in this project");
      return;
    }
    // Swap the video in place so the vertical feed never jumps.
    setSwapped((s) => {
      const slot = Object.keys(s).find((k) => s[k]?.id === item.id) ?? item.id;
      return { ...s, [slot]: target };
    });
  }, [items]);


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

  const subscribe = async (item: FeedItem, plan: PlanLength = "lifetime") => {
    if (!user) {
      toast.error(c.signIn);
      void navigate({ to: "/auth" });
      return;
    }
    const key = mindKey(item);
    setBuying(key);
    const { error } = await purchaseMind({ mindId: key, category: item.category, plan });
    setBuying(null);
    setPlanPicker(null);
    if (error) {
      toast.error(error.includes("Checkout is not connected") ? c.checkoutSoon : error);
      return;
    }
    setOwned((s) => ({ ...s, [key]: true }));
    toast.success(`${c.subscribed} — ${item.creator}`);
  };

  /** Cancelling is always the viewer's own decision — nothing else changes. */
  const unsubscribe = async (item: FeedItem) => {
    const key = mindKey(item);
    setBuying(key);
    const { error } = await cancelMind(key);
    setBuying(null);
    if (error) {
      toast.error(error);
      return;
    }
    setOwned((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
    toast.success(c.unsubscribed);
  };


  /** Paid minds ask for a length first; free minds subscribe straight away. */
  const onSubscribe = (item: FeedItem) => {
    const paid = (item.tiers ?? []).filter((t) => t.price > 0);
    if (paid.length) {
      setPlanPicker(item);
      return;
    }
    void subscribe(item, "lifetime");
  };

  const runPrimary = (item: FeedItem) => {
    const action = primaryActionFor(item.category);
    if (action.capability === "robot") setRobot(item);
    else if (action.capability === "voice") setTalk(item);
    else void navigate({ to: "/vaults" });
  };

  return (
    <div className="dark min-h-screen bg-black pb-28 text-white">
      {/* No app label over the video — the feed stays clean. */}
      {/* Sits below the language selector so it is never covered by it */}

      <main className="h-[100dvh] snap-y snap-mandatory overflow-y-scroll">
        {isLoading && <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
        {isError && <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"><p className="text-sm text-muted-foreground">Creator feed could not load.</p><button type="button" onClick={() => void refetch()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Retry</button></div>}
        {items.map((base, i) => { const item = swapped[base.id] ?? base; return (
          <FeedCard
            key={item.id}
            item={item}
            muted={muted}
            onMute={() => setMuted((m) => !m)}
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
            onBuy={() => onSubscribe(item)}
            onPrimary={() => runPrimary(item)}
            onCancel={() => void unsubscribe(item)}
            onTalk={() => setTalk(item)}
            onShare={() => setSharing(item)}
            onRobot={() => setRobot(item)}
            onBlocked={() => setUnplayable((s) => ({ ...s, [item.id]: true }))}
            onFeedback={() => setFeedback(item)}
            onCreator={() => setCreator(item)}
            onProjectSwipe={(direction) => swipeProject(item, direction)}
          />
        ); })}

      </main>

      {creator && (
        <div className="fixed inset-0 z-[86] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-4 sm:rounded-2xl">
            <div className="mb-4 flex items-center gap-3">
              {creator.avatarUrl ? (
                <img src={creator.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                  {creator.creator.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{creator.creator}</p>
                <p className="truncate text-xs text-muted-foreground">{creator.handle}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setCreator(null)}>
                <X className="h-5 w-5 text-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {creatorVideos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => jumpTo(v.id)}
                  className="overflow-hidden rounded-xl border border-border bg-card text-left"
                >
                  {v.poster ? (
                    <img src={v.poster} alt="" className="h-24 w-full object-cover" />
                  ) : (
                    <div className="h-24 w-full bg-muted" />
                  )}
                  <span className="block px-2 py-2 text-[11px] leading-snug text-foreground line-clamp-2">
                    {v.title}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                const target = creator;
                setCreator(null);
                setTalk(target);
              }}
              className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {c.previewChat}
            </button>
          </div>
        </div>
      )}


      <ShareSheet
        open={!!sharing}
        onClose={() => setSharing(null)}
        title={sharing ? `${sharing.creator} — ${sharing.title}` : ""}
        url={sharing ? (sharing.youtubeId ? `https://www.youtube.com/watch?v=${sharing.youtubeId}` : typeof window !== "undefined" ? window.location.origin : "") : ""}
      />

      <TalkToMindModal
        open={!!talk}
        onClose={() => setTalk(null)}
        mindId={talk?.mindId ?? null}
        mindName={talk?.creator ?? ""}
        onReview={talk ? () => { const t = talk; setTalk(null); setFeedback(t); } : undefined}
      />
      {planPicker && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-background p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{c.chooseLength}</h2>
              <button type="button" aria-label="Close" onClick={() => setPlanPicker(null)}>
                <X className="h-5 w-5 text-foreground" />
              </button>
            </div>
            <div className="grid gap-2">
              {(planPicker.tiers ?? []).map((tier) => (
                <button
                  key={tier.length}
                  type="button"
                  disabled={buying === mindKey(planPicker)}
                  onClick={() => void subscribe(planPicker, tier.length)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{c.lengths[tier.length]}</span>
                    {tier.length === "lifetime" && (
                      <span className="block text-xs text-muted-foreground">{c.lifetimeNote}</span>
                    )}
                  </span>
                  <span className="font-mono text-sm font-semibold text-primary">
                    {tier.price > 0 ? formatMoney(tier.price, planPicker.currency) : c.free}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{c.checkoutSoon}</p>
          </div>
        </div>
      )}

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
  onCancel,
  onMute,
  onTalk,
  onShare,
  onRobot,
  onBlocked,
  onFeedback,
  onCreator,
  onProjectSwipe,
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
  onCancel: () => void;
  onMute: () => void;
  onTalk: () => void;
  onShare: () => void;
  onRobot: () => void;
  onBlocked: () => void;
  onFeedback: () => void;
  onCreator: () => void;
  onProjectSwipe: (direction: "older" | "newer") => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /** The player frame itself — used for rotate-to-fullscreen on wide videos. */
  const stageRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(0);
  const [duration, setDuration] = useState(0);
  // Single active iframe rule: only the card that is mostly on screen
  // (>65% visible) mounts a YouTube player; all others show a still image.
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || !item.youtubeId) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(!!entry && entry.intersectionRatio > 0.65),
      { threshold: [0, 0.65, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [item.youtubeId]);
  const [captions, setCaptions] = useState(true);
  const [subtitleSize, setSubtitleSize] = useState(18);
  const [subtitlePosition, setSubtitlePosition] = useState(38);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // Subtitle + voice language are the viewer's own choice for this player and
  // stay on the device; they are deliberately independent of the app language.
  // "app" (default) follows the top language button; the viewer can still pin
  // another language or the original wording for this device.
  const [subtitleLang, setSubtitleLang] = useState<LangCode | "source" | "app">(() =>
    readPref("evermind:subtitle-lang2", "app"),
  );
  const [voiceLang, setVoiceLang] = useState<LangCode>(() => readPref("evermind:voice-lang", "en"));
  const [speakOn, setSpeakOn] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceBlocked, setVoiceBlocked] = useState<string | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  // Lets the viewer jump to any moment of the video by dragging the bar.
  const ytSeek = useRef<((seconds: number) => void) | null>(null);
  const setYtSeek = useCallback((fn: ((seconds: number) => void) | null) => {
    ytSeek.current = fn;
  }, []);
  const seekTo = useCallback((seconds: number) => {
    setNow(seconds);
    if (videoRef.current) videoRef.current.currentTime = seconds;
    ytSeek.current?.(seconds);
  }, []);

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
  const vc = pickCopy(VOICE_COPY, lang);
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
  // Subtitles follow the chosen language too. The whole line list of the visible
  // card is translated ahead of time so lines never lag behind the speech.
  // Only the line on screen and the next few are asked for — queueing every
  // line of a long video put the current line hundreds of places back, so it
  // stayed in the original language until the whole video had been translated.
  const activeIdxForWindow = activeSubtitle ? timedCues.indexOf(activeSubtitle) : 0;
  const windowStart = Math.max(0, activeIdxForWindow - 1);
  const cueTexts = useMemo(
    () =>
      isActive
        ? timedCues.map((cue, i) => (i >= windowStart && i < windowStart + 12 ? cue.speech : null))
        : [],
    [isActive, timedCues, windowStart],
  );
  // "source" keeps the mined wording; any other choice runs through the same
  // cached translation path the rest of the app uses (the Translating job in
  // the API Manager, with its automatic key switching).
  const shownCues = useScreenTranslations(cueTexts, subtitleLang === "app" ? lang : subtitleLang);
  const activeCueIndex = activeSubtitle ? timedCues.indexOf(activeSubtitle) : -1;
  const shownSubtitle =
    activeCueIndex >= 0 ? (shownCues[activeCueIndex] ?? activeSubtitle?.speech ?? "") : "";
  // Spoken lines can be in a different language than the written ones.
  const spokenCues = useDisplayTextsIn(speakOn ? cueTexts : [], voiceLang);

  // One speaker per card. It speaks the line on screen, prepares the next one
  // while that plays, and stops the moment the picture moves on or pauses.
  const dubRef = useRef<LiveDub | null>(null);
  const cueIndexRef = useRef(activeCueIndex);
  cueIndexRef.current = activeCueIndex;
  useEffect(() => {
    if (!speakOn || !item.mindId || !isActive) return;
    const dub = createLiveDub({
      mindId: item.mindId,
      lang: voiceLang,
      onSpeaking: setSpeaking,
      onFailure: (failure) => {
        setSpeakOn(false);
        setSpeaking(false);
        setVoiceBlocked(failure.message);
        toast.error(failure.message);
      },
      stillCurrent: (id) => id === String(cueIndexRef.current),
    });
    dubRef.current = dub;
    return () => {
      dub.dispose();
      dubRef.current = null;
      setSpeaking(false);
    };
  }, [speakOn, voiceLang, isActive, item.mindId]);

  useEffect(() => {
    const dub = dubRef.current;
    if (!dub) return;
    if (paused || activeCueIndex < 0) {
      dub.stop();
      return;
    }
    const line = spokenCues[activeCueIndex];
    if (line) dub.speak(String(activeCueIndex), line);
    const next = spokenCues[activeCueIndex + 1];
    if (next) dub.prefetch(next);
  }, [activeCueIndex, paused, spokenCues]);



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

  // Uploaded clips get the same ducking the YouTube player does.
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = speaking ? 0.18 : 1;
  }, [speaking]);

  const toggle = useCallback(() => setPaused((p) => !p), []);
  const locked = () => toast.error(c.locked);
  // Wide (16:9) clips leave black space above and below on a phone — the title
  // and the subtitles go there so nothing ever covers the picture.
  const isLandscape = !!(item.youtubeId || item.embedUrl);

  // One tap brings every control back; a few idle seconds take them all away
  // again so only the video (and the subtitles) are left on screen.
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showChrome = useCallback((show: boolean) => {
    setChrome(show);
    setChromeVisible(show);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (show) {
      hideTimer.current = setTimeout(() => {
        setChrome(false);
        setChromeVisible(false);
      }, 20000);
    }
  }, []);
  useEffect(() => {
    if (isActive) showChrome(true);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isActive, showChrome]);
  const chromeCls = chrome ? "opacity-100" : "pointer-events-none opacity-0";

  const beginSwipe = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,a,[role='slider']")) return;
    swipeStart.current = { x: event.clientX, y: event.clientY };
  };
  const finishSwipe = (event: React.PointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.3) {
      // A plain tap (not a swipe) shows or hides the controls.
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) showChrome(!chrome);
      return;
    }
    onProjectSwipe(dx > 0 ? "newer" : "older");
  };

  return (
    <section
      ref={ref}
      id={`feed-card-${index}`}
      onPointerDown={beginSwipe}
      onPointerUp={finishSwipe}
      onPointerCancel={() => { swipeStart.current = null; }}
      className="relative flex h-[100dvh] w-full snap-start items-center justify-center overflow-hidden bg-neutral-950"
    >

      {/* Player frame: wide clips keep a true 16:9 band centred on the phone,
          vertical clips stay full-bleed. Never stretched to the full height —
          that is what pushed YouTube's own title bar into the status bar. */}
      <div
        ref={stageRef}
        className={
          item.youtubeId || item.embedUrl
            ? "relative w-full shrink-0 overflow-hidden rounded-xl [aspect-ratio:16/9] @container md:h-auto md:w-[min(calc((100dvh-2rem)*16/9),94vw)] md:rounded-lg md:border md:border-white/10 md:shadow-2xl"
            : "relative h-[100dvh] w-full overflow-hidden @container md:h-auto md:w-[min(calc((100dvh-2rem)*9/16),92vw)] md:shrink-0 md:rounded-lg md:border md:border-white/10 md:shadow-2xl md:[aspect-ratio:9/16] 2xl:w-[min(calc((100dvh-3rem)*9/16),92vw)]"
        }
      >
        {item.embedUrl && !item.youtubeId ? (
          near ? (
            <iframe
              src={item.embedUrl}
              title={item.title}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0 bg-black"
            />
          ) : (
            <div className="h-full w-full bg-black" />
          )
        ) : item.youtubeId && isActive && inView ? (
          <YouTubeStage
            videoId={item.youtubeId}
            active={isActive}
            muted={muted}
            paused={paused}
            duck={speaking}
            onTime={(seconds, total) => {
              setNow(seconds);
              if (total > 0) setDuration((d) => (Math.abs(d - total) > 1 ? total : d));
            }}
            onToggle={toggle}
            onSeekRef={setYtSeek}
            onBlocked={onBlocked}
            onPrev={item.projectId ? () => onProjectSwipe("older") : undefined}
            onNext={item.projectId ? () => onProjectSwipe("newer") : undefined}
          />
        ) : item.youtubeId ? (
          <div className="relative h-full w-full bg-black">
            <img
              src={`https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg`}
              alt={item.title}
              loading="lazy"
              className="h-full w-full object-cover md:object-contain"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/70 text-white">
                <Play className="h-7 w-7 fill-current" />
              </span>
            </div>
          </div>
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

        {/* YouTube adds share/recommendation controls whenever its iframe is
            paused. Replace that surface with the clean poster while keeping
            Evermind's own controls, subtitles, and actions above it. */}
        {paused && item.src && !item.youtubeId && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Play"
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/20"
          >
            <Play className="h-14 w-14 opacity-80" />
          </button>
        )}
      </div>

        {/* Subtitles live under a wide video, in the free space, so they never
            sit on top of the picture. Vertical videos keep them over the clip. */}
        {captions && activeSubtitle && (
          <p
            className="pointer-events-none absolute inset-x-3 z-30 mx-auto line-clamp-3 w-fit max-w-[92%] overflow-hidden rounded-md bg-background/85 px-3 py-1.5 text-center font-semibold leading-snug text-balance break-words hyphens-auto text-foreground shadow-lg sm:inset-x-6"
            style={{
              bottom: isLandscape
                ? `max(8rem, calc(50% - 31vw))`
                : `${subtitlePosition}%`,
              fontSize: `min(${subtitleSize}px, ${(subtitleSize / 4).toFixed(2)}vw)`,
            }}
          >
            {shownSubtitle || activeSubtitle.speech}
          </p>
        )}

        {/* Live mined knowledge + emotion tags, aligned to what is playing.
            Kept to a single compact chip so it never collides with the caption or header. */}
        {(activeMark || activeEmotion) && (
          <div
            className={`pointer-events-none absolute left-3 z-20 flex max-w-[58%] items-center gap-1.5 transition-opacity duration-500 ${chromeCls}`}
            style={{ top: `calc(env(safe-area-inset-top) + ${isLandscape ? "10rem" : "4rem"})` }}
          >
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

        {!isLandscape && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-opacity duration-500 ${chromeCls}`}
          />
        )}

      {/* Right action rail — floating icon buttons that fade with everything else */}
      <div
        className={`absolute right-2 z-30 flex flex-col items-center gap-4 transition-opacity duration-500 ${chromeCls}`}
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 10rem)" }}
      >
        <button type="button" onClick={onMute} aria-label={muted ? "Unmute" : "Mute"} className={railBtn}>
          {muted ? <VolumeX className={railIcon} /> : <Volume2 className={railIcon} />}
        </button>
        {!!transcript?.length && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Subtitles"
                  className={`${railBtn} ${captions ? "" : "opacity-50"}`}
                >
                  <Captions className={railIcon} />
                  <span className={railLabel}>CC</span>
                </button>
              </PopoverTrigger>
              <PopoverContent side="left" align="start" className="w-64 space-y-4">
                <label className="flex items-center justify-between text-xs">
                  <span>Subtitles</span>
                  <Switch checked={captions} onCheckedChange={setCaptions} aria-label="Subtitles on or off" />
                </label>
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
                <div className="space-y-2 border-t pt-3">
                  <span className="text-xs">{vc.subtitleLang}</span>
                  <Select
                    value={subtitleLang}
                    onValueChange={(value) => {
                      setSubtitleLang(value as LangCode | "source" | "app");
                      writePref("evermind:subtitle-lang2", value);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value="app">{lang === "mn" ? "Апп-ын хэлээр" : lang === "ko" ? "앱 언어 따르기" : "Follow app language"}</SelectItem>
                      <SelectItem value="source">{vc.original}</SelectItem>
                      {Object.entries(LANGUAGES).map(([code, meta]) => (
                        <SelectItem key={code} value={code}>{meta.native}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 border-t pt-3">
                  <span className="text-xs">{vc.voiceLang}</span>
                  <Select
                    value={voiceLang}
                    onValueChange={(value) => {
                      setVoiceLang(value as LangCode);
                      writePref("evermind:voice-lang", value);
                      setVoiceBlocked(null);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {Object.entries(LANGUAGES).map(([code, meta]) => (
                        <SelectItem key={code} value={code}>{meta.native}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs">{vc.speak}</span>
                    <Switch
                      checked={speakOn}
                      disabled={!item.mindId}
                      onCheckedChange={(on) => {
                        setVoiceBlocked(null);
                        setSpeakOn(on);
                      }}
                      aria-label={vc.speak}
                    />
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {voiceBlocked ?? (item.mindId ? vc.speakNote : vc.noVoice)}
                  </p>
                </div>
              </PopoverContent>
            </Popover>
        )}
        <button type="button" onClick={onLike} aria-label={c.like} className={railBtn}>
          <Heart className={`${railIcon} ${liked ? "fill-current" : ""}`} />
          <span className={railLabel}>{c.like}</span>
        </button>
        {has("chat") && (
          <button type="button" onClick={onTalk} aria-label={purchased ? c.textChat : c.previewChat} className={railBtn}>
            <MessageCircle className={railIcon} />
            <span className={railLabel}>Chat</span>
          </button>
        )}
        <button type="button" onClick={onShare} aria-label="Share" className={railBtn}>
          <Share2 className={railIcon} />
          <span className={railLabel}>Share</span>
        </button>
        {has("robot") && purchased && (
          <button type="button" onClick={onRobot} aria-label={c.robot} className={railBtn}>
            <Bot className={railIcon} />
          </button>
        )}
      </div>

      {/* Title card: sits above a wide video in the spare black space so the
          picture is never covered; vertical videos keep it near the bottom. */}
      <div
        className={`pointer-events-none absolute inset-x-0 z-30 px-3 pr-20 md:pr-16 transition-opacity duration-500 ${chromeCls}`}
        style={
          isLandscape
            ? { top: "calc(env(safe-area-inset-top) + 3.25rem)" }
            : { bottom: "calc(env(safe-area-inset-bottom) + 7.5rem)" }
        }
      >
        <div className="[text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={onCreator}
            className="pointer-events-auto flex min-w-0 items-center gap-3 text-left"
            aria-label={item.creator}
          >
            {item.avatarUrl ? (
              <img
                src={item.avatarUrl}
                alt={item.creator}
                referrerPolicy="no-referrer"
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                {item.creator.slice(0, 2).toUpperCase()}
              </div>
            )}

            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{item.creator}</span>
              <span className="block truncate text-[11px] text-white/60">{item.handle}</span>
            </span>
          </button>
          <button
            type="button"
            onClick={purchased ? onCancel : onBuy}
            title={purchased ? c.cancelSub : undefined}
            disabled={buying}
            className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
              purchased ? "border border-white/50 bg-black/30 text-white" : "bg-white text-black [text-shadow:none]"
            }`}
          >
            {buying && <Loader2 className="h-3 w-3 animate-spin" />}
            {purchased
              ? c.subscribed
              : item.price > 0
                ? `${c.buy} · ${formatMoney(item.price, item.currency)}`
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

      {/* Seek bar: always at the very bottom, under the picture, never on it. */}
      {duration > 1 && (
        <div
          className={`pointer-events-none absolute inset-x-0 z-30 px-4 transition-opacity duration-500 ${chromeCls}`}
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.25rem)" }}
        >
          <input
            type="range"
            min={0}
            max={Math.round(duration)}
            step={1}
            value={Math.min(Math.round(now), Math.round(duration))}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Video position"
            className="pointer-events-auto h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-primary"
          />
        </div>
      )}


    </section>
  );
}
