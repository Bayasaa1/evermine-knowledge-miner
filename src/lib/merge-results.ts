import type { ChunkResult } from "@/lib/gemini";

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = v.trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/**
 * Fold every 5-minute checkpoint into one Mind result. Arrays concatenate in
 * chunk order so timestamps stay chronological; single-value profiles take the
 * first non-empty value seen.
 */
export function mergeChunkResults(list: ChunkResult[]): ChunkResult | null {
  if (list.length === 0) return null;
  const base = list[0]!;
  if (list.length === 1) return base;

  const firstNonEmpty = (pick: (r: ChunkResult) => string): string =>
    list.map(pick).find((v) => !!v && v.trim().length > 0) ?? "";

  const signals = list.flatMap((r) => r.copyright.signals);
  const flagged = list.some((r) => r.copyright.flagged);

  return {
    speakers: uniqueBy(
      list.flatMap((r) => r.speakers),
      (s) => `${s.label}|${s.role}`,
    ),
    transcript: list.flatMap((r) => r.transcript),
    scenes: list.flatMap((r) => r.scenes),
    knowledge: uniqueStrings(list.flatMap((r) => r.knowledge)),
    story: {
      summary: uniqueStrings(list.map((r) => r.story.summary)).join(" "),
      tone: firstNonEmpty((r) => r.story.tone),
      beats: list.flatMap((r) => r.story.beats),
    },
    faceData: list.flatMap((r) => r.faceData),
    voiceData: list.flatMap((r) => r.voiceData),
    audio: {
      hasMusic: list.some((r) => r.audio.hasMusic),
      atmosphere: firstNonEmpty((r) => r.audio.atmosphere),
      genres: uniqueStrings(list.flatMap((r) => r.audio.genres)),
      moods: uniqueStrings(list.flatMap((r) => r.audio.moods)),
      tempo: firstNonEmpty((r) => r.audio.tempo),
      segments: list.flatMap((r) => r.audio.segments),
      audioSkillAssets: uniqueStrings(list.flatMap((r) => r.audio.audioSkillAssets)),
    },
    subconsciousness: {
      skills: uniqueStrings(list.flatMap((r) => r.subconsciousness.skills)),
      beliefs: uniqueStrings(list.flatMap((r) => r.subconsciousness.beliefs)),
      decisionLogic: uniqueStrings(list.flatMap((r) => r.subconsciousness.decisionLogic)),
      culturalVocabulary: uniqueBy(
        list.flatMap((r) => r.subconsciousness.culturalVocabulary),
        (c) => `${c.phrase}|${c.timestamp}`,
      ),
      expressiveStyle: uniqueStrings(list.flatMap((r) => r.subconsciousness.expressiveStyle)),
      aestheticProfile: uniqueStrings(list.flatMap((r) => r.subconsciousness.aestheticProfile)),
    },
    knowledgeNodes: list.flatMap((r) => r.knowledgeNodes),
    emotionTimeline: list.flatMap((r) => r.emotionTimeline),
    copyright: {
      flagged,
      originality: flagged ? "third-party" : firstNonEmpty((r) => r.copyright.originality) || "original",
      signals,
      summary: uniqueStrings(list.map((r) => r.copyright.summary)).join(" "),
    },
  };
}
