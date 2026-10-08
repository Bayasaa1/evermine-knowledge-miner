/**
 * The spoken timeline — the single source of truth for time in a mined video.
 *
 * The big analysis pass is good at meaning and bad at clocks: asked to fill a
 * huge JSON schema it silently drops timestamps or invents them, which is why
 * captions used to slide away from the audio. So timing is now its own tiny
 * pass: short windows, one job only ("when was this said"), whole-video times.
 * Everything else in the Mind is anchored to the timeline this produces.
 */

import {
  UserAiError,
  geminiGenerate,
  youtubeVideoPart,
  type AiCredential,
} from "@/lib/user-ai.server";

export type Cue = {
  /** Seconds from the start of the whole video. */
  start: number;
  end: number;
  text: string;
  speaker: string;
};

/** Short windows keep the model's clock honest; longer ones drift badly. */
const WINDOW_SECONDS = 120;
const MAX_LINE_SECONDS = 12;

export function secondsToStamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function stampToSeconds(raw: unknown): number | null {
  const first = (String(raw ?? "").split(/\s*(?:-|–|—|>)\s*/)[0]?.trim() ?? "").replace(/(\d)\s*s(?:ec)?$/i, "$1");
  if (!first) return null;
  const parts = first.split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0] ?? null;
}

const PROMPT = (start: number, end: number) =>
  `Listen to this video segment and write down WHEN each sentence is spoken.

Return JSON only: {"lines":[{"start":"MM:SS","end":"MM:SS","text":"...","speaker":"..."}]}

Rules:
- Times are absolute positions in the WHOLE video, between ${secondsToStamp(start)} and ${secondsToStamp(end)}.
- Every line MUST have both start and end. Never leave a time empty and never reuse a window.
- Split speech into natural lines of 2-8 seconds, in spoken order, times increasing.
- Verbatim words in the ORIGINAL language, including filler words. Never translate or summarise.
- Give the speaker's name or a stable label (e.g. "Host", "Guest 1"). Same voice = same label.
- If nobody speaks in a stretch, simply skip it. Return an empty list when there is no speech.`;

type RawLine = { start?: unknown; end?: unknown; text?: unknown; speaker?: unknown };

async function listenWindow(
  credential: AiCredential,
  url: string,
  start: number,
  end: number,
): Promise<Cue[]> {
  const content = (
    await geminiGenerate({
      credential,
      model: "gemini-3.1-flash-lite",
      json: true,
      maxTokens: 4096,
      turns: [
        {
          role: "user",
          parts: [{ text: PROMPT(start, end) }, youtubeVideoPart(url, credential, start, end)],
        },
      ],
    })
  ).trim();
  if (!content) return [];
  let parsed: { lines?: RawLine[] } | RawLine[];
  try {
    parsed = JSON.parse(content) as { lines?: RawLine[] };
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed.lines ?? []);

  const out: Cue[] = [];
  for (const row of rows) {
    const text = String(row?.text ?? "").trim();
    const from = stampToSeconds(row?.start);
    if (!text || from == null) continue;
    // A window-relative answer is rescued instead of thrown away.
    const absolute = from < start - 5 && from <= end - start + 5 ? from + start : from;
    if (absolute < start - 5 || absolute > end + 5) continue;
    const to = stampToSeconds(row?.end);
    const finish =
      to != null && to > absolute ? Math.min(to, absolute + MAX_LINE_SECONDS) : absolute + 3;
    out.push({
      start: Math.max(0, absolute),
      end: finish,
      text,
      speaker: String(row?.speaker ?? "").trim() || "Speaker",
    });
  }
  return out;
}

function normalizeKey(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Strictly increasing, non-overlapping, de-duplicated across window seams. */
export function tidyCues(cues: Cue[]): Cue[] {
  const sorted = cues.slice().sort((a, b) => a.start - b.start);
  const out: Cue[] = [];
  for (const cue of sorted) {
    const previous = out[out.length - 1];
    if (previous) {
      if (normalizeKey(previous.text) === normalizeKey(cue.text) && cue.start - previous.start < 8) continue;
      if (cue.start < previous.end) previous.end = Math.max(previous.start + 0.8, cue.start);
      if (cue.start <= previous.start) cue.start = previous.start + 0.8;
    }
    if (cue.end <= cue.start) cue.end = cue.start + 1.5;
    out.push(cue);
  }
  return out;
}

/**
 * Builds the timed spoken line list for one time range. Windows are listened to
 * one after another so the model never has to hold a long clock in its head.
 */
export async function buildTimeline(
  url: string,
  startSec: number,
  endSec: number,
  credential: AiCredential,
  options: { signal?: AbortSignal } = {},
): Promise<Cue[]> {
  const cues: Cue[] = [];
  for (let from = startSec; from < endSec; from += WINDOW_SECONDS) {
    if (options.signal?.aborted) break;
    const to = Math.min(from + WINDOW_SECONDS, endSec);
    if (to - from < 2) break;
    try {
      cues.push(...(await listenWindow(credential, url, from, to)));
    } catch (err) {
      // One deaf window must not lose the rest of the video — but a missing
      // key or an exhausted quota stops the whole pass honestly.
      if (err instanceof UserAiError) throw err;
    }
  }
  return tidyCues(cues);
}

/** The timeline as the analysis pass sees it: numbered, timed, quotable. */
export function timelineForPrompt(cues: Cue[], limit = 400): string {
  if (!cues.length) return "";
  return cues
    .slice(0, limit)
    .map(
      (cue, index) =>
        `#${index + 1} [${secondsToStamp(cue.start)} - ${secondsToStamp(cue.end)}] ${cue.speaker}: ${cue.text.slice(0, 400)}`,
    )
    .join("\n");
}
