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
type Window = { start: number; end: number };

/** Legacy results carry no window; they were always 5-minute checkpoints. */
function windowOf(result: ChunkResult, chunkIndex: number): Window {
  const w = result.window;
  if (w && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start) return w;
  return { start: chunkIndex * CHUNK_SECONDS, end: (chunkIndex + 1) * CHUNK_SECONDS };
}

function wholeVideoStamp(raw: string, chunkIndex: number, win?: Window): string {
  const parts = String(raw ?? "").split(/\s*(?:-|–|—|>)\s*/).filter(Boolean);
  const values = parts.map(stampSeconds);
  if (!values.length || values[0] == null) return raw;
  const chunkStart = win ? win.start : chunkIndex * CHUNK_SECONDS;
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
  const win = windowOf(result, chunkIndex);
  const chunkStart = win.start;
  const CHUNK_SECONDS = win.end - win.start;
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
  // Legacy payloads may predate the gaming layer — give them an empty one.
  const EMPTY: ChunkResult["gaming"] = {
    skills: [], tactics: [], decisions: [], tutorials: [],
    commentaryStyle: [], mistakes: [], communication: [], mindset: [], emotions: [],
  };
  const withGaming: ChunkResult = { ...result, gaming: result.gaming ?? EMPTY };
  const win = windowOf(withGaming, chunkIndex);
  if (win.start === 0) return confineTranscript(fillMissingTranscriptStamps(withGaming, chunkIndex), win);
  result = withGaming;

  const stamp = (value: string) => wholeVideoStamp(value, chunkIndex, win);
  const shifted: ChunkResult = {
    ...result,
    gaming: {
      ...result.gaming,
      skills: result.gaming.skills.map((item) => ({ ...item, timestamp_start: stamp(item.timestamp_start), timestamp_end: stamp(item.timestamp_end) })),
      tactics: result.gaming.tactics.map((item) => ({ ...item, timestamp_start: stamp(item.timestamp_start), timestamp_end: stamp(item.timestamp_end) })),
      decisions: result.gaming.decisions.map((item) => ({ ...item, timestamp: stamp(item.timestamp) })),
      tutorials: result.gaming.tutorials.map((item) => ({ ...item, timestamp_start: stamp(item.timestamp_start), timestamp_end: stamp(item.timestamp_end) })),
      communication: result.gaming.communication.map((item) => ({ ...item, timestamp: stamp(item.timestamp) })),
      emotions: result.gaming.emotions.map((item) => ({ ...item, timestamp: stamp(item.timestamp) })),
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
    qaPairs: (result.qaPairs ?? []).map((item) => ({ ...item, timestamp: stamp(item.timestamp) })),
    entities: (result.entities ?? []).map((item) => ({ ...item, timestamps: item.timestamps.map(stamp) })),
    screenText: (result.screenText ?? []).map((item) => ({ ...item, timestamp: stamp(item.timestamp) })),
  };
  // Fill after shifting so generated windows land in whole-video time.
  return confineTranscript(fillMissingTranscriptStamps(shifted, chunkIndex), win);
}

/** Share of Cyrillic letters among all letters — tells Mongolian captions from English summaries. */
export function cyrillicShare(text: string): number {
  const letters = String(text ?? "").match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => /[\u0400-\u04FF]/.test(c)).length / letters.length;
}

/**
 * Every spoken line must sit inside the part it was mined from. A stamp the
 * model wrote as MM:SS:frames ("10:10:04" inside the 10–15 minute part) is read
 * back as minutes; anything still outside the part is dropped, because one
 * stray "10 hours" line used to push every later caption past the video's end.
 * Heard-only lines in another script than the captions are model summaries,
 * not speech, so they never reach the subtitles.
 */
function confineTranscript(result: ChunkResult, win: Window): ChunkResult {
  const SLACK = 15;
  const inside = (sec: number) => sec >= win.start - SLACK && sec <= win.end + SLACK;
  const captioned = result.transcript.filter((l) => l.source === "caption" || l.source === "verified");
  const captionCyrillic = captioned.length
    ? captioned.reduce((sum, l) => sum + cyrillicShare(l.speech), 0) / captioned.length
    : null;
  const out: ChunkResult["transcript"] = [];
  for (const line of result.transcript) {
    if (line.source === "heard" && captionCyrillic != null) {
      const own = cyrillicShare(line.speech);
      if ((captionCyrillic > 0.6 && own < 0.3) || (captionCyrillic < 0.2 && own > 0.6)) continue;
    }
    const parts = String(line.timestamp ?? "").split(/\s*(?:-|–|—|>)\s*/).filter(Boolean);
    const start = stampSeconds(parts[0] ?? "");
    if (start == null) { out.push(line); continue; }
    if (inside(start)) { out.push(line); continue; }
    const asMinutes = (raw: string) => {
      const p = raw.split(":").map(Number);
      return p.length === 3 && p.every(Number.isFinite) ? p[0]! * 60 + p[1]! : null;
    };
    const rescued = asMinutes(parts[0] ?? "");
    if (rescued != null && inside(rescued)) {
      const endRaw = parts[1] ? asMinutes(parts[1]) : null;
      const end = endRaw != null && endRaw > rescued ? Math.min(endRaw, win.end + SLACK) : rescued + 4;
      out.push({ ...line, timestamp: `${stampAt(rescued)} - ${stampAt(end)}` });
    }
    // Otherwise the line is outside its part entirely: drop it.
  }
  return { ...result, transcript: out };
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
    qaPairs: normalized.flatMap((r) => r.qaPairs ?? []),
    entities: mergeEntities(normalized.flatMap((r) => r.entities ?? [])),
    screenText: uniqueBy(normalized.flatMap((r) => r.screenText ?? []), (t) => `${t.kind}|${t.text.trim()}`),
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
      communication: normalized.flatMap((r) => r.gaming.communication),
      mindset: uniqueStrings(normalized.flatMap((r) => r.gaming.mindset)),
      emotions: normalized.flatMap((r) => r.gaming.emotions),
    },
  };
}

/** One entry per entity across all parts: timestamps and links are combined. */
function mergeEntities(list: import("@/lib/gemini").MinedEntity[]): import("@/lib/gemini").MinedEntity[] {
  const map = new Map<string, import("@/lib/gemini").MinedEntity>();
  for (const e of list) {
    const k = e.name.toLowerCase().trim();
    const prev = map.get(k);
    if (!prev) { map.set(k, { ...e, timestamps: [...e.timestamps], relations: [...e.relations] }); continue; }
    if (!prev.description && e.description) prev.description = e.description;
    prev.timestamps = [...new Set([...prev.timestamps, ...e.timestamps])];
    const seen = new Set(prev.relations.map((r) => `${r.target.toLowerCase()}|${r.relation.toLowerCase()}`));
    for (const r of e.relations) if (!seen.has(`${r.target.toLowerCase()}|${r.relation.toLowerCase()}`)) prev.relations.push(r);
  }
  return [...map.values()];
}
