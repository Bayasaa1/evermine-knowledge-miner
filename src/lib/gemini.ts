import { getGeminiAccessToken } from "./google-gemini-auth";
import type { Lang } from "./i18n";

const BASE = "https://generativelanguage.googleapis.com";

/**
 * Authed Gemini request: when the creator signed in with Google, their OAuth
 * access token authorizes the call (Bearer header — zero API keys). Otherwise
 * it falls back to the classic `?key=` API-key parameter.
 */
async function geminiRequest(url: string, key: string, init: RequestInit = {}): Promise<Response> {
  const token = await getGeminiAccessToken();
  const headers = new Headers(init.headers);
  let finalUrl = url;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    finalUrl = `${url}${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
  }
  return fetch(finalUrl, { ...init, headers });
}

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

/**
 * True when Google's AI safety filters blocked the content rather than the
 * request failing technically. Retrying the same video will not help.
 */
export function isSafetyBlocked(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /SAFETY_BLOCKED|safety|blocked|prohibited content|harm_category/i.test(msg);
}

/** Friendly, non-technical explanation for a safety-blocked analysis. */
export function safetyMessage(lang: Lang = "en"): string {
  if (lang === "mn")
    return "Google-ийн AI аюулгүй байдлын шүүлтүүр энэ видеог шинжлэхийг зогсоолоо. Хүчирхийлэл, насанд хүрэгчдийн болон эмзэг агуулгагүй хэсгийг сонгож дахин оролдоно уу.";
  if (lang === "ko")
    return "Google AI 안전 필터가 이 영상의 분석을 중단했습니다. 민감하거나 성인·폭력적인 장면을 잘라내고 다른 구간으로 다시 시도해 주세요 — 같은 영상은 다시 시도해도 통과되지 않습니다.";
  return "Google's AI safety filters stopped the analysis of this video. Try a different clip or trim out sensitive, adult or violent moments — retrying the same footage won't help.";
}

export function describeError(err: unknown): string {
  if (isSafetyBlocked(err)) return safetyMessage("en");
  if (err instanceof GeminiError) {
    if (err.status === 400) return `Invalid argument (400): ${err.message}`;
    if (err.status === 401 || err.status === 403) return `Invalid or unauthorized API key (${err.status}): ${err.message}`;
    if (err.status === 404)
      return `File not found (404) — the uploaded video expired on Google's servers (files live 48h). Re-upload and mine again: ${err.message}`;
    if (err.status === 408)
      return `PROCESSING_PENDING (408): Google is still processing this video and did not become ACTIVE in time. Try a shorter or smaller clip: ${err.message}`;
    if (err.status === 413)
      return `Payload Too Large (413): the video exceeds Google's upload limit. Compress it or split it into smaller files: ${err.message}`;
    if (err.status === 415) return `Unsupported video format (415): ${err.message}`;
    if (err.status === 429) return `Quota / rate limit reached (429): ${err.message}`;
    if (err.status >= 500) return `Gemini service error (${err.status}): ${err.message}`;
    return `Request failed (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** True for 429 rate-limit / quota-exhausted responses, which key rotation can retry. */
export function isQuotaError(err: unknown): boolean {
  return err instanceof GeminiError && (err.status === 429 || /quota|exhaust|rate limit/i.test(err.message));
}

/** True when the key itself is rejected — rotating to another key is worth trying. */
export function isKeyRejected(err: unknown): boolean {
  return err instanceof GeminiError && (err.status === 401 || err.status === 403);
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
  const res = await geminiRequest(`${BASE}/v1/models?pageSize=50`, key);
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  return (data.models ?? []).map((m: { name: string }) => m.name);
}

export type UploadedFile = { uri: string; mimeType: string; name: string };

/** Video MIME types Gemini accepts through the File API. */
export const SUPPORTED_VIDEO_MIME = [
  "video/mp4",
  "video/mpeg",
  "video/mov",
  "video/quicktime",
  "video/avi",
  "video/x-flv",
  "video/mpg",
  "video/webm",
  "video/wmv",
  "video/3gpp",
] as const;

const EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
  mpeg: "video/mpeg",
  mpg: "video/mpg",
  avi: "video/avi",
  flv: "video/x-flv",
  wmv: "video/wmv",
  "3gp": "video/3gpp",
};

/**
 * Resolves an explicit, Gemini-supported video MIME type for a file. Browsers
 * often report an empty or generic type, which makes the File API reject the
 * upload with a 400, so we fall back to the file extension.
 */
export function resolveVideoMime(file: File): string {
  const declared = (file.type || "").toLowerCase();
  if ((SUPPORTED_VIDEO_MIME as readonly string[]).includes(declared)) return declared;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const guessed = EXT_MIME[ext];
  if (guessed) return guessed;
  throw new GeminiError(
    `Unsupported video type "${declared || ext || "unknown"}". Supported formats: ${SUPPORTED_VIDEO_MIME.join(", ")}.`,
    415,
  );
}

/** Hard cap for how long we wait on Google's PROCESSING state before giving up. */
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000;

/** Uploads a video with the resumable File API and waits until it is ACTIVE. */
export async function uploadVideo(
  key: string,
  file: File,
  opts: { signal?: AbortSignal; onState?: (state: string) => void } = {},
): Promise<UploadedFile> {
  const mimeType = resolveVideoMime(file);
  const startRes = await geminiRequest(`${BASE}/upload/v1beta/files`, key, {
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
  let info = uploaded.file as {
    uri: string;
    name: string;
    state: string;
    mimeType?: string;
    error?: { message?: string };
  };

  const deadline = Date.now() + PROCESSING_TIMEOUT_MS;
  while (info.state === "PROCESSING") {
    opts.onState?.(info.state);
    if (Date.now() > deadline) {
      throw new GeminiError(
        `PROCESSING_PENDING — Google is still processing "${file.name}" after ${Math.round(
          PROCESSING_TIMEOUT_MS / 60000,
        )} minutes and never reached ACTIVE.`,
        408,
      );
    }
    await new Promise((r) => setTimeout(r, 3000));
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const pollRes = await geminiRequest(`${BASE}/v1beta/${info.name}`, key, { signal: opts.signal ?? null });
    if (!pollRes.ok) throw await readError(pollRes);
    info = await pollRes.json();
  }
  if (info.state !== "ACTIVE") {
    throw new GeminiError(
      `Video processing failed (state ${info.state}${info.error?.message ? `: ${info.error.message}` : ""}). The file may be corrupt or in an unsupported codec.`,
      400,
    );
  }
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
  /** True when background music or other non-speech audio overlaps this window. */
  musicPresent: boolean;
};
export type MusicSegment = {
  start: string;
  end: string;
  genre: string;
  mood: string;
  tempo: string;
  instrumentation: string;
  /** True when the Primary Owner performed/composed the music themselves. */
  isOriginalByOwner: boolean;
  note: string;
};
export type AudioProfile = {
  hasMusic: boolean;
  atmosphere: string;
  genres: string[];
  moods: string[];
  tempo: string;
  segments: MusicSegment[];
  /** Original musical performance, composition or custom audio theme by the owner. */
  audioSkillAssets: string[];
};
export type CulturalExpression = {
  /** The phrase exactly as spoken. */
  phrase: string;
  timestamp: string;
  /** proverb | blessing | idiom | metaphor | sarcasm | teasing | praise | slang */
  kind: string;
  /** What the words say if read literally (never the real meaning). */
  literal: string;
  /** The true cultural intent behind the phrase. */
  meaning: string;
  /** genuine-praise | friendly-teasing | blessing | sarcasm | criticism | neutral */
  intent: string;
  /** positive | negative | mixed | neutral */
  sentiment: string;
  /** When and how the owner uses it, so the avatar can reuse it correctly. */
  usage: string;
};
export type Subconsciousness = {
  skills: string[];
  beliefs: string[];
  decisionLogic: string[];
  /** Idioms, proverbs, blessings, metaphors and sarcasm decoded to true intent. */
  culturalVocabulary: CulturalExpression[];
  /** How the owner speaks: humour, directness, formality, rhetorical habits. */
  expressiveStyle: string[];
  /** Aesthetic taste and mood preference inferred from the owner's audio choices. */
  aestheticProfile: string[];
};
export type SpatialAction = {
  object_name: string;
  /** Normalized 3D coordinates in camera space [x, y, z]. */
  coordinates_xyz: [number, number, number];
  /** e.g. power-grasp, pinch, push, none. */
  grasp_type: string;
  /** Normalized direction vector of the motion [dx, dy, dz]. */
  movement_vector: [number, number, number];
};

/** Strict, high-confidence knowledge node mined from the video. */
export type KnowledgeNode = {
  timestamp_start: string;
  timestamp_end: string;
  concept_title: string;
  detailed_explanation: string;
  spatial_action: SpatialAction | null;
  /** 0.0 - 1.0. Nodes below MIN_NODE_CONFIDENCE are discarded as hallucinations. */
  confidence_score: number;
};

/** Anything the model is less sure about than this is dropped. */
export const MIN_NODE_CONFIDENCE = 0.8;

/** Copyright & authenticity audit performed on every mined segment. */
export type CopyrightSignal = {
  timestamp: string;
  /** watermark | logo | broadcast-overlay | screen-recording | third-party-music | other-creator-face */
  kind: string;
  detail: string;
  /** 0.0 - 1.0 certainty that this segment is not the creator's own footage. */
  confidence: number;
};

export type CopyrightAudit = {
  /** true when the segment looks re-uploaded, watermarked or otherwise not original. */
  flagged: boolean;
  /** "original" | "uncertain" | "third-party" */
  originality: string;
  signals: CopyrightSignal[];
  summary: string;
};

/** Canonical emotional states mined from a video segment. */
export const PRIMARY_EMOTIONS = [
  "HAPPY",
  "EXCITED",
  "SERIOUS",
  "SAD",
  "EMPATHETIC",
  "NEUTRAL",
] as const;
export type PrimaryEmotion = (typeof PRIMARY_EMOTIONS)[number];

/** One entry of the mined emotion timeline. */
export type EmotionMoment = {
  timestamp_start: string;
  timestamp_end: string;
  primary_emotion: PrimaryEmotion;
  /** 0.0 - 1.0 strength of the visible/audible expression. */
  expression_intensity: number;
  /** e.g. Smile, Frown, Nod, Eyebrow_Raise. */
  facial_trigger: string;
  /** e.g. High_Pitch, Low_Calm, Passionate. */
  vocal_tone_marker: string;
  /** Short reason the emotion was assigned (speech or visual evidence). */
  evidence: string;
};

export type ChunkResult = {
  speakers: SpeakerProfile[];
  transcript: TranscriptLine[];
  scenes: SceneNote[];
  knowledge: string[];
  story: Story;
  faceData: FaceFrame[];
  voiceData: VoiceWindow[];
  audio: AudioProfile;
  subconsciousness: Subconsciousness;
  /** Precise, confidence-filtered knowledge/action graph nodes. */
  knowledgeNodes: KnowledgeNode[];
  /** Timeline of emotional states, facial triggers and vocal tone markers. */
  emotionTimeline: EmotionMoment[];
  /** Copyright & authenticity check for this segment. */
  copyright: CopyrightAudit;
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
          musicPresent: { type: "boolean" },
        },
        required: ["start", "end", "quality", "note", "musicPresent"],
      },
    },
    audio: {
      type: "object",
      properties: {
        hasMusic: { type: "boolean" },
        atmosphere: { type: "string" },
        genres: strArr,
        moods: strArr,
        tempo: { type: "string" },
        segments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              start: { type: "string" },
              end: { type: "string" },
              genre: { type: "string" },
              mood: { type: "string" },
              tempo: { type: "string" },
              instrumentation: { type: "string" },
              isOriginalByOwner: { type: "boolean" },
              note: { type: "string" },
            },
            required: [
              "start",
              "end",
              "genre",
              "mood",
              "tempo",
              "instrumentation",
              "isOriginalByOwner",
              "note",
            ],
          },
        },
        audioSkillAssets: strArr,
      },
      required: ["hasMusic", "atmosphere", "genres", "moods", "tempo", "segments", "audioSkillAssets"],
    },
    subconsciousness: {
      type: "object",
      properties: {
        skills: strArr,
        beliefs: strArr,
        decisionLogic: strArr,
        aestheticProfile: strArr,
        expressiveStyle: strArr,
        culturalVocabulary: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phrase: { type: "string" },
              timestamp: { type: "string" },
              kind: {
                type: "string",
                enum: ["proverb", "blessing", "idiom", "metaphor", "sarcasm", "teasing", "praise", "slang"],
              },
              literal: { type: "string" },
              meaning: { type: "string" },
              intent: {
                type: "string",
                enum: ["genuine-praise", "friendly-teasing", "blessing", "sarcasm", "criticism", "neutral"],
              },
              sentiment: { type: "string", enum: ["positive", "negative", "mixed", "neutral"] },
              usage: { type: "string" },
            },
            required: ["phrase", "timestamp", "kind", "literal", "meaning", "intent", "sentiment", "usage"],
          },
        },
      },
      required: [
        "skills",
        "beliefs",
        "decisionLogic",
        "aestheticProfile",
        "expressiveStyle",
        "culturalVocabulary",
      ],
    },
    knowledgeNodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp_start: { type: "string" },
          timestamp_end: { type: "string" },
          concept_title: { type: "string" },
          detailed_explanation: { type: "string" },
          spatial_action: {
            type: "object",
            properties: {
              object_name: { type: "string" },
              coordinates_xyz: { type: "array", items: { type: "number" } },
              grasp_type: { type: "string" },
              movement_vector: { type: "array", items: { type: "number" } },
            },
            required: ["object_name", "coordinates_xyz", "grasp_type", "movement_vector"],
          },
          confidence_score: { type: "number" },
        },
        required: [
          "timestamp_start",
          "timestamp_end",
          "concept_title",
          "detailed_explanation",
          "spatial_action",
          "confidence_score",
        ],
      },
    },
    emotion_timeline: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp_start: { type: "string" },
          timestamp_end: { type: "string" },
          primary_emotion: {
            type: "string",
            enum: ["HAPPY", "EXCITED", "SERIOUS", "SAD", "EMPATHETIC", "NEUTRAL"],
          },
          expression_intensity: { type: "number" },
          facial_trigger: { type: "string" },
          vocal_tone_marker: { type: "string" },
          evidence: { type: "string" },
        },
        required: [
          "timestamp_start",
          "timestamp_end",
          "primary_emotion",
          "expression_intensity",
          "facial_trigger",
          "vocal_tone_marker",
          "evidence",
        ],
      },
    },
    copyright: {
      type: "object",
      properties: {
        flagged: { type: "boolean" },
        originality: { type: "string", enum: ["original", "uncertain", "third-party"] },
        summary: { type: "string" },
        signals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              timestamp: { type: "string" },
              kind: {
                type: "string",
                enum: [
                  "watermark",
                  "logo",
                  "broadcast-overlay",
                  "screen-recording",
                  "third-party-music",
                  "other-creator-face",
                  "other",
                ],
              },
              detail: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["timestamp", "kind", "detail", "confidence"],
          },
        },
      },
      required: ["flagged", "originality", "summary", "signals"],
    },
  },

  required: [
    "speakers",
    "subtitle",
    "story",
    "faceData",
    "voiceData",
    "audio",
    "subconsciousness",
    "knowledgeNodes",
    "emotion_timeline",
    "copyright",


  ],

};
const PROMPT = `You are building an AI Avatar ("digital twin") of the speaker from one segment of a personal-archive video.
Extract the pillars below and return JSON only.

0. "speakers": perform SPEAKER DIARIZATION. List every distinct voice as "Speaker A", "Speaker B", ... with a "role" of "primary" for the Primary Owner (the creator whose mind is being cloned — usually the person who speaks the most, teaches, explains, answers, or owns the camera/space), "secondary" for customers, interviewers, guests or bystanders, and "unknown" when unclear. "description" says briefly why.
1. "subtitle": the EXACT VERBATIM transcript of everything spoken, split into short lines, each with a "timestamp" in MM:SS or HH:MM:SS relative to the START OF THE WHOLE VIDEO, plus the "speaker" label and its "role". NEVER translate or paraphrase. Preserve the original mix of Mongolian (Cyrillic) and English word for word, including filler words.
2. "story": the narrative. "summary" = chronological account of what happens and what the person experiences in this segment; "tone" = the dominant emotional tone; "beats" = ordered events with timestamp, the event, and the emotion felt.
3. "faceData": for video cloning AND visual action capture. Each entry describes one clear keyframe: what is seen, "gestures" (body/hand/head movement), "lighting" (quality and direction), "faceAngle" (e.g. frontal, 3/4 left, profile, looking down), and "cloneQuality" (excellent / good / poor + why).
   Additionally tag HIGH-PRECISION PHYSICAL ACTIONS that text cannot fully capture (dance moves, speed and rhythm of motion, cooking technique, hand gestures, tool use, hardware assembly, sport form): set "isKeyAction" to true, name the movement in "actionType", and give a tight clip window "clipStart"/"clipEnd" (whole-video-relative timestamps, 2-8 seconds long) so the user can replay the movement. For ordinary talking-head frames set "isKeyAction" to false, "actionType" to "" and leave clipStart/clipEnd equal to the timestamp.
4. "voiceData": time windows with the CLEANEST audio for voice cloning — single speaker, NO background music, no overlapping noise. Give "start" and "end" (whole-video relative), "quality" (excellent / good / usable), a short "note", and "musicPresent" (true when music or other non-speech audio bleeds into the window). Prefer continuous windows of 15 seconds or more and rank music-free windows highest, so the 60-second cloning sample stays 100% clean speech.
5. "subconsciousness": the PRIMARY OWNER\'s core brain, for downstream AI agents to query.
   CRITICAL RULE: extract skills, beliefs and decision logic ONLY from speech spoken by the Primary Owner. Secondary speakers\' words may be used only as context (the question or prompt that explains the owner\'s answer) and must NEVER be attributed to the core brain. If the Primary Owner never states something, do not include it.
   Arrays of short standalone statements written in the speaker\'s original language:
   - "skills": what they know how to do.
   - "beliefs": what they value, advocate for, or criticise.
   - "decisionLogic": how they approach problems and make choices (if/then reasoning, priorities, rules of thumb).
   - "aestheticProfile": the owner's AESTHETIC TASTE AND MOOD PREFERENCE, derived from the audio and music atmosphere of "audio" (chosen genres, moods, tempo, instrumentation, and how they talk about music/sound) combined with their visual styling. Short statements such as "Prefers calm acoustic backdrops while teaching". Only include preferences that plausibly belong to the Primary Owner.
   - "expressiveStyle": how the Primary Owner SPEAKS — humour, directness, formality, honorifics, rhetorical habits, how they praise, tease, bless, scold or joke. Short statements the avatar can imitate.
   - "culturalVocabulary": CULTURAL METAPHOR, IDIOM & SARCASM PARSING. Scan every line of the Primary Owner\'s speech for traditional proverbs (\u0437\u04af\u0439\u0440 \u04af\u0433), blessings (\u0431\u044d\u043b\u044d\u0433 \u0434\u044d\u043c\u0431\u044d\u0440\u044d\u043b / \u044e\u0440\u04e9\u04e9\u043b), local idioms, poetic metaphors, satire, irony, teasing and slang.
     NEVER take an idiom, blessing or sarcastic remark at literal value. For each entry give the "phrase" verbatim, its "timestamp", the "kind", the "literal" surface reading, the "meaning" (its true cultural intent in plain words), the "intent", the "sentiment", and a short "usage" note on when the owner says it.
     Example: "\u0430\u044f\u0433\u0430 \u043d\u044c \u0445\u0430\u0433\u0430\u0440\u0445\u0430\u0439, \u0443\u0443\u0440\u0433\u0430 \u043d\u044c \u0445\u0443\u0433\u0430\u0440\u0445\u0430\u0439" is literally "may his bowl be cracked and his lasso pole broken" but is a traditional blessing wishing abundance so great it breaks the vessels \u2014 intent "blessing", sentiment "positive", NOT a curse.
     Judge intent from tone of voice, laughter, rhythm and surrounding context: separate genuine praise from friendly teasing, ritual blessing and cutting sarcasm. When a phrase is sarcastic, "meaning" must state what the owner ACTUALLY means, not the words.
     Use these decoded meanings when writing "beliefs" and "decisionLogic" \u2014 record the real intent, never the literal wording.

6. "audio": MUSIC & AUDIO ATMOSPHERE PROFILING of the audio layer.
   - "hasMusic": whether any background music or musical performance is audible.
   - "genres", "moods" (e.g. Chill, Intense, Acoustic, Melancholic, Uplifting), "tempo" (e.g. "slow ~70 BPM", "upbeat ~120 BPM") and "atmosphere" = one sentence describing the overall sonic feel of the segment (room tone, ambience, noise, music balance).
   - "segments": each distinct music or notable non-speech audio passage with whole-video-relative "start"/"end", "genre", "mood", "tempo", "instrumentation", a short "note", and "isOriginalByOwner" set to true ONLY when the Primary Owner is performing, singing, playing, composing or using their own custom audio theme.
   - "audioSkillAssets": short descriptions of ORIGINAL musical performance, composition or custom audio themes created by the Primary Owner (instrument, style, skill level, timestamp). Leave empty if there are none.

6. "knowledgeNodes": a STRICT, PRECISE knowledge + action graph. One node per distinct concept, technique or physical action actually shown. Each node needs:
   - "timestamp_start" / "timestamp_end": whole-video-relative MM:SS.
   - "concept_title": a short name for what is taught or done.
   - "detailed_explanation": a precise, self-contained explanation grounded ONLY in what the video shows or says.
   - "spatial_action": when a physical object is manipulated, give "object_name", "coordinates_xyz" (3 numbers, normalized 0..1 in camera space: x right, y down, z depth), "grasp_type" (power-grasp, pinch, push, pull, pour, cut, none) and "movement_vector" (3 numbers, normalized direction of motion, -1..1). If no object is manipulated, set spatial_action to null.
   - "confidence_score": 0.0-1.0, your honest certainty this node is correct. NEVER inflate it. Use below 0.8 whenever you are guessing or inferring — such nodes are discarded.

7. "emotion_timeline": a continuous EMOTION & EXPRESSION TIMELINE of the Primary Owner. Segment the requested range into consecutive moments (roughly 3-15 seconds each, or wherever the emotion clearly shifts) and for every moment give:
   - "timestamp_start" / "timestamp_end": whole-video-relative MM:SS.
   - "primary_emotion": exactly one of HAPPY, EXCITED, SERIOUS, SAD, EMPATHETIC, NEUTRAL.
   - "expression_intensity": 0.0-1.0 float for how strongly the emotion is expressed.
   - "facial_trigger": the dominant visible facial/head cue, e.g. Smile, Frown, Nod, Eyebrow_Raise, Wide_Eyes, Head_Shake, Neutral_Face.
   - "vocal_tone_marker": the dominant vocal quality, e.g. High_Pitch, Low_Calm, Passionate, Soft_Warm, Flat_Even, Laughing.
   - "evidence": one short phrase citing what you saw or heard. Judge from face, voice and words together; use NEUTRAL with low intensity rather than guessing.

8. "copyright": COPYRIGHT & AUTHENTICITY CHECK. Judge whether this footage is the uploader's OWN original recording.
   Look for: visible watermarks or usernames burned into the frame (TikTok, Douyin, YouTube, Instagram, Kuaishou, stock-footage marks), broadcaster or studio logos and lower-thirds, on-screen UI of another app (a screen recording or re-upload), letterboxing/cropping typical of re-uploaded clips, film/TV/anime footage, and commercially released background music.
   - "signals": one entry per piece of evidence with its "timestamp", "kind", a precise "detail" (e.g. "@user123 watermark bottom-right"), and an honest "confidence" 0.0-1.0.
   - "originality": "original" when nothing suggests third-party content, "uncertain" when evidence is weak, "third-party" when the segment is clearly someone else's footage.
   - "flagged": true whenever originality is "third-party" or any signal has confidence 0.7 or higher. Flagged segments block publishing until the creator confirms ownership.
   - "summary": one plain sentence explaining the verdict. Never guess — say so in the summary and keep confidence low instead.

Only cover the requested time range. Output JSON only.`;



/** Category-strict mining directives selected in the "+" Create hub. */
export type MiningCategory = "knowledge" | "robot" | "voice" | "sales";

export function categoryDirective(category: MiningCategory | undefined): string {
  if (category === "robot") {
    return `\n\nCATEGORY: ROBOT BRAIN / EMBODIED VLA — STRICT SPATIAL MODE.
"knowledgeNodes" is the primary output of this run. Emit one node for EVERY distinct physical manipulation, and always fill "spatial_action" with object_name, coordinates_xyz (3 normalized numbers, camera space), grasp_type and movement_vector (3 normalized numbers). Timestamps must be tight (under 8 seconds per node). Give an honest "confidence_score"; anything you infer rather than see must stay below 0.8 so it is discarded. Prefer fewer, exact nodes over many approximate ones.`;
  }
  if (category === "sales") {
    return `\n\nCATEGORY: PRODUCT & SERVICE SALES MIND — COMMERCIAL MODE.
Extract every product or service claim as a "knowledgeNodes" entry: exact name, offer, price/promotion if spoken, differentiators and objection handling, so an automated sales agent can pitch and answer buyer questions. Capture persuasion style and promises in "subconsciousness". Never invent prices or guarantees — if it is not stated, keep "confidence_score" below 0.8.`;
  }
  if (category === "voice") {
    return `\n\nCATEGORY: VOICE CALLING AGENT — SPEECH-FIRST MODE.
Prioritise "voiceData" (long, music-free, single-speaker windows), verbatim "subtitle" lines with speaker roles, and "subconsciousness.expressiveStyle" so the cloned voice can hold a real-time conversation. Spatial actions are optional here.`;
  }
  return `\n\nCATEGORY: AI ASSISTANT / KNOWLEDGE MIND — Q&A MODE.
Prioritise a clean knowledge graph: every "knowledgeNodes" entry must be a self-contained question-answerable concept with a precise explanation the clone can be asked about later, plus rich "subconsciousness" skills, beliefs and decision logic. Set "spatial_action" to null unless a physical object is genuinely manipulated.`;
}

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
    aestheticProfile: strings(sc['aestheticProfile']),
    expressiveStyle: strings(sc['expressiveStyle']),
    culturalVocabulary: arr<Record<string, unknown>>(sc['culturalVocabulary']).map((c) => ({
      phrase: String(c?.['phrase'] ?? ""),
      timestamp: String(c?.['timestamp'] ?? ""),
      kind: String(c?.['kind'] ?? "idiom"),
      literal: String(c?.['literal'] ?? ""),
      meaning: String(c?.['meaning'] ?? ""),
      intent: String(c?.['intent'] ?? "neutral"),
      sentiment: String(c?.['sentiment'] ?? "neutral"),
      usage: String(c?.['usage'] ?? ""),
    })).filter((c) => c.phrase),
  };
  const au = (v['audio'] ?? {}) as Record<string, unknown>;
  const audio: AudioProfile = {
    hasMusic: au['hasMusic'] === true,
    atmosphere: typeof au['atmosphere'] === "string" ? au['atmosphere'] : "",
    genres: strings(au['genres']),
    moods: strings(au['moods']),
    tempo: typeof au['tempo'] === "string" ? au['tempo'] : "",
    segments: arr<Record<string, unknown>>(au['segments']).map((m) => ({
      start: String(m?.['start'] ?? ""),
      end: String(m?.['end'] ?? ""),
      genre: String(m?.['genre'] ?? ""),
      mood: String(m?.['mood'] ?? ""),
      tempo: String(m?.['tempo'] ?? ""),
      instrumentation: String(m?.['instrumentation'] ?? ""),
      isOriginalByOwner: m?.['isOriginalByOwner'] === true,
      note: String(m?.['note'] ?? ""),
    })),
    audioSkillAssets: strings(au['audioSkillAssets']),
  };
  const num = (x: unknown, d = 0): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
  const vec = (x: unknown): [number, number, number] => {
    const a = arr<unknown>(x);
    return [num(a[0]), num(a[1]), num(a[2])];
  };
  const knowledgeNodes = arr<Record<string, unknown>>(v['knowledgeNodes'])
    .map((n) => {
      const sa = n?.['spatial_action'];
      const spatial =
        typeof sa === "object" && sa !== null
          ? {
              object_name: String((sa as Record<string, unknown>)['object_name'] ?? ""),
              coordinates_xyz: vec((sa as Record<string, unknown>)['coordinates_xyz']),
              grasp_type: String((sa as Record<string, unknown>)['grasp_type'] ?? "none"),
              movement_vector: vec((sa as Record<string, unknown>)['movement_vector']),
            }
          : null;
      return {
        timestamp_start: String(n?.['timestamp_start'] ?? ""),
        timestamp_end: String(n?.['timestamp_end'] ?? ""),
        concept_title: String(n?.['concept_title'] ?? ""),
        detailed_explanation: String(n?.['detailed_explanation'] ?? ""),
        spatial_action: spatial && spatial.object_name ? spatial : null,
        confidence_score: num(n?.['confidence_score']),
      } as KnowledgeNode;
    })
    .filter((n) => n.concept_title && n.confidence_score >= MIN_NODE_CONFIDENCE);
  const knowledge = strings(v['knowledge']);
  const emotionTimeline = arr<Record<string, unknown>>(v['emotion_timeline'] ?? v['emotionTimeline'])
    .map((e) => {
      const raw = String(e?.['primary_emotion'] ?? "").toUpperCase();
      const primary = (PRIMARY_EMOTIONS as readonly string[]).includes(raw)
        ? (raw as PrimaryEmotion)
        : "NEUTRAL";
      return {
        timestamp_start: String(e?.['timestamp_start'] ?? ""),
        timestamp_end: String(e?.['timestamp_end'] ?? ""),
        primary_emotion: primary,
        expression_intensity: Math.min(1, Math.max(0, num(e?.['expression_intensity']))),
        facial_trigger: String(e?.['facial_trigger'] ?? "Neutral_Face"),
        vocal_tone_marker: String(e?.['vocal_tone_marker'] ?? "Flat_Even"),
        evidence: String(e?.['evidence'] ?? ""),
      } as EmotionMoment;
    })
    .filter((e) => e.timestamp_start || e.evidence);
  const cp = (v['copyright'] ?? {}) as Record<string, unknown>;
  const signals = arr<Record<string, unknown>>(cp['signals']).map((s) => ({
    timestamp: String(s?.['timestamp'] ?? ""),
    kind: String(s?.['kind'] ?? "other"),
    detail: String(s?.['detail'] ?? ""),
    confidence: typeof s?.['confidence'] === "number" ? (s['confidence'] as number) : 0,
  }));
  const originality =
    cp['originality'] === "third-party" || cp['originality'] === "uncertain"
      ? (cp['originality'] as string)
      : "original";
  const copyright: CopyrightAudit = {
    // Never trust a "clear" verdict when a strong signal is present.
    flagged:
      cp['flagged'] === true || originality === "third-party" || signals.some((s) => s.confidence >= 0.7),
    originality,
    signals,
    summary: typeof cp['summary'] === "string" ? cp['summary'] : "",
  };
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
      musicPresent: w?.musicPresent === true,
    })),
    audio,
    subconsciousness,
    knowledgeNodes,
    emotionTimeline,
    copyright,

  };
}

export async function mineChunk(
  key: string,
  model: string,
  fileRef: UploadedFile,
  startSec: number,
  endSec: number,
  signal?: AbortSignal,
  category?: MiningCategory,
): Promise<ChunkResult> {
  const res = await geminiRequest(
    `${BASE}/v1/models/${encodeURIComponent(model)}:generateContent`,
    key,
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
                text: `${PROMPT}${categoryDirective(category)}\n\nTime range for this segment: ${Math.floor(startSec)}s to ${Math.ceil(endSec)}s of the video.`,
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
    await geminiRequest(`${BASE}/v1beta/${name}`, key, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

/**
 * Mines a segment directly from a public media URI (e.g. a YouTube link) without
 * uploading anything. Gemini fetches and analyses the video itself.
 */
export async function mineUrlSegment(
  key: string,
  model: string,
  url: string,
  startSec: number,
  endSec: number,
  signal?: AbortSignal,
  category?: MiningCategory,
): Promise<ChunkResult> {
  const res = await geminiRequest(
    `${BASE}/v1/models/${encodeURIComponent(model)}:generateContent`,
    key,
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
                fileData: { fileUri: url },
                videoMetadata: {
                  startOffset: `${Math.floor(startSec)}s`,
                  endOffset: `${Math.ceil(endSec)}s`,
                },
              },
              { text: `${PROMPT}${categoryDirective(category)}\n\nTime range for this segment: ${Math.floor(startSec)}s to ${Math.ceil(endSec)}s of the video.` },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema },
      }),
    },
  );
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new GeminiError("Gemini returned an empty response for this video", 500);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError("Could not parse JSON returned by Gemini", 500);
  }
  return normalizeChunkResult(parsed);
}
