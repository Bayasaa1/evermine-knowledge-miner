/**
 * Viewer feed interests: the TikTok-style "What are you into?" catalog plus
 * device-local storage. Signed-in viewers also sync through viewer_brains
 * (mind_id "global_interests") via saveFeedInterests/loadFeedInterests.
 */
import type { CreationCategory } from "./creation-category";

type L = { en: string; mn: string; ko: string };
export type InterestTag = { id: string; emoji: string; label: L; keywords: string[] };
export type InterestGroup = { category: CreationCategory; emoji: string; label: L; tags: InterestTag[] };

const t = (id: string, emoji: string, en: string, mn: string, ko: string, keywords: string[]): InterestTag => ({
  id, emoji, label: { en, mn, ko }, keywords,
});

export const INTEREST_GROUPS: InterestGroup[] = [
  {
    category: "knowledge", emoji: "🧠",
    label: { en: "Knowledge & Business", mn: "Мэдлэг ба Бизнес", ko: "지식 & 비즈니스" },
    tags: [
      t("ai-tech", "🤖", "AI & Tech", "AI ба Технологи", "AI & 테크", ["ai", "tech", "artificial", "machine learning", "llm", "software", "tesla", "spacex", "xai"]),
      t("crypto-finance", "💰", "Crypto & Finance", "Крипто ба Санхүү", "크립토 & 금융", ["crypto", "bitcoin", "finance", "money", "invest", "stock", "market", "economy"]),
      t("startups", "🚀", "Startups", "Стартап", "스타트업", ["startup", "founder", "business", "entrepreneur", "company"]),
      t("science", "🔬", "Science", "Шинжлэх ухаан", "과학", ["science", "brain", "neuro", "physics", "biology", "health", "huberman"]),
      t("philosophy", "🤔", "Philosophy", "Философи", "철학", ["philosophy", "meaning", "consciousness", "ethics", "podcast"]),
      t("history", "📜", "History", "Түүх", "역사", ["history", "war", "empire", "ancient"]),
    ],
  },
  {
    category: "movement", emoji: "💪",
    label: { en: "Movement & Skills", mn: "Хөдөлгөөн ба Ур чадвар", ko: "움직임 & 스킬" },
    tags: [
      t("cooking", "🍳", "Cooking & Chef Skills", "Хоол ба Тогооч", "요리 & 셰프", ["cook", "chef", "recipe", "kitchen", "food", "ramsay"]),
      t("fitness", "🏋️", "CrossFit & Fitness", "Фитнесс", "크로스핏 & 피트니스", ["fitness", "crossfit", "workout", "gym", "training", "exercise"]),
      t("martial-arts", "🥋", "Martial Arts", "Тулааны урлаг", "무술", ["martial", "boxing", "mma", "jiu", "karate", "fight"]),
      t("art-craft", "🎨", "Art & Craft", "Урлаг ба Гар урлал", "아트 & 공예", ["art", "craft", "paint", "draw", "design"]),
      t("dance", "💃", "Dance", "Бүжиг", "댄스", ["dance", "choreo"]),
    ],
  },
  {
    category: "robot", emoji: "🤖",
    label: { en: "Robotics & Engineering", mn: "Робот ба Инженерчлэл", ko: "로보틱스 & 엔지니어링" },
    tags: [
      t("humanoid", "🦾", "Humanoid Robots", "Хүн дүрст робот", "휴머노이드 로봇", ["humanoid", "robot", "figure", "optimus", "aloha"]),
      t("ros2", "⚙️", "ROS2 & Hardware", "ROS2 ба Тоног төхөөрөмж", "ROS2 & 하드웨어", ["ros", "hardware", "motor", "sensor"]),
      t("diy-electronics", "🔌", "DIY Electronics", "Электроник", "DIY 전자", ["electronics", "arduino", "raspberry", "diy", "circuit"]),
      t("automation", "🏭", "Automation", "Автоматжуулалт", "자동화", ["automation", "factory", "manipulation", "industrial"]),
    ],
  },
  {
    category: "gaming", emoji: "🎮",
    label: { en: "Gaming & Esports", mn: "Тоглоом ба Esports", ko: "게임 & e스포츠" },
    tags: [
      t("fps", "🎯", "FPS & Tactical", "FPS ба Тактик", "FPS & 택티컬", ["fps", "shooter", "valorant", "cs2", "counter", "pubg", "shroud", "tactical"]),
      t("open-world", "🗺️", "Open-World Action", "Нээлттэй ертөнц", "오픈월드 액션", ["open world", "gta", "action", "elden"]),
      t("strategy", "♟️", "Strategy", "Стратеги", "전략", ["strategy", "moba", "dota", "league", "rts", "chess"]),
      t("sandbox", "⛏️", "Sandbox / Minecraft", "Minecraft", "샌드박스 / 마인크래프트", ["minecraft", "sandbox", "redstone", "mumbo", "build"]),
      t("rpg", "🐉", "RPG", "RPG", "RPG", ["rpg", "quest", "fantasy"]),
    ],
  },
];

