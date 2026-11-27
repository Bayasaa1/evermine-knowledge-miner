/**
 * Project outline: a compact index built from mined videos so search and chat
 * read a small keyword/lesson catalog instead of scanning large mined payloads.
 * Pure helpers only; nothing here calls AI or touches the database.
 */

export type LessonMistake = { timestamp: string; mistake: string; cause: string; fix: string };
export type LessonPack = {
  mistakes: LessonMistake[];
  gotchas: string[];
  recommendations: string[];
  capabilities: string[];
  limits: string[];
  keywords: string[];
};

export type VideoOutline = {
  title: string;
  summary: string;
  keywords: string[];
  mistakes: LessonMistake[];
  gotchas: string[];
  recommendations: string[];
  capabilities: string[];
  limits: string[];
};

export type ProjectOutline = { videos: Record<string, VideoOutline> };

const str = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, max = 300, cap = 20) =>
  Array.isArray(v) ? [...new Set(v.map((x) => str(x, max)).filter(Boolean))].slice(0, cap) : [];

export function emptyLessons(): LessonPack {
  return { mistakes: [], gotchas: [], recommendations: [], capabilities: [], limits: [], keywords: [] };
}

export function normalizeLessons(raw: unknown): LessonPack {
  const v = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mistakes = (Array.isArray(v["mistakes"]) ? v["mistakes"] : [])
    .map((m) => {
      const r = m && typeof m === "object" ? (m as Record<string, unknown>) : {};
      return { timestamp: str(r["timestamp"], 20), mistake: str(r["mistake"]), cause: str(r["cause"]), fix: str(r["fix"]) };
    })
    .filter((m) => m.mistake && m.fix)
    .slice(0, 30);
  return {
    mistakes,
    gotchas: strs(v["gotchas"]),
    recommendations: strs(v["recommendations"]),
    capabilities: strs(v["capabilities"]),
    limits: strs(v["limits"]),
    keywords: strs(v["keywords"], 60, 30),
  };
}

export function mergeLessons(packs: Array<LessonPack | undefined>): LessonPack {
  const all = packs.filter(Boolean) as LessonPack[];
  const uniq = (xs: string[], cap: number) => [...new Set(xs)].slice(0, cap);
  const seen = new Set<string>();
  const mistakes = all.flatMap((p) => p.mistakes).filter((m) => {
    const k = m.mistake.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    mistakes: mistakes.slice(0, 60),
    gotchas: uniq(all.flatMap((p) => p.gotchas), 40),
    recommendations: uniq(all.flatMap((p) => p.recommendations), 40),
    capabilities: uniq(all.flatMap((p) => p.capabilities), 40),
    limits: uniq(all.flatMap((p) => p.limits), 40),
    keywords: uniq(all.flatMap((p) => p.keywords), 60),
  };
}

/** Lowercased, trimmed, deduplicated search keys. */
export function normalizeKeywords(words: string[], cap = 60): string[] {
  return [...new Set(words.map((w) => w.toLowerCase().replace(/\s+/g, " ").trim()).filter((w) => w.length >= 2 && w.length <= 60))].slice(0, cap);
}

export function buildVideoOutline(input: {
  title: string;
  summary?: string;
  tags?: string[];
  concepts?: string[];
  lessons?: LessonPack;
}): VideoOutline {
  const l = input.lessons ?? emptyLessons();
  return {
    title: input.title.slice(0, 200),
    summary: (input.summary ?? "").slice(0, 400),
    keywords: normalizeKeywords([...l.keywords, ...(input.tags ?? []), ...(input.concepts ?? []).slice(0, 15)], 30),
    mistakes: l.mistakes.slice(0, 20),
    gotchas: l.gotchas.slice(0, 15),
    recommendations: l.recommendations.slice(0, 15),
    capabilities: l.capabilities.slice(0, 15),
    limits: l.limits.slice(0, 15),
  };
}

/** Replaces one video's entry and recomputes the project keyword index. */
export function mergeProjectOutline(
  existing: ProjectOutline | null | undefined,
  contentId: string,
  video: VideoOutline,
): { outline: ProjectOutline; keywords: string[]; videoKeywords: Record<string, string[]> } {
  const videos = { ...(existing?.videos ?? {}), [contentId]: video };
  const videoKeywords: Record<string, string[]> = {};
  for (const [id, v] of Object.entries(videos)) videoKeywords[id] = v.keywords;
  const keywords = normalizeKeywords(Object.values(videos).flatMap((v) => v.keywords), 400);
  return { outline: { videos }, keywords, videoKeywords };
}

/** Chat block: project scope plus the author's known mistakes with their fixes. */
export function outlinePromptBlock(outline: ProjectOutline | null | undefined, query = "", maxChars = 3500): string {
  const videos = Object.values(outline?.videos ?? {});
  if (!videos.length) return "";
  const q = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  const score = (s: string) => q.reduce((n, w) => (s.toLowerCase().includes(w) ? n + 1 : n), 0);
  const ranked = <T,>(xs: T[], text: (x: T) => string, n: number) =>
    xs.map((x, i) => ({ x, s: score(text(x)), i })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, n).map((r) => r.x);
  const all = mergeLessons(videos.map((v) => ({ ...v, keywords: v.keywords })));
  const lines: string[] = [];
  lines.push(`PROJECT OUTLINE (${videos.length} videos): ${videos.map((v) => v.title).slice(0, 25).join(" | ")}`);
  if (all.capabilities.length) lines.push(`WHAT THIS PROJECT COVERS: ${ranked(all.capabilities, (x) => x, 8).join("; ")}`);
  if (all.limits.length) lines.push(`OUT OF SCOPE (say so honestly instead of inventing): ${ranked(all.limits, (x) => x, 6).join("; ")}`);
  if (all.mistakes.length) {
    lines.push(`KNOWN MISTAKES IN THE VIDEOS AND THEIR VERIFIED FIXES — never present the mistaken version as correct; always give the fix:`);
    for (const m of ranked(all.mistakes, (m) => `${m.mistake} ${m.cause} ${m.fix}`, 8)) {
      lines.push(`- Mistake: ${m.mistake}${m.cause ? ` (cause: ${m.cause})` : ""} → Fix: ${m.fix}`);
    }
  }
  if (all.gotchas.length) lines.push(`PITFALLS TO WARN ABOUT: ${ranked(all.gotchas, (x) => x, 6).join("; ")}`);
  if (all.recommendations.length) lines.push(`MY RECOMMENDATIONS: ${ranked(all.recommendations, (x) => x, 6).join("; ")}`);
  return lines.join("\n").slice(0, maxChars);
}
