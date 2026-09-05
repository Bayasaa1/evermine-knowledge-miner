/**
 * Read-model for a mined Mind payload.
 *
 * Turns the raw `.json.md` payload into typed, timestamped views that the Mind
 * Explorer can render and play back: subtitles, story beats, topics, voice
 * clone segments, face clone clips, emotion records and music segments.
 *
 * Everything here is pure — no network, no state.
 */
import { parseTimestamp } from "@/lib/mind-json";
import type { MindPayload } from "@/lib/mind-json";

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [];

/** Seconds for a timestamp value; blank or unparseable values yield null. */
export function secondsOf(v: unknown): number | null {
  if (typeof v === "string" && !v.trim()) return null;
  if (v === null || v === undefined) return null;
  return parseTimestamp(v);
}

export function clock(total: number | null | undefined): string {
  if (total === null || total === undefined || !Number.isFinite(total)) return "--:--";
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

export type Segment = { start: number; end: number | null };

export type Cue = Segment & { text: string; speaker: string };
export type Beat = { at: number | null; event: string; emotion: string };
export type Topic = { title: string; detail: string; start: number | null; end: number | null; confidence: number | null; action: string };
export type VoiceClip = Segment & { quality: string; note: string; musicPresent: boolean };
export type FaceClip = Segment & { at: number | null; description: string; actionType: string; faceAngle: string; gestures: string; lighting: string; quality: string; key: boolean };
export type EmotionPoint = { at: number | null; emotion: string; intensity: string; note: string };
export type MusicSegment = Segment & { mood: string; genre: string; tempo: string; instrumentation: string; original: boolean };
export type Speaker = { label: string; role: string; description: string };
export type Phrase = { phrase: string; literal: string; meaning: string; kind: string; sentiment: string; at: number | null };

export type MindStory = {
  summary: string;
  tone: string;
  beats: Beat[];
};

export type MindView = {
  sourceLabel: string;
  youtubeId: string | null;
  story: MindStory;
  speakers: Speaker[];
  cues: Cue[];
  topics: Topic[];
  knowledge: string[];
  voice: VoiceClip[];
  face: FaceClip[];
  emotions: EmotionPoint[];
  music: MusicSegment[];
  musicTracks: string[];
  atmosphere: string;
  voiceSkills: string[];
  beliefs: string[];
  skills: string[];
  decisionLogic: string[];
  expressiveStyle: string[];
  phrases: Phrase[];
  counts: Record<string, number>;
};

const YT = /(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/;

export function youtubeIdFromPayload(payload: MindPayload): string | null {
  const source = payload['source'];
  const label =
    typeof source === "string"
      ? source
      : source && typeof source === "object"
        ? str((source as Record<string, unknown>)['label']) || str((source as Record<string, unknown>)['url'])
        : "";
  const m = label.match(YT);
  if (m) return m[1]!;
  // Some older rows stored only the bare video id as the label.
  const bare = label.trim().match(/^[A-Za-z0-9_-]{11}$/);
  if (bare) return bare[0];
  const video = payload['video'];
  if (video && typeof video === "object") {
    const vid = str((video as Record<string, unknown>)['id']) || str((video as Record<string, unknown>)['url']);
    const vm = vid.match(YT);
    if (vm) return vm[1]!;
    if (/^[A-Za-z0-9_-]{11}$/.test(vid.trim())) return vid.trim();
  }
  return null;
}

export function sourceLabelOf(payload: MindPayload): string {
  const source = payload['source'];
  if (typeof source === "string") return source;
  if (source && typeof source === "object") {
    const o = source as Record<string, unknown>;
    return str(o['label']) || str(o['url']) || str(o['kind']);
  }
  return "";
}

/**
 * Builds subtitle cues in document order.
 *
 * The miner sometimes returns lines without timestamps. Rather than collapsing
 * them all onto 0:00, untimed runs are spread evenly between the surrounding
 * timestamped anchors so every line still points at a real moment.
 */
function buildCues(items: Record<string, unknown>[]): Cue[] {
  type Raw = { start: number | null; end: number | null; text: string; speaker: string };
  const raws: Raw[] = [];
  let seen = "";
  for (const item of items) {
    const text = (str(item['speech']) || str(item['text']) || str(item['line'])).trim();
    if (!text || text === seen) continue;
    seen = text;
    const stamp = item['timestamp'] ?? item['start'] ?? item['time'];
    const startRaw = typeof stamp === "string" && stamp.includes("-") ? stamp.split("-")[0]!.trim() : stamp;
    const endRaw =
      item['end'] ?? (typeof stamp === "string" && stamp.includes("-") ? stamp.split("-")[1]!.trim() : undefined);
    raws.push({
      start: secondsOf(startRaw),
      end: secondsOf(endRaw),
      text,
      speaker: str(item['speaker']) || str(item['speaker_label']),
    });
  }

  // Interpolate untimed runs between known anchors.
  const anchors = raws.map((r, i) => (r.start !== null ? i : -1)).filter((i) => i >= 0);
  if (anchors.length > 0) {
    for (let i = 0; i < raws.length; i++) {
      if (raws[i]!.start !== null) continue;
      const before = [...anchors].reverse().find((a) => a < i);
      const after = anchors.find((a) => a > i);
      if (before !== undefined && after !== undefined) {
        const span = (raws[after]!.start! - raws[before]!.start!) / (after - before);
        raws[i]!.start = raws[before]!.start! + span * (i - before);
      } else if (before !== undefined) {
        raws[i]!.start = raws[before]!.start! + (i - before) * 8;
      } else if (after !== undefined) {
        // Nothing timed before this line: spread the opening run from 0 up to
        // the first known anchor so early lines don't all pile onto 0:00.
        raws[i]!.start = (raws[after]!.start! * i) / Math.max(1, after);
      }
    }
  }

  const cues: Cue[] = raws.map((r) => ({ ...r, start: Math.max(0, Math.round(r.start ?? 0)) }));
  return cues.map((c, i) => ({ ...c, end: c.end ?? cues[i + 1]?.start ?? c.start + 5 }));
}

export function buildMindView(payload: MindPayload): MindView {
  const result = (payload.result ?? {}) as Record<string, unknown>;
  const storyRaw = (result['story'] ?? {}) as Record<string, unknown>;
  const sub = (result['subconsciousness'] ?? {}) as Record<string, unknown>;
  const audio = (result['audio'] ?? {}) as Record<string, unknown>;

  const cues = buildCues(arr(result['transcript']));

  const topics: Topic[] = arr(result['knowledgeNodes']).map((n) => ({
    title: str(n['concept_title']) || str(n['title']),
    detail: str(n['detailed_explanation']) || str(n['explanation']),
    start: secondsOf(n['timestamp_start']),
    end: secondsOf(n['timestamp_end']),
    confidence: typeof n['confidence_score'] === "number" ? (n['confidence_score'] as number) : null,
    action: str(n['spatial_action']),
  }));

  const voice: VoiceClip[] = arr(result['voiceData']).map((v) => ({
    start: secondsOf(v['start']) ?? 0,
    end: secondsOf(v['end']),
    quality: str(v['quality']),
    note: str(v['note']),
    musicPresent: v['musicPresent'] === true,
  }));

  const scenes = arr(result['scenes']);
  const face: FaceClip[] = arr(result['faceData']).map((f, i) => ({
    at: secondsOf(f['timestamp']),
    start: secondsOf(f['clipStart']) ?? secondsOf(f['timestamp']) ?? 0,
    end: secondsOf(f['clipEnd']),
    description: str(f['description']) || str(scenes[i]?.['description']),
    actionType: str(f['actionType']),
    faceAngle: str(f['faceAngle']),
    gestures: str(f['gestures']),
    lighting: str(f['lighting']),
    quality: str(f['cloneQuality']),
    key: f['isKeyAction'] === true,
  }));

  const emotions: EmotionPoint[] = arr(result['emotionTimeline']).map((e) => ({
    at: secondsOf(e['timestamp'] ?? e['start']),
    emotion: str(e['emotion']) || str(e['label']) || str(e['mood']),
    intensity: str(e['intensity']) || str(e['strength']),
    note: str(e['note']) || str(e['reason']) || str(e['description']),
  }));

  const music: MusicSegment[] = arr(audio['segments']).map((s) => ({
    start: secondsOf(s['start']) ?? 0,
    end: secondsOf(s['end']),
    mood: str(s['mood']),
    genre: str(s['genre']),
    tempo: str(s['tempo']),
    instrumentation: str(s['instrumentation']),
    original: s['isOriginalByOwner'] === true,
  }));

  const phrases: Phrase[] = arr(sub['culturalVocabulary']).map((p) => ({
    phrase: str(p['phrase']),
    literal: str(p['literal']),
    meaning: str(p['meaning']),
    kind: str(p['kind']),
    sentiment: str(p['sentiment']),
    at: secondsOf(p['timestamp']),
  }));

  const beats: Beat[] = arr(storyRaw['beats']).map((b) => ({
    at: secondsOf(b['timestamp']),
    event: str(b['event']) || str(b['description']),
    emotion: str(b['emotion']),
  }));

  return {
    sourceLabel: sourceLabelOf(payload),
    youtubeId: youtubeIdFromPayload(payload),
    story: { summary: str(storyRaw['summary']), tone: str(storyRaw['tone']), beats },
    speakers: arr(result['speakers']).map((s) => ({
      label: str(s['label']),
      role: str(s['role']),
      description: str(s['description']),
    })),
    cues,
    topics,
    knowledge: strList(result['knowledge']),
    voice,
    face,
    emotions,
    music,
    musicTracks: strList(audio['tracks']) ,
    atmosphere: str(audio['atmosphere']),
    voiceSkills: strList(audio['audioSkillAssets']),
    beliefs: strList(sub['beliefs']),
    skills: strList(sub['skills']),
    decisionLogic: strList(sub['decisionLogic']),
    expressiveStyle: strList(sub['expressiveStyle']),
    phrases,
    counts: {
      subtitles: cues.length,
      topics: topics.length,
      voice: voice.length,
      face: face.length,
      emotions: emotions.length,
      beats: beats.length,
    },
  };
}
