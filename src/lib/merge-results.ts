import type { ChunkResult } from "@/lib/gemini";

const CHUNK_SECONDS = 300;

function stampSeconds(raw: string): number | null {
  const first = String(raw ?? "").split(/\s*(?:-|–|—|>)\s*/)[0]?.trim() ?? "";
  const parts = first.split(":").map(Number);
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0] ?? null;
}

function stampAt(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Gemini can occasionally return times relative to a checkpoint despite the prompt. */
function wholeVideoStamp(raw: string, chunkIndex: number): string {
  const parts = String(raw ?? "").split(/\s*(?:-|–|—|>)\s*/).filter(Boolean);
  const values = parts.map(stampSeconds);
  if (!values.length || values[0] == null) return raw;
  const chunkStart = chunkIndex * CHUNK_SECONDS;
  // A timestamp before this checkpoint is necessarily chunk-local.
  if (chunkIndex === 0 || values[0]! >= chunkStart - 10) return raw;
  return values.map((value) => value == null ? "" : stampAt(value + chunkStart)).filter(Boolean).join(" - ");
}

/**
 * Some checkpoints come back with spoken lines but no timestamp at all. Spread
 * those lines across the checkpoint's own 5-minute window (weighted by how much
 * was said) so captions stay near the audio instead of being guessed later
 * against the whole video.
 */
function fillMissingTranscriptStamps(result: ChunkResult, chunkIndex: number): ChunkResult {
  const lines = result.transcript;
  if (!lines.length || lines.every((l) => String(l.timestamp ?? "").trim())) return result;
  const chunkStart = chunkIndex * CHUNK_SECONDS;
  const anchors = lines.map((l) => {
    const raw = String(l.timestamp ?? "").trim();
    return raw ? stampSeconds(raw) : null;
  });
  const weights = lines.map((l) => Math.max(1, String(l.speech ?? "").length));

  const filled = lines.map((line, index) => {
    if (anchors[index] != null) return line;
    // Nearest known stamps on either side bound the gap; fall back to the chunk window.
    let before = chunkStart;
    for (let i = index - 1; i >= 0; i -= 1) if (anchors[i] != null) { before = anchors[i]!; break; }
    let afterIndex = lines.length;
    let after = chunkStart + CHUNK_SECONDS;
    for (let i = index + 1; i < lines.length; i += 1) if (anchors[i] != null) { afterIndex = i; after = anchors[i]!; break; }
    let startOfRun = index;
    while (startOfRun > 0 && anchors[startOfRun - 1] == null) startOfRun -= 1;
    const runWeights = weights.slice(startOfRun, afterIndex);
    const total = runWeights.reduce((sum, w) => sum + w, 0) || 1;
    const consumed = weights.slice(startOfRun, index).reduce((sum, w) => sum + w, 0);
    const span = Math.max(after - before, runWeights.length * 2);
    const start = before + (span * consumed) / total;
    const end = before + (span * (consumed + weights[index]!)) / total;
    anchors[index] = start;
    return { ...line, timestamp: `${stampAt(start)} - ${stampAt(Math.max(end, start + 1))}` };
  });

  return { ...result, transcript: filled };
}

function normalizeChunkTimeline(result: ChunkResult, chunkIndex: number): ChunkResult {
  if (chunkIndex === 0) return fillMissingTranscriptStamps(result, 0);

  const stamp = (value: string) => wholeVideoStamp(value, chunkIndex);
  const shifted: ChunkResult = {
    ...result,
    gaming: {
      ...result.gaming,
      skills: result.gaming.skills.map((item) => ({ ...item, timestamp_start: stamp(item.timestamp_start), timestamp_end: stamp(item.timestamp_end) })),
      tactics: result.gaming.tactics.map((item) => ({ ...item, timestamp_start: stamp(item.timestamp_start), timestamp_end: stamp(item.timestamp_end) })),
      decisions: result.gaming.decisions.map((item) => ({ ...item, timestamp: stamp(item.timestamp) })),
      tutorials: result.gaming.tutorials.map((item) => ({ ...item, timestamp_start: stamp(item.timestamp_start), timestamp_end: stamp(item.timestamp_end) })),
    },
    transcript: result.transcript.map((item) => ({ ...item, timestamp: stamp(item.timestamp) })),
    story: { ...result.story, beats: result.story.beats.map((item) => ({ ...item, timestamp: stamp(item.timestamp) })) },
    faceData: result.faceData.map((item) => ({ ...item, timestamp: stamp(item.timestamp), clipStart: stamp(item.clipStart), clipEnd: stamp(item.clipEnd) })),
    voiceData: result.voiceData.map((item) => ({ ...item, start: stamp(item.start), end: stamp(item.end) })),
    audio: { ...result.audio, segments: result.audio.segments.map((item) => ({ ...item, start: stamp(item.start), end: stamp(item.end) })) },
    subconsciousness: {
      ...result.subconsciousness,
      culturalVocabulary: result.subconsciousness.culturalVocabulary.map((item) => ({ ...item, timestamp: stamp(item.timestamp) })),
    },
    knowledgeNodes: result.knowledgeNodes.map((item) => ({ ...item, timestamp_start: stamp(item.timestamp_start), timestamp_end: stamp(item.timestamp_end) })),
    emotionTimeline: result.emotionTimeline.map((item) => ({ ...item, timestamp_start: stamp(item.timestamp_start), timestamp_end: stamp(item.timestamp_end) })),
    copyright: { ...result.copyright, signals: result.copyright.signals.map((item) => ({ ...item, timestamp: stamp(item.timestamp) })) },
  };
  // Fill after shifting so generated windows land in whole-video time.
  return fillMissingTranscriptStamps(shifted, chunkIndex);
}


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
  const normalized = list.map(normalizeChunkTimeline);
  const base = normalized[0]!;
  if (list.length === 1) return base;

  const firstNonEmpty = (pick: (r: ChunkResult) => string): string =>
    normalized.map(pick).find((v) => !!v && v.trim().length > 0) ?? "";

  const signals = normalized.flatMap((r) => r.copyright.signals);
  const flagged = normalized.some((r) => r.copyright.flagged);

  return {
    speakers: uniqueBy(
      normalized.flatMap((r) => r.speakers),
      (s) => `${s.label}|${s.role}`,
    ),
    transcript: normalized.flatMap((r) => r.transcript),
    scenes: normalized.flatMap((r) => r.scenes),
    knowledge: uniqueStrings(normalized.flatMap((r) => r.knowledge)),
    story: {
      summary: uniqueStrings(normalized.map((r) => r.story.summary)).join(" "),
      tone: firstNonEmpty((r) => r.story.tone),
      beats: normalized.flatMap((r) => r.story.beats),
    },
    faceData: normalized.flatMap((r) => r.faceData),
    voiceData: normalized.flatMap((r) => r.voiceData),
    audio: {
      hasMusic: normalized.some((r) => r.audio.hasMusic),
      atmosphere: firstNonEmpty((r) => r.audio.atmosphere),
      genres: uniqueStrings(normalized.flatMap((r) => r.audio.genres)),
      moods: uniqueStrings(normalized.flatMap((r) => r.audio.moods)),
      tempo: firstNonEmpty((r) => r.audio.tempo),
      segments: normalized.flatMap((r) => r.audio.segments),
      audioSkillAssets: uniqueStrings(normalized.flatMap((r) => r.audio.audioSkillAssets)),
    },
    subconsciousness: {
      skills: uniqueStrings(normalized.flatMap((r) => r.subconsciousness.skills)),
      beliefs: uniqueStrings(normalized.flatMap((r) => r.subconsciousness.beliefs)),
      decisionLogic: uniqueStrings(normalized.flatMap((r) => r.subconsciousness.decisionLogic)),
      culturalVocabulary: uniqueBy(
        normalized.flatMap((r) => r.subconsciousness.culturalVocabulary),
        (c) => `${c.phrase}|${c.timestamp}`,
      ),
      expressiveStyle: uniqueStrings(normalized.flatMap((r) => r.subconsciousness.expressiveStyle)),
      aestheticProfile: uniqueStrings(normalized.flatMap((r) => r.subconsciousness.aestheticProfile)),
    },
    knowledgeNodes: normalized.flatMap((r) => r.knowledgeNodes),
    emotionTimeline: normalized.flatMap((r) => r.emotionTimeline),
    copyright: {
      flagged,
      originality: flagged ? "third-party" : firstNonEmpty((r) => r.copyright.originality) || "original",
      signals,
      summary: uniqueStrings(normalized.map((r) => r.copyright.summary)).join(" "),
    },
    gaming: {
      skills: uniqueBy(normalized.flatMap((r) => r.gaming.skills), (s) => s.name.toLowerCase()),
      tactics: uniqueBy(normalized.flatMap((r) => r.gaming.tactics), (t) => t.name.toLowerCase()),
      decisions: normalized.flatMap((r) => r.gaming.decisions),
      tutorials: uniqueBy(normalized.flatMap((r) => r.gaming.tutorials), (t) => t.title.toLowerCase()),
      commentaryStyle: uniqueStrings(normalized.flatMap((r) => r.gaming.commentaryStyle)),
      mistakes: uniqueStrings(normalized.flatMap((r) => r.gaming.mistakes)),
    },
  };
}
