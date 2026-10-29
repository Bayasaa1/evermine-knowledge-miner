import type { Chunk } from "./chunking";
import {
  normalizeChunkResult,
  type ChunkResult,
  type CulturalExpression,
  type EmotionMoment,
} from "./gemini";
import {
  normalizeOwnership,
  signMind,
  type AccessLevel,
  type DigitalSignature,
  type Ownership,
  type RateUnit,
} from "./ownership";

export const MINE_FORMAT = "evermind.mine";
export const MINE_VERSION = 2;

export type MineResult = { index: number; chunk: Chunk; data: ChunkResult };

export type MineFile = {
  format: typeof MINE_FORMAT;
  version: number;
  savedAt: string;
  source: { name: string; size: number; duration: number | null };
  model: string;
  ownership: Ownership;
  chunks: Chunk[];
  results: MineResult[];
  log: string[];
};

export function buildMineFile(input: {
  source: { name: string; size: number; duration: number | null };
  model: string;
  ownership: Ownership;
  chunks: Chunk[];
  results: MineResult[];
  log: string[];
}): MineFile {
  return {
    format: MINE_FORMAT,
    version: MINE_VERSION,
    savedAt: new Date().toISOString(),
    ...input,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isChunk(v: unknown): v is Chunk {
  return isObj(v) && isNum(v['index']) && isNum(v['start']) && isNum(v['end']) && isNum(v['duration']);
}

/** Every pillar is optional on disk; `normalizeChunkResult` fills the gaps (v1 files included). */
function isChunkResultish(v: unknown): boolean {
  if (!isObj(v)) return false;
  const subtitle = v['subtitle'] ?? v['transcript'];
  if (subtitle !== undefined && !Array.isArray(subtitle)) return false;
  const face = v['faceData'] ?? v['scenes'];
  if (face !== undefined && !Array.isArray(face)) return false;
  if (v['voiceData'] !== undefined && !Array.isArray(v['voiceData'])) return false;
  if (v['story'] !== undefined && !isObj(v['story'])) return false;
  if (v['subconsciousness'] !== undefined && !isObj(v['subconsciousness'])) return false;
  return true;
}

/** Strictly validates a parsed .evermind.json payload. Throws with a readable reason. */
export function parseMineFile(raw: unknown): MineFile {
  if (!isObj(raw)) throw new Error("File is not a valid Evermind object.");
  if (raw['format'] !== MINE_FORMAT) throw new Error('Missing or wrong "format" field — not an Evermind mine file.');
  if (!isNum(raw['version']) || raw['version'] > MINE_VERSION) throw new Error("Unsupported Evermind file version.");
  if (!isStr(raw['savedAt'])) throw new Error('Invalid "savedAt" field.');
  if (!isStr(raw['model'])) throw new Error('Invalid "model" field.');

  const source = raw['source'];
  if (!isObj(source) || !isStr(source['name']) || !isNum(source['size'])) throw new Error('Invalid "source" section.');
  if (!(source['duration'] === null || isNum(source['duration']))) throw new Error('Invalid "source.duration".');

  if (!Array.isArray(raw['chunks']) || !raw['chunks'].every(isChunk)) throw new Error('Invalid "chunks" section.');
  if (!Array.isArray(raw['results'])) throw new Error('Invalid "results" section.');
  const results: MineResult[] = [];
  for (const r of raw['results']) {
    if (!isObj(r) || !isNum(r['index']) || !isChunk(r['chunk']) || !isChunkResultish(r['data']))
      throw new Error('Invalid entry in "results".');
    results.push({ index: r['index'], chunk: r['chunk'], data: normalizeChunkResult(r['data']) });
  }
  if (!Array.isArray(raw['log']) || !raw['log'].every(isStr)) throw new Error('Invalid "log" section.');
  if (raw['ownership'] !== undefined && !isObj(raw['ownership'])) throw new Error('Invalid "ownership" section.');

  return {
    ...(raw as unknown as MineFile),
    results,
    ownership: normalizeOwnership(raw['ownership']),
    version: MINE_VERSION,
  };
}

function safeBase(name: string, fallback: string) {
  return (name || fallback).replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || fallback;
}

function downloadJson(data: unknown, filename: string): string {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export function downloadMineFile(mine: MineFile): string {
  return downloadJson(mine, `${safeBase(mine.source.name, "mine")}.evermind.json`);
}

/** Lightweight brain bundle meant to be dropped into an AI agent as system context. */
export type AgentBrain = {
  format: "evermind.agent-brain";
  version: 2;
  createdAt: string;
  mindId: string;
  ownership: {
    creatorName: string;
    creatorEmail: string;
    accessLevel: AccessLevel;
    signature: DigitalSignature;
  };
  monetization: {
    accessLevel: AccessLevel;
    rate: number;
    currency: string;
    unit: RateUnit;
    priceLabel: string;
    listedOnMarketplace: boolean;
    licenseTerms: string;
  };
  persona: {
    source: string;
    videoDuration: number | null;
    segments: number;
    languageNote: string;
  };
  systemPrompt: string;
  narrative: { summary: string[]; tone: string[]; timeline: { timestamp: string; event: string; emotion: string }[] };
  subconsciousness: {
    skills: string[];
    beliefs: string[];
    decisionLogic: string[];
    aestheticProfile: string[];
    expressiveStyle: string[];
    culturalVocabulary: CulturalExpression[];
  };
  audioAtmosphere: {
    genres: string[];
    moods: string[];
    tempos: string[];
    atmosphere: string[];
    audioSkillAssets: string[];
    segments: { start: string; end: string; genre: string; mood: string; tempo: string; instrumentation: string; isOriginalByOwner: boolean; note: string }[];
  };
  voiceCloning: { start: string; end: string; quality: string; note: string; musicPresent?: boolean }[];
  faceCloning: {
    timestamp: string;
    description: string;
    gestures: string;
    lighting: string;
    faceAngle: string;
    cloneQuality: string;
  }[];
  speakers: { label: string; role: string; description: string }[];
  /** Mined emotional states, facial triggers and vocal tone markers over time. */
  emotion_timeline: EmotionMoment[];
  transcript: { timestamp: string; speech: string; speaker: string; role: string }[];
};

export async function buildAgentBrain(input: {
  source: { name: string; duration: number | null };
  results: MineResult[];
  ownership: Ownership;
}): Promise<AgentBrain> {
  const ordered = [...input.results].sort((a, b) => a.index - b.index);
  const uniq = (xs: string[]) => Array.from(new Set(xs.map((s) => s.trim()).filter(Boolean)));
  const own = input.ownership;

  const skills = uniq(ordered.flatMap((r) => r.data.subconsciousness.skills));
  const beliefs = uniq(ordered.flatMap((r) => r.data.subconsciousness.beliefs));
  const decisionLogic = uniq(ordered.flatMap((r) => r.data.subconsciousness.decisionLogic));
  const aestheticProfile = uniq(ordered.flatMap((r) => r.data.subconsciousness.aestheticProfile ?? []));
  const expressiveStyle = uniq(ordered.flatMap((r) => r.data.subconsciousness.expressiveStyle ?? []));
  const culturalMap = new Map<string, CulturalExpression>();
  for (const r of ordered)
    for (const c of r.data.subconsciousness.culturalVocabulary ?? [])
      if (c.phrase && !culturalMap.has(c.phrase.trim())) culturalMap.set(c.phrase.trim(), c);
  const culturalVocabulary = [...culturalMap.values()];
  const audioAtmosphere = {
    genres: uniq(ordered.flatMap((r) => r.data.audio?.genres ?? [])),
    moods: uniq(ordered.flatMap((r) => r.data.audio?.moods ?? [])),
    tempos: uniq(ordered.map((r) => r.data.audio?.tempo ?? "")),
    atmosphere: uniq(ordered.map((r) => r.data.audio?.atmosphere ?? "")),
    audioSkillAssets: uniq(ordered.flatMap((r) => r.data.audio?.audioSkillAssets ?? [])),
    segments: ordered.flatMap((r) => r.data.audio?.segments ?? []),
  };

  const systemPrompt = [
    `You are an AI avatar of the person recorded in "${input.source.name}".`,
    `Speak in their voice, in their own language (Mongolian and English mixed as they mix it). Never invent facts about their life.`,
    `This mind (${own.mindId}) is owned by ${own.creatorName || "its creator"}. Honour the licensing terms shipped with this file.`,
    ``,
    `Only the Primary Owner's speech defines this mind. Other speakers in the transcript are guests or customers — their words are context only, never your beliefs.`,
    ``,
    `SKILLS — what they know how to do:`,
    ...skills.map((s) => `- ${s}`),
    ``,
    `BELIEFS & OPINIONS — what they value, advocate or criticise:`,
    ...beliefs.map((s) => `- ${s}`),
    ``,
    `DECISION LOGIC — how they approach problems and choose:`,
    ...decisionLogic.map((s) => `- ${s}`),
    ``,
    `AESTHETIC PROFILE & MOOD PREFERENCE — the sound, music and atmosphere they gravitate to:`,
    ...aestheticProfile.map((s) => `- ${s}`),
    ...(audioAtmosphere.genres.length ? [`- Preferred genres: ${audioAtmosphere.genres.join(", ")}`] : []),
    ...(audioAtmosphere.moods.length ? [`- Preferred moods: ${audioAtmosphere.moods.join(", ")}`] : []),
    ...(audioAtmosphere.audioSkillAssets.length
      ? [``, `ORIGINAL AUDIO SKILL ASSETS — music they performed or composed themselves:`, ...audioAtmosphere.audioSkillAssets.map((s) => `- ${s}`)]
      : []),
    ...(expressiveStyle.length
      ? [``, `EXPRESSIVE STYLE — how they talk (imitate this):`, ...expressiveStyle.map((s) => `- ${s}`)]
      : []),
    ...(culturalVocabulary.length
      ? [
          ``,
          `CULTURAL VOCABULARY — idioms, proverbs, blessings and sarcasm they use. Reuse these phrases naturally, and always with the intent given, never the literal wording:`,
          ...culturalVocabulary.map(
            (c) => `- "${c.phrase}" (${c.kind}, ${c.intent}, ${c.sentiment}) → means: ${c.meaning}${c.usage ? ` | use when: ${c.usage}` : ""}`,
          ),
          `When a user speaks in idiom, metaphor or sarcasm, read their true intent the same way — never literally.`,
        ]
      : []),
  ].join("\n");

  const persona = {
    source: input.source.name,
    videoDuration: input.source.duration,
    segments: ordered.length,
    languageNote: "Verbatim source language preserved (Mongolian / English mix). Do not translate.",
  };
  const narrative = {
    summary: ordered.map((r) => r.data.story.summary).filter(Boolean),
    tone: uniq(ordered.map((r) => r.data.story.tone)),
    timeline: ordered.flatMap((r) => r.data.story.beats),
  };
  const subconsciousness = { skills, beliefs, decisionLogic, aestheticProfile, expressiveStyle, culturalVocabulary };
  const voiceCloning = ordered.flatMap((r) => r.data.voiceData);
  const faceCloning = ordered.flatMap((r) => r.data.faceData);
  const transcript = ordered.flatMap((r) => r.data.transcript);
  const emotionTimeline = ordered.flatMap((r) => r.data.emotionTimeline ?? []);
  const speakerMap = new Map<string, { label: string; role: string; description: string }>();
  for (const r of ordered) for (const sp of r.data.speakers) if (!speakerMap.has(sp.label)) speakerMap.set(sp.label, sp);
  const speakers = [...speakerMap.values()];

  const signature = await signMind(own, {
    persona,
    systemPrompt,
    narrative,
    subconsciousness,
    audioAtmosphere,
    voiceCloning,
    faceCloning,
    transcript,
  });

  return {
    format: "evermind.agent-brain",
    version: 2,
    createdAt: new Date().toISOString(),
    mindId: own.mindId,
    ownership: {
      creatorName: own.creatorName,
      creatorEmail: own.creatorEmail,
      accessLevel: own.accessLevel,
      signature,
    },
    monetization: {
      accessLevel: own.accessLevel,
      rate: own.rate,
      currency: own.currency,
      unit: own.rateUnit,
      priceLabel: `${own.rate} ${own.currency} / ${own.rateUnit}`,
      listedOnMarketplace: own.accessLevel === "marketplace",
      licenseTerms: own.licenseTerms,
    },
    persona,
    systemPrompt,
    narrative,
    subconsciousness,
    audioAtmosphere,
    voiceCloning,
    faceCloning,
    speakers,
    emotion_timeline: emotionTimeline,
    transcript,
  };
}


export function downloadAgentBrain(brain: AgentBrain, sourceName: string): string {
  return downloadJson(brain, `${safeBase(sourceName, "brain")}.agent-brain.json`);
}

/* ---------------- Native video helpers (Step 1) ----------------
 * Thin wrappers over src/lib/video-extract.ts so uploaded/recorded videos use
 * the one existing cut-and-mine path (/api/native-mine), never a second one.
 */
export type NativeSourceType = "youtube" | "native_upload" | "camera_record";

/** Stable synthetic video id for non-YouTube videos: native_<id>. */
export function nativeVideoId(seed: string): string {
  const clean = seed.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 32);
  if (!clean) throw new Error("A video id needs a seed.");
  return `native_${clean}`;
}

export function videoIdFor(source: NativeSourceType, youtubeId: string | null, seed: string): string {
  return source === "youtube" && youtubeId ? youtubeId : nativeVideoId(seed);
}

/** The [startSec, endSec] window of one chunk, or null past the end. */
export function chunkWindow(durationSec: number, chunkIndex: number, chunkDurationSec = 300) {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || chunkIndex < 0 || chunkDurationSec <= 0) return null;
  const startSec = chunkIndex * chunkDurationSec;
  if (startSec >= durationSec) return null;
  return { index: chunkIndex, startSec, endSec: Math.min(durationSec, startSec + chunkDurationSec), totalChunks: Math.ceil(durationSec / chunkDurationSec) };
}

export type NativeChunkPayload = {
  chunkIndex: number;
  totalChunks: number;
  startSec: number;
  endSec: number;
  keyframes: { timestampSec: number; jpegBase64: string }[];
  audioBase64: string | null;
};

/** Formats an extracted part as a chunk payload (frames sorted, capped at 24). */
export function formatChunkPayload(
  part: { index: number; startSec: number; endSec: number; frames: { t: number; jpeg: string }[]; audioWav: string | null },
  totalChunks: number,
): NativeChunkPayload {
  return {
    chunkIndex: part.index,
    totalChunks,
    startSec: part.startSec,
    endSec: part.endSec,
    keyframes: part.frames
      .filter((f) => f.jpeg && f.t >= part.startSec && f.t <= part.endSec)
      .sort((a, b) => a.t - b.t)
      .slice(0, 24)
      .map((f) => ({ timestampSec: f.t, jpegBase64: f.jpeg })),
    audioBase64: part.audioWav || null,
  };
}

/** Reads length/size and grabs a 640x360 poster at t=1s. Browser only. */
export async function inspectVideoFile(file: File) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true;
  v.preload = "auto";
  v.src = url;
  try {
    await new Promise<void>((r, j) => { v.onloadeddata = () => r(); v.onerror = () => j(new Error("This video file could not be read.")); });
    await new Promise<void>((r) => { v.onseeked = () => r(); v.currentTime = Math.min(1, (v.duration || 1) / 2); });
    const c = document.createElement("canvas");
    c.width = 640; c.height = 360;
    c.getContext("2d")!.drawImage(v, 0, 0, 640, 360);
    const thumbnailDataUrl = c.toDataURL("image/jpeg", 0.7);
    const thumbnailBlob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.7));
    return { durationSeconds: v.duration, width: v.videoWidth, height: v.videoHeight, fileSizeBytes: file.size, thumbnailBlob, thumbnailDataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Builds the payload for one chunk using the shared extractor. Browser only. */
export async function extractNativeVideoChunkPayload(file: File, chunkIndex: number, chunkDurationSec = 300): Promise<NativeChunkPayload> {
  const { extractParts, readDuration, planWindows } = await import("./video-extract");
  const plan = planWindows(await readDuration(file), chunkDurationSec);
  if (!plan[chunkIndex]) throw new Error("That part is past the end of the video.");
  for await (const part of extractParts(file, undefined, [plan[chunkIndex]!], chunkIndex)) return formatChunkPayload(part, plan.length);
  throw new Error("Could not read that part.");
}

/** Uploads into the private creator-videos bucket under the owner's folder. */
export async function uploadNativeVideoToStorage(
  file: File, thumbnailBlob: Blob | null, userId: string, projectId: string, onProgress?: (pct: number) => void,
) {
  const { supabase } = await import("@/integrations/supabase/client");
  const videoId = nativeVideoId(crypto.randomUUID());
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const storagePath = `${userId}/${projectId}/${videoId}.${ext}`;
  onProgress?.(0);
  const up = await supabase.storage.from("creator-videos").upload(storagePath, file, { contentType: file.type || "video/mp4" });
  if (up.error) throw new Error(up.error.message);
  let thumbnailPath: string | null = null;
  if (thumbnailBlob) {
    thumbnailPath = `${userId}/${projectId}/${videoId}-thumb.jpg`;
    const t = await supabase.storage.from("creator-videos").upload(thumbnailPath, thumbnailBlob, { contentType: "image/jpeg" });
    if (t.error) thumbnailPath = null;
  }
  onProgress?.(100);
  return { videoId, storagePath, thumbnailPath };
}
