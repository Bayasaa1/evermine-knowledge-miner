/**
 * How much the AI may add on top of what a mind actually learned.
 *
 * 0   = only the mined records, nothing invented.
 * 100 = the mind first, then the AI fills anything missing.
 *
 * The choice is remembered per mind on this device. A creator can set their
 * own mind's starting level and a maximum; the server clamps whatever the
 * viewer sends, so the slider can never go past what the creator allows.
 */
import type { Lang } from "@/lib/i18n";

const PREFIX = "evermind.aiLevel";

export const DEFAULT_AI_LEVEL = 100;

export function clampLevel(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_AI_LEVEL;
  return Math.max(0, Math.min(100, n));
}

/** The level saved for this mind, else the device default, else 100. */
export function loadAiLevel(mindId: string | null): number {
  if (typeof window === "undefined") return DEFAULT_AI_LEVEL;
  try {
    const perMind = mindId ? window.localStorage.getItem(`${PREFIX}:${mindId}`) : null;
    const raw = perMind ?? window.localStorage.getItem(PREFIX);
    return raw === null ? DEFAULT_AI_LEVEL : clampLevel(raw);
  } catch {
    return DEFAULT_AI_LEVEL;
  }
}

export function saveAiLevel(mindId: string | null, level: number): void {
  if (typeof window === "undefined") return;
  try {
    const value = String(clampLevel(level));
    window.localStorage.setItem(PREFIX, value);
    if (mindId) window.localStorage.setItem(`${PREFIX}:${mindId}`, value);
  } catch {
    /* private browsing */
  }
}

/** One short line explaining what the current level does, in the user's language. */
export function levelHint(level: number, lang: Lang): string {
  const l = clampLevel(level);
  const band: 0 | 1 | 2 | 3 = l === 0 ? 0 : l <= 30 ? 1 : l <= 70 ? 2 : 3;
  const copy: Record<"en" | "mn" | "ko", [string, string, string, string]> = {
    en: [
      "0% — only what this mind learned from the videos. Nothing is made up.",
      `${l}% — only what the mind learned, said in clearer words.`,
      `${l}% — mostly the mind's own knowledge; added parts are marked.`,
      `${l}% — the mind first, and the AI fills anything missing.`,
    ],
    mn: [
      "0% — зөвхөн видеонуудаас сурсан зүйл. Юу ч зохиохгүй.",
      `${l}% — зөвхөн сурсан зүйлээ, ойлгомжтой үгээр хэлнэ.`,
      `${l}% — гол нь өөрийн мэдлэг; нэмсэн хэсгийг тэмдэглэнэ.`,
      `${l}% — эхлээд оюун, дутууг нь AI нөхнө.`,
    ],
    ko: [
      "0% — 영상에서 배운 것만 말합니다. 지어내지 않습니다.",
      `${l}% — 배운 것만, 더 쉬운 말로 전합니다.`,
      `${l}% — 대부분 자기 지식이며, 추가한 부분은 표시합니다.`,
      `${l}% — 마인드 먼저, 부족한 부분은 AI가 채웁니다.`,
    ],
  };
  const row = copy[(["en", "mn", "ko"] as const).includes(lang as "en") ? (lang as "en" | "mn" | "ko") : "en"];
  return row[band];
}

export function levelTitle(lang: Lang): string {
  return lang === "mn" ? "AI хэр их" : lang === "ko" ? "AI 사용량" : "How much AI";
}

export function levelCapNote(max: number, lang: Lang): string {
  return lang === "mn"
    ? `Энэ оюуны эзэн дээд хэмжээг ${max}% болгосон.`
    : lang === "ko"
      ? `이 마인드의 주인이 최대 ${max}%로 정했습니다.`
      : `This mind's owner caps it at ${max}%.`;
}