export const ALL_INTEREST_TAGS: InterestTag[] = INTEREST_GROUPS.flatMap((g) => g.tags);
export const MIN_INTERESTS = 3;

export type FeedInterests = { tags: string[]; categories: CreationCategory[]; updatedAt: string };

/** Categories implied by the chosen tags. */
export function categoriesForTags(tags: string[]): CreationCategory[] {
  return INTEREST_GROUPS.filter((g) => g.tags.some((x) => tags.includes(x.id))).map((g) => g.category);
}

export function sanitizeInterests(input: unknown): FeedInterests | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { tags?: unknown; updatedAt?: unknown };
  if (!Array.isArray(raw.tags)) return null;
  const valid = new Set(ALL_INTEREST_TAGS.map((x) => x.id));
  const tags = [...new Set(raw.tags.filter((x): x is string => typeof x === "string" && valid.has(x)))];
  if (!tags.length) return null;
  return {
    tags,
    categories: categoriesForTags(tags),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
  };
}

const LS_KEY = "evermind:viewer_interests";

export function readLocalInterests(): FeedInterests | null {
  if (typeof window === "undefined") return null;
  try {
    return sanitizeInterests(JSON.parse(window.localStorage.getItem(LS_KEY) ?? "null"));
  } catch {
    return null;
  }
}

export function writeLocalInterests(tags: string[]): FeedInterests | null {
  const v = sanitizeInterests({ tags, updatedAt: new Date().toISOString() });
  if (typeof window !== "undefined" && v) {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* storage full */ }
  }
  return v;
}

// ---- Local watch behaviour (dwell time, quick skips, likes) ----
export type WatchSignal = { dwellMs: number; skips: number; liked?: boolean; chatted?: boolean };
export type ViewerSignals = { byItem: Record<string, WatchSignal>; byCreator: Record<string, number> };

const SIG_KEY = "evermind:viewer_watch_signals";

export function readLocalSignals(): ViewerSignals {
  const empty: ViewerSignals = { byItem: {}, byCreator: {} };
  if (typeof window === "undefined") return empty;
  try {
    const v = JSON.parse(window.localStorage.getItem(SIG_KEY) ?? "null");
    return v && typeof v === "object" && v.byItem && v.byCreator ? v : empty;
  } catch {
    return empty;
  }
}

/** Record how long a clip was watched. Under 3 seconds counts as a quick skip. */
export function recordWatch(itemId: string, creatorKey: string, dwellMs: number) {
  if (typeof window === "undefined" || !itemId) return;
  const s = readLocalSignals();
  const cur = s.byItem[itemId] ?? { dwellMs: 0, skips: 0 };
  cur.dwellMs += Math.max(0, dwellMs);
  if (dwellMs < 3000) cur.skips += 1;
  s.byItem[itemId] = cur;
  s.byCreator[creatorKey] = (s.byCreator[creatorKey] ?? 0) + Math.max(0, dwellMs);
  const ids = Object.keys(s.byItem);
  if (ids.length > 500) for (const id of ids.slice(0, ids.length - 500)) delete s.byItem[id];
  try { window.localStorage.setItem(SIG_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
