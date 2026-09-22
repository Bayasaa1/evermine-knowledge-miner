import { LANGUAGES } from "@/lib/languages";
import { normalizeYoutubeUrl } from "@/lib/import-sources";
import { normalizeChunkResult, speakerIdentityDirective, type ChunkResult } from "@/lib/gemini";
import { buildTimeline, secondsToStamp, timelineForPrompt, type Cue } from "@/lib/timeline.server";
import {
  GeminiHttpError,
  UserAiError,
  geminiGenerate,
  youtubeVideoPart,
  type AiCredential,
} from "@/lib/user-ai.server";

const miningPrompt = `You are building an AI Avatar (digital twin) from this personal-archive video.
Analyze only the requested time range and return JSON only with these keys:
- speakers: distinct voices with label, role (primary, secondary, unknown), and description.
- subtitle: verbatim spoken lines with whole-video timestamp, speech, speaker, and role. Preserve the original language exactly.
- story: summary, tone, and chronological beats with timestamp, event, and emotion.
- faceData: useful visual keyframes with timestamp, description, gestures, lighting, faceAngle, cloneQuality, isKeyAction, actionType, clipStart, and clipEnd.
- voiceData: the cleanest music-free speech windows with start, end, quality, note, and musicPresent.
- audio: hasMusic, atmosphere, genres, moods, tempo, segments, and audioSkillAssets.
- subconsciousness: skills, beliefs, decisionLogic, culturalVocabulary, expressiveStyle, and aestheticProfile.
- knowledgeNodes: precise concept/action nodes with timestamp_start, timestamp_end, concept_title, detailed_explanation, spatial_action (object_name, coordinates_xyz as three normalized 0..1 numbers, grasp_type, movement_vector as three numbers, or null when no object is handled), and confidence_score between 0.0 and 1.0. Never inflate confidence_score; use below 0.8 whenever you are guessing, since those nodes are discarded.

Only attribute skills, beliefs, decision logic, cultural vocabulary, and expressive style to the primary owner. Decode idioms, metaphors, blessings, teasing, and sarcasm according to their real cultural intent, not their literal wording. Every culturalVocabulary item needs phrase, timestamp, kind, literal, meaning, intent, sentiment, and usage. Do not invent information that is not present in the video.`;

const SAFETY_MESSAGE =
  "SAFETY_BLOCKED: Google's AI safety filters stopped the analysis of this video. Try a different clip or trim out sensitive, adult or violent moments.";

function gatewayMessage(status: number, detail: string): string {
  if (/safety|blocked|prohibited content|harm_category/i.test(detail)) return SAFETY_MESSAGE;
  if (status === 402) return detail || "AI credits are exhausted for this workspace.";
  if (status === 403) return detail || "AI access is blocked for this workspace.";
  if (status === 429) return detail || "Video analysis is busy. Please try again shortly.";
  if (/unavailable|not found|private/i.test(detail)) return "This YouTube video is private or unavailable.";
  return detail || `Video analysis failed (${status}).`;
}

/** Free-text answers from the pre-mining assessment wizard. */
export type Assessment = {
  videoContext?: string;
  primaryFocus?: string;
  customInstructions?: string;
  speakerIdentity?: string;
  sourceTitle?: string;
  sourceDescription?: string;
  sourcePublishedAt?: string;
  sourceDurationLabel?: string;
  sourceChannel?: string;
  /** UI language code — the mined JSON must be written natively in it. */
  outputLanguage?: string;
  /**
   * How this video should be read:
   * "auto"  — use YouTube's subtitles when the video is a talking one, else watch it.
   * "fast"  — read the subtitles; only watch the video if there are none.
   * "watch" — always watch the video with Gemini (needed for anything visual).
   */
  miningMode?: "auto" | "fast" | "watch";
};

/** Video types whose value is entirely in the words. */
const TALKING_CONTEXTS = [
  "Podcast",
  "Interview",
  "Conversation",
  "Phone call",
  "Talk / lecture",
  "Lecture / Tutorial",
  "Speech",
  "Sales call",
];

function readsFromSubtitles(a: Assessment | undefined): boolean {
  const mode = a?.miningMode ?? "auto";
  if (mode === "watch") return false;
  if (mode === "fast") return true;
  return TALKING_CONTEXTS.includes((a?.videoContext ?? "").trim());
}

