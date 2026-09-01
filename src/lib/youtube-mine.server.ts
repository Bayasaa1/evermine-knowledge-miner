import { normalizeYoutubeUrl } from "@/lib/import-sources";
import { normalizeChunkResult, speakerIdentityDirective, type ChunkResult } from "@/lib/gemini";

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
};

function assessmentDirective(a: Assessment | undefined): string {
  if (!a) return "";
  const lines: string[] = [];
  if (a.videoContext) lines.push(`Video context: ${a.videoContext}. Interpret every scene through this lens.`);
  if (a.primaryFocus) lines.push(`Primary extraction focus: ${a.primaryFocus}. Weight the output heavily toward it.`);
  if (a.customInstructions) lines.push(`Creator instructions: ${a.customInstructions}`);
  const speaker = speakerIdentityDirective(a.speakerIdentity);
  return lines.length || speaker ? `\n\nCREATOR ASSESSMENT\n${lines.join("\n")}${speaker}` : "";
}

export async function analyzeYoutubeVideo(input: {
  url: string;
  startSec: number;
  endSec: number;
  assessment?: Assessment;
}): Promise<ChunkResult> {
  const url = normalizeYoutubeUrl(input.url);
  if (!url || input.endSec <= input.startSec) throw new Error("Invalid YouTube video or time range.");

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Built-in AI is not configured.");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${miningPrompt}${assessmentDirective(input.assessment)}\n\nRequested time range: ${Math.floor(input.startSec)}s to ${Math.ceil(input.endSec)}s.`,
            },
            { type: "video_url", video_url: { url } },
          ],
        },
      ],
      response_format: { type: "json_object" },

    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let detail = raw.slice(0, 500);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
      detail = parsed.error?.message ?? parsed.message ?? detail;
    } catch {
      // Keep the bounded raw response when the gateway did not return JSON.
    }
    throw Object.assign(new Error(gatewayMessage(response.status, detail)), { status: response.status });
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  const choice = body.choices?.[0];
  if (choice?.finish_reason && /safety|content_filter/i.test(choice.finish_reason)) {
    throw new Error(SAFETY_MESSAGE);
  }
  const text = choice?.message?.content?.trim();
  if (!text) throw new Error("AI returned an empty video analysis.");

  try {
    return normalizeChunkResult(JSON.parse(text));
  } catch {
    throw new Error("AI returned an unreadable video analysis.");
  }
}