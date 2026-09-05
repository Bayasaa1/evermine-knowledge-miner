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

export function secondsOf(v: unknown): number | null {
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
  return m ? m[1]! : null;
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

/** Builds subtitle cues, filling in end times and dropping duplicate lines. */
function buildCues(items: Record<string, unknown>[]): Cue[] {
  const cues: Cue[] = [];
  let seen = "";
  for (const item of items) {
    const text = (str(item['speech']) || str(item['text']) || str(item['line'])).trim();
    if (!text || text === seen) continue;
    seen = text;
    const raw = item['timestamp'] ?? item['start'] ?? item['time'];
    const start = secondsOf(typeof raw === "string" ? raw.split("-")[0]!.trim() : raw);
    const endRaw =
      item['end'] ?? (typeof raw === "string" && raw.includes("-") ? raw.split("-")[1]!.trim() : undefined);
    cues.push({
      start: start ?? 0,
      end: secondsOf(endRaw),
      text,
      speaker: str(item['speaker']) || str(item['speaker_label']),
    });
  }
  cues.sort((a, b) => a.start - b.start);
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