const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(LANGUAGES).map((l) => [l.code, `${l.name} (${l.native})`]),
);

/**
 * The Core Brain is stored in English for AI stability and graph-schema
 * integrity; the UI translates it into the viewer's language at render time.
 * `code` is kept only so the model knows the creator's audience.
 */
function languageDirective(code: string | undefined): string {
  const audience = LANGUAGE_NAMES[(code ?? "en").toLowerCase()];
  return `\n\nCORE STORAGE LANGUAGE — ENGLISH\nWrite every human-readable JSON value in clear English, even when the video is spoken in another language. This English core is the canonical brain; the app translates it for display. The only exceptions are the verbatim "subtitle" speech and culturalVocabulary "phrase" fields, which stay in the original spoken language — their meanings, intents and usage notes must still be English.${
    audience && (code ?? "en").toLowerCase() !== "en"
      ? ` The creator's audience speaks ${audience}; keep names and culture-specific terms accurate in transliteration, but do not translate the JSON values.`
      : ""
  }`;
}

/** Auto-extracted YouTube metadata, given to the model as grounding context. */
function metadataDirective(a: Assessment): string {
  const rows = [
    a.sourceTitle ? `Title: ${a.sourceTitle}` : "",
    a.sourceChannel ? `Channel / author: ${a.sourceChannel}` : "",
    a.sourcePublishedAt ? `Published: ${a.sourcePublishedAt}` : "",
    a.sourceDurationLabel ? `Duration: ${a.sourceDurationLabel}` : "",
    a.sourceDescription ? `Original description and tags:\n${a.sourceDescription.slice(0, 4_000)}` : "",
  ].filter(Boolean);
  if (!rows.length) return "";
  return `\n\nSOURCE METADATA (from YouTube — use it for names, spelling, topics and chronology; never treat it as spoken content)\n${rows.join("\n")}`;
}

function assessmentDirective(a: Assessment | undefined): string {
  if (!a) return "";
  const lines: string[] = [];
  if (a.videoContext) lines.push(`Video context: ${a.videoContext}. Interpret every scene through this lens.`);
  if (a.primaryFocus) lines.push(`Primary extraction focus: ${a.primaryFocus}. Weight the output heavily toward it.`);
  if (a.customInstructions) lines.push(`Creator instructions: ${a.customInstructions}`);
  const speaker = speakerIdentityDirective(a.speakerIdentity);
  const language = languageDirective(a.outputLanguage);
  const meta = metadataDirective(a);
  return lines.length || speaker || meta || language
    ? `\n\nCREATOR ASSESSMENT\n${lines.join("\n")}${speaker}${meta}${language}`
    : "";
}


/**
 * The analysis pass must describe the video against the real timeline instead
 * of inventing clock values, so the numbered spoken lines are handed to it and
 * every timed field has to quote one of them.
 */
function timelineDirective(block: string): string {
  if (!block) return "";
  return `\n\nSPOKEN TIMELINE (ground truth — these times were measured, do not change them)\n${block}\n\nTIMING RULES\n- Every timestamp you write MUST be copied from the line above that the moment belongs to.\n- Never invent a time, never write 00:00:00 as a placeholder, never leave a timestamp empty.\n- For the "subtitle" array, reuse these lines exactly: same words, same times, same speaker.`;
}

export async function analyzeYoutubeVideo(input: {
  url: string;
  startSec: number;
  endSec: number;
  assessment?: Assessment;
  /** The job owner's own Gemini credential — mining never uses platform AI. */
  credential: AiCredential;
  /** Who owns this job and which video it is, for the usage history. */
  usage?: { userId: string; videoLabel?: string; videoId?: string; jobId?: string };
}): Promise<ChunkResult> {
  const url = normalizeYoutubeUrl(input.url);
  if (!url || input.endSec <= input.startSec) throw new Error("Invalid YouTube video or time range.");
  const videoId = youtubeId(url);

  // Step 0 — a talking video is read, not watched. YouTube already holds the
  // words with exact timing, so the whole range costs one cheap text call on
  // whichever engine the creator assigned, instead of minutes of video quota.
  if (videoId && input.usage && readsFromSubtitles(input.assessment)) {
    try {
      const { analyzeTranscript } = await import("@/lib/transcript-mine.server");
      const fast = await analyzeTranscript({
        videoId,
        startSec: input.startSec,
        endSec: input.endSec,
        ...(input.assessment ? { assessment: input.assessment } : {}),
        usage: input.usage,
      });
      if (fast) return fast.result;
    } catch (err) {
      // No captions, or the writing engine was unavailable — watch the video
      // instead, which is slower but always works.
      if (err instanceof UserAiError) throw err;
    }
  }

  // Step 1 — measure the clock before anything is described. Captions are the
  // measured clock when they exist, and they cost nothing.
  let cues: Cue[] = [];
  if (videoId) {
    try {
      const { fetchCaptionCues } = await import("@/lib/youtube-captions.server");
      cues = tidyCues((await fetchCaptionCues(videoId, input.startSec, input.endSec)).cues);
    } catch {
      // Fall through to listening.
    }
  }
  if (!cues.length) {
    try {
      cues = await buildTimeline(url, input.startSec, input.endSec, input.credential);
    } catch (err) {
      if (err instanceof UserAiError) throw err;
    }
  }

  const usageMeta = input.usage
    ? {
        userId: input.usage.userId,
        role: "mine",
        subjectKind: "video" as const,
        subjectId: input.usage.videoId ?? url,
        subjectLabel: input.usage.videoLabel ?? url,
        jobId: input.usage.jobId ?? "",
      }
    : undefined;

  let text: string;
  try {
    text = await geminiGenerate({
      credential: input.credential,
      model: "gemini-2.5-flash",
      json: true,
      maxTokens: 65536,
      ...(usageMeta ? { usage: usageMeta } : {}),
      turns: [
        {
          role: "user",
          parts: [
            {
              text: `${miningPrompt}${assessmentDirective(input.assessment)}${timelineDirective(timelineForPrompt(cues))}\n\nRequested time range: ${Math.floor(input.startSec)}s to ${Math.ceil(input.endSec)}s.`,
            },
            youtubeVideoPart(url, input.credential, input.startSec, input.endSec),
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof GeminiHttpError && err.message === "SAFETY_BLOCKED") throw new Error(SAFETY_MESSAGE);
    if (err instanceof GeminiHttpError) throw new Error(gatewayMessage(err.status, err.message));
    throw err;
  }
  if (!text) throw new Error("AI returned an empty video analysis.");

  let result: ChunkResult;
  try {
    result = normalizeChunkResult(JSON.parse(text));
  } catch {
    throw new Error("AI returned an unreadable video analysis.");
  }

  // Watching and organizing are separate jobs. Gemini remains responsible for
  // the actual video; the user's Mining — writing up assignment can clean the
  // structured notes with a text engine such as Groq or Mistral.
  if (input.usage) {
    try {
      const { generateRoleText } = await import("@/lib/user-ai.server");
      const written = await generateRoleText({
        userId: input.usage.userId,
        role: "mine_write",
        system: "You organize video-mining JSON. Preserve every timestamp, quote, fact and JSON key. Remove repetition and improve clarity. Return only valid JSON with exactly the same structure.",
        prompt: JSON.stringify(result),
        json: true,
        maxTokens: 16384,
        subjectKind: "video",
        subjectId: input.usage.videoId ?? url,
        subjectLabel: input.usage.videoLabel ?? url,
      });
      result = normalizeChunkResult(JSON.parse(written.text));
    } catch {
      // The watched result is complete and remains usable when the optional
      // writing engine is unavailable.
    }
  }

  // Step 3 — the measured timeline always wins over the described one.
  if (cues.length) {
    const roleOf = new Map(
      (result.speakers ?? []).map((s) => [s.label.toLowerCase().trim(), s.role] as const),
    );
    result.transcript = cues.map((cue) => ({
      timestamp: `${secondsToStamp(cue.start)} - ${secondsToStamp(cue.end)}`,
      speech: cue.text,
      speaker: cue.speaker,
      role: roleOf.get(cue.speaker.toLowerCase().trim()) ?? "unknown",
    }));
  }
  return result;
}