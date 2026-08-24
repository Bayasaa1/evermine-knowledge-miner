const BASE = "https://generativelanguage.googleapis.com";

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

export function describeError(err: unknown): string {
  if (err instanceof GeminiError) {
    if (err.status === 401 || err.status === 403) return `Invalid or unauthorized API key (${err.status}): ${err.message}`;
    if (err.status === 429) return `Quota / rate limit reached (429): ${err.message}`;
    if (err.status >= 500) return `Gemini service error (${err.status}): ${err.message}`;
    return `Request failed (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function readError(res: Response): Promise<GeminiError> {
  let msg = res.statusText || "Unknown error";
  try {
    const body = await res.json();
    msg = body?.error?.message ?? msg;
  } catch {
    /* ignore */
  }
  return new GeminiError(msg, res.status);
}

export async function validateApiKey(key: string): Promise<string[]> {
  const res = await fetch(`${BASE}/v1beta/models?pageSize=50&key=${encodeURIComponent(key)}`);
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  return (data.models ?? []).map((m: { name: string }) => m.name);
}

export type UploadedFile = { uri: string; mimeType: string; name: string };

/** Uploads a video with the resumable File API and waits until it is ACTIVE. */
export async function uploadVideo(
  key: string,
  file: File,
  opts: { signal?: AbortSignal; onState?: (state: string) => void } = {},
): Promise<UploadedFile> {
  const mimeType = file.type || "video/mp4";
  const startRes = await fetch(`${BASE}/upload/v1beta/files?key=${encodeURIComponent(key)}`, {
    method: "POST",
    signal: opts.signal ?? null,
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: file.name } }),
  });
  if (!startRes.ok) throw await readError(startRes);
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new GeminiError("Upload URL missing from Gemini response", startRes.status);

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    signal: opts.signal ?? null,
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: file,
  });
  if (!uploadRes.ok) throw await readError(uploadRes);
  const uploaded = await uploadRes.json();
  let info = uploaded.file as { uri: string; name: string; state: string; mimeType?: string };

  while (info.state === "PROCESSING") {
    opts.onState?.(info.state);
    await new Promise((r) => setTimeout(r, 3000));
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const pollRes = await fetch(`${BASE}/v1beta/${info.name}?key=${encodeURIComponent(key)}`, { signal: opts.signal ?? null });
    if (!pollRes.ok) throw await readError(pollRes);
    info = await pollRes.json();
  }
  if (info.state !== "ACTIVE") throw new GeminiError(`Video processing failed (state ${info.state})`, 400);
  opts.onState?.(info.state);
  return { uri: info.uri, mimeType: info.mimeType ?? mimeType, name: info.name };
}

export type SpeakerRole = "primary" | "secondary" | "unknown";
export type TranscriptLine = {
  timestamp: string;
  speech: string;
  speaker: string;
  role: SpeakerRole;
};
export type SpeakerProfile = { label: string; role: SpeakerRole; description: string };
export type SceneNote = { timestamp: string; description: string };
export type StoryBeat = { timestamp: string; event: string; emotion: string };
export type Story = { summary: string; tone: string; beats: StoryBeat[] };
export type FaceFrame = {
  timestamp: string;
  description: string;
  gestures: string;
  lighting: string;
  faceAngle: string;
  cloneQuality: string;
  /** True when the moment is a physical action that text cannot capture. */
  isKeyAction: boolean;
  actionType: string;
  /** Suggested clip window for the inline video preview. */
  clipStart: string;
  clipEnd: string;
};
export type VoiceWindow = {
  start: string;
  end: string;
  quality: string;
  note: string;
};
export type Subconsciousness = {
  skills: string[];
  beliefs: string[];
  decisionLogic: string[];
};
export type ChunkResult = {
  speakers: SpeakerProfile[];
  transcript: TranscriptLine[];
  scenes: SceneNote[];
  knowledge: string[];
  story: Story;
  faceData: FaceFrame[];
  voiceData: VoiceWindow[];
  subconsciousness: Subconsciousness;
};

const strArr = { type: "array", items: { type: "string" } };

const responseSchema = {
  type: "object",
  properties: {
    speakers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          role: { type: "string", enum: ["primary", "secondary", "unknown"] },
          description: { type: "string" },
        },
        required: ["label", "role", "description"],
      },
    },
    subtitle: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          speech: { type: "string" },
          speaker: { type: "string" },
          role: { type: "string", enum: ["primary", "secondary", "unknown"] },
        },
        required: ["timestamp", "speech", "speaker", "role"],
      },
    },
    story: {
      type: "object",
      properties: {
        summary: { type: "string" },
        tone: { type: "string" },
        beats: {
          type: "array",
          items: {
            type: "object",
            properties: {
              timestamp: { type: "string" },
              event: { type: "string" },
              emotion: { type: "string" },
            },
            required: ["timestamp", "event", "emotion"],
          },
        },
      },
      required: ["summary", "tone", "beats"],
    },
    faceData: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          description: { type: "string" },
          gestures: { type: "string" },
          lighting: { type: "string" },
          faceAngle: { type: "string" },
          cloneQuality: { type: "string" },
          isKeyAction: { type: "boolean" },
          actionType: { type: "string" },
          clipStart: { type: "string" },
          clipEnd: { type: "string" },
        },
        required: [
          "timestamp",
          "description",
          "gestures",
          "lighting",
          "faceAngle",
          "cloneQuality",
          "isKeyAction",
          "actionType",
          "clipStart",
          "clipEnd",
        ],
      },
    },
    voiceData: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: { type: "string" },
          end: { type: "string" },
          quality: { type: "string" },
          note: { type: "string" },
        },
        required: ["start", "end", "quality", "note"],
      },
    },
    subconsciousness: {
      type: "object",
      properties: {
        skills: strArr,
        beliefs: strArr,
        decisionLogic: strArr,
      },
      required: ["skills", "beliefs", "decisionLogic"],
    },
  },
  required: ["speakers", "subtitle", "story", "faceData", "voiceData", "subconsciousness"],
};

const PROMPT = `You are building an AI Avatar ("digital twin") of the speaker from one segment of a personal-archive video.
Extract FIVE pillars and return JSON only.

0. "speakers": perform SPEAKER DIARIZATION. List every distinct voice as "Speaker A", "Speaker B", ... with a "role" of "primary" for the Primary Owner (the creator whose mind is being cloned — usually the person who speaks the most, teaches, explains, answers, or owns the camera/space), "secondary" for customers, interviewers, guests or bystanders, and "unknown" when unclear. "description" says briefly why.
1. "subtitle": the EXACT VERBATIM transcript of everything spoken, split into short lines, each with a "timestamp" in MM:SS or HH:MM:SS relative to the START OF THE WHOLE VIDEO, plus the "speaker" label and its "role". NEVER translate or paraphrase. Preserve the original mix of Mongolian (Cyrillic) and English word for word, including filler words.
2. "story": the narrative. "summary" = chronological account of what happens and what the person experiences in this segment; "tone" = the dominant emotional tone; "beats" = ordered events with timestamp, the event, and the emotion felt.
3. "faceData": for video cloning AND visual action capture. Each entry describes one clear keyframe: what is seen, "gestures" (body/hand/head movement), "lighting" (quality and direction), "faceAngle" (e.g. frontal, 3/4 left, profile, looking down), and "cloneQuality" (excellent / good / poor + why).
   Additionally tag HIGH-PRECISION PHYSICAL ACTIONS that text cannot fully capture (dance moves, speed and rhythm of motion, cooking technique, hand gestures, tool use, hardware assembly, sport form): set "isKeyAction" to true, name the movement in "actionType", and give a tight clip window "clipStart"/"clipEnd" (whole-video-relative timestamps, 2-8 seconds long) so the user can replay the movement. For ordinary talking-head frames set "isKeyAction" to false, "actionType" to "" and leave clipStart/clipEnd equal to the timestamp.
4. "voiceData": time windows with the CLEANEST audio for voice cloning — single speaker, no music, no overlapping noise. Give "start" and "end" timestamps (whole-video relative), "quality" (excellent / good / usable) and a short "note". Prefer continuous windows of 15 seconds or more.
5. "subconsciousness": the PRIMARY OWNER's core brain, for downstream AI agents to query.
   CRITICAL RULE: extract skills, beliefs and decision logic ONLY from speech spoken by the Primary Owner. Secondary speakers' words may be used only as context (the question or prompt that explains the owner's answer) and must NEVER be attributed to the core brain. If the Primary Owner never states something, do not include it.
   Three arrays of short standalone statements written in the speaker's original language:
   - "skills": what they know how to do.
   - "beliefs": what they value, advocate for, or criticise.
   - "decisionLogic": how they approach problems and make choices (if/then reasoning, priorities, rules of thumb).

Only cover the requested time range. Output JSON only.`;

/** Fills missing pillars so older files and partial model output stay usable. */
export function normalizeChunkResult(raw: unknown): ChunkResult {
  const v = (raw ?? {}) as Record<string, unknown>;
  const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  const strings = (x: unknown): string[] => arr<unknown>(x).filter((s): s is string => typeof s === "string");
  const role = (x: unknown): SpeakerRole =>
    x === "primary" || x === "secondary" ? x : "unknown";
  const speakers = arr<Record<string, unknown>>(v['speakers']).map((sp) => ({
    label: String(sp?.['label'] ?? "Speaker"),
    role: role(sp?.['role']),
    description: String(sp?.['description'] ?? ""),
  }));
  const transcript = arr<Record<string, unknown>>(v['subtitle'] ?? v['transcript']).map((l) => ({
    timestamp: String(l?.['timestamp'] ?? ""),
    speech: String(l?.['speech'] ?? ""),
    speaker: String(l?.['speaker'] ?? ""),
    role: role(l?.['role']),
  }));
  const faceData = arr<FaceFrame>(v['faceData'] ?? v['scenes']).map((f) => ({
    timestamp: String(f?.timestamp ?? ""),
    description: String(f?.description ?? ""),
    gestures: String(f?.gestures ?? ""),
    lighting: String(f?.lighting ?? ""),
    faceAngle: String(f?.faceAngle ?? ""),
    cloneQuality: String(f?.cloneQuality ?? ""),
    isKeyAction: f?.isKeyAction === true,
    actionType: String(f?.actionType ?? ""),
    clipStart: String(f?.clipStart ?? f?.timestamp ?? ""),
    clipEnd: String(f?.clipEnd ?? f?.timestamp ?? ""),
  }));
  const s = (v['story'] ?? {}) as Record<string, unknown>;
  const sc = (v['subconsciousness'] ?? {}) as Record<string, unknown>;
  const subconsciousness: Subconsciousness = {
    skills: strings(sc['skills']),
    beliefs: strings(sc['beliefs']),
    decisionLogic: strings(sc['decisionLogic']),
  };
  const knowledge = strings(v['knowledge']);
  return {
    speakers,
    transcript,
    scenes: faceData.map((f) => ({ timestamp: f.timestamp, description: f.description })),
    knowledge:
      knowledge.length > 0
        ? knowledge
        : [...subconsciousness.skills, ...subconsciousness.beliefs, ...subconsciousness.decisionLogic],
    story: {
      summary: typeof s['summary'] === "string" ? s['summary'] : "",
      tone: typeof s['tone'] === "string" ? s['tone'] : "",
      beats: arr<StoryBeat>(s['beats']).map((b) => ({
        timestamp: String(b?.timestamp ?? ""),
        event: String(b?.event ?? ""),
        emotion: String(b?.emotion ?? ""),
      })),
    },
    faceData,
    voiceData: arr<VoiceWindow>(v['voiceData']).map((w) => ({
      start: String(w?.start ?? ""),
      end: String(w?.end ?? ""),
      quality: String(w?.quality ?? ""),
      note: String(w?.note ?? ""),
    })),
    subconsciousness,
  };
}

export async function mineChunk(
  key: string,
  model: string,
  fileRef: UploadedFile,
  startSec: number,
  endSec: number,
  signal?: AbortSignal,
): Promise<ChunkResult> {
  const res = await fetch(
    `${BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      signal: signal ?? null,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: { fileUri: fileRef.uri, mimeType: fileRef.mimeType },
                videoMetadata: {
                  startOffset: `${Math.floor(startSec)}s`,
                  endOffset: `${Math.ceil(endSec)}s`,
                },
              },
              {
                text: `${PROMPT}\n\nTime range for this segment: ${Math.floor(startSec)}s to ${Math.ceil(endSec)}s of the video.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    },
  );
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new GeminiError("Gemini returned an empty response for this piece", 500);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError("Could not parse JSON returned by Gemini", 500);
  }
  return normalizeChunkResult(parsed);
}


export async function deleteFile(key: string, name: string): Promise<void> {
  try {
    await fetch(`${BASE}/v1beta/${name}?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}
