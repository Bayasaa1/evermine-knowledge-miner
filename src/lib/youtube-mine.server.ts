import { normalizeYoutubeUrl } from "@/lib/import-sources";
import { normalizeChunkResult, type ChunkResult } from "@/lib/gemini";

const miningPrompt = `You are building an AI Avatar (digital twin) from this personal-archive video.
Analyze only the requested time range and return JSON only with these keys:
- speakers: distinct voices with label, role (primary, secondary, unknown), and description.
- subtitle: verbatim spoken lines with whole-video timestamp, speech, speaker, and role. Preserve the original language exactly.
- story: summary, tone, and chronological beats with timestamp, event, and emotion.
- faceData: useful visual keyframes with timestamp, description, gestures, lighting, faceAngle, cloneQuality, isKeyAction, actionType, clipStart, and clipEnd.
- voiceData: the cleanest music-free speech windows with start, end, quality, note, and musicPresent.
- audio: hasMusic, atmosphere, genres, moods, tempo, segments, and audioSkillAssets.
- subconsciousness: skills, beliefs, decisionLogic, culturalVocabulary, expressiveStyle, and aestheticProfile.

Only attribute skills, beliefs, decision logic, cultural vocabulary, and expressive style to the primary owner. Decode idioms, metaphors, blessings, teasing, and sarcasm according to their real cultural intent, not their literal wording. Every culturalVocabulary item needs phrase, timestamp, kind, literal, meaning, intent, sentiment, and usage. Do not invent information that is not present in the video.`;

function gatewayMessage(status: number, detail: string): string {
  if (status === 402) return detail || "AI credits are exhausted for this workspace.";
  if (status === 403) return detail || "AI access is blocked for this workspace.";
  if (status === 429) return detail || "Video analysis is busy. Please try again shortly.";
  if (/unavailable|not found|private/i.test(detail)) return "This YouTube video is private or unavailable.";
  return detail || `Video analysis failed (${status}).`;
}

export async function analyzeYoutubeVideo(input: {
  url: string;
  startSec: number;
  endSec: number;
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
              text: `${miningPrompt}\n\nRequested time range: ${Math.floor(input.startSec)}s to ${Math.ceil(input.endSec)}s.`,
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

  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI returned an empty video analysis.");

  try {
    return normalizeChunkResult(JSON.parse(text));
  } catch {
    throw new Error("AI returned an unreadable video analysis.");
  }
}