import { secondsToStamp, stampToSeconds, type TranscriptLine } from "@/lib/subtitle-health";

/**
 * Re-mines *only* the timing layer of an already mined transcript: the spoken
 * lines are kept exactly as they are and the video is watched again just to
 * anchor each line to a real start/end second. Far cheaper than a full re-mine
 * and it cannot corrupt the rest of the Core Brain.
 */

const BATCH = 60;

type Timed = { i?: number; start?: string; end?: string };

function prompt(lines: TranscriptLine[], offset: number): string {
  const numbered = lines
    .map((line, index) => `${offset + index}: ${String(line.speech ?? "").slice(0, 300)}`)
    .join("\n");
  return `Watch the video and find WHEN each of the following already-transcribed lines is spoken.
Return JSON only: {"times":[{"i":<line number>,"start":"HH:MM:SS","end":"HH:MM:SS"}]}
Rules:
- Timestamps are absolute positions in the WHOLE video, never relative to a segment.
- Keep the line numbers exactly as given; include every line you can locate.
- Lines are already in spoken order, so times must increase.
- If a line truly cannot be located, omit it instead of guessing.

LINES:
${numbered}`;
}

async function callGateway(apiKey: string, url: string, text: string): Promise<Timed[]> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text },
            { type: "video_url", video_url: { url } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let detail = raw.slice(0, 300);
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } };
      detail = parsed.error?.message ?? detail;
    } catch {
      // keep the bounded raw text
    }
    if (response.status === 429) throw new Error("Re-timing is rate limited — try again shortly.");
    if (response.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    throw new Error(detail || `Re-timing failed (${response.status}).`);
  }

  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { times?: Timed[] } | Timed[];
    return Array.isArray(parsed) ? parsed : (parsed.times ?? []);
  } catch {
    return [];
  }
}

/** Returns the same lines with repaired, monotonically increasing timestamps. */
export async function retimeTranscript(url: string, lines: TranscriptLine[]): Promise<TranscriptLine[]> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Built-in AI is not configured.");
  if (!lines.length) return lines;

  const found = new Map<number, { start: number; end: number }>();
  for (let offset = 0; offset < lines.length; offset += BATCH) {
    const slice = lines.slice(offset, offset + BATCH);
    const times = await callGateway(apiKey, url, prompt(slice, offset));
    for (const item of times) {
      const index = Number(item?.i);
      const start = stampToSeconds(item?.start ?? null);
      if (!Number.isInteger(index) || index < 0 || index >= lines.length || start == null) continue;
      const end = stampToSeconds(item?.end ?? null);
      found.set(index, { start, end: end != null && end > start ? end : start + 3 });
    }
  }
  if (!found.size) throw new Error("The AI could not locate these lines in the video.");

  // Keep the timeline strictly increasing, then spread any line the model could
  // not place across the gap between its timed neighbours.
  let previous = -1;
  const anchored: (number | null)[] = lines.map((_, index) => {
    const hit = found.get(index);
    if (!hit) return null;
    const start = Math.max(hit.start, previous + 0.5);
    previous = start;
    return start;
  });

  const out: TranscriptLine[] = lines.map((line, index) => {
    let start = anchored[index];
    if (start == null) {
      let before = index > 0 ? (anchored[index - 1] ?? 0) : 0;
      let after = before + 4;
      for (let i = index + 1; i < lines.length; i += 1) {
        if (anchored[i] != null) {
          after = anchored[i]!;
          break;
        }
      }
      let gapCount = 1;
      for (let i = index + 1; i < lines.length && anchored[i] == null; i += 1) gapCount += 1;
      start = before + Math.max(1, (after - before) / (gapCount + 1));
      anchored[index] = start;
    }
    const nextTimed = anchored.slice(index + 1).find((v) => v != null) as number | undefined;
    const end = Math.min(start + 6, nextTimed != null ? Math.max(start + 1, nextTimed) : start + 6);
    return { ...line, timestamp: `${secondsToStamp(start)} - ${secondsToStamp(end)}` };
  });

  return out;
}
