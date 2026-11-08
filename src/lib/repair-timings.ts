import { secondsToStamp, stampToSeconds, type TranscriptLine } from "@/lib/subtitle-health";

/**
 * Free timing repair: spreads lines that have no timestamp across the gap
 * between the nearest timed neighbours, weighted by how much was said. No AI
 * call — captions stop sticking to 0:00 immediately, though the exact second
 * is an estimate, not a re-watch of the video.
 */
export function repairTimingsLocal(lines: TranscriptLine[]): TranscriptLine[] {
  if (!lines.length) return lines;

  const anchors = lines.map((l) => stampToSeconds(l.timestamp));
  if (anchors.every((a) => a != null)) return lines; // nothing to repair

  const weights = lines.map((l) => Math.max(1, String(l.speech ?? "").trim().length));
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const durationGuess = Math.max(30, Math.round(total * 0.08)); // ~12 chars/sec speech

  const out = lines.map((line) => ({ ...line }));
  // Look ahead once. Generated anchors become the preceding anchor on the
  // next iteration, exactly as before; suffix sums avoid re-scanning the gap.
  const nextTimed: number[] = new Array(out.length);
  const sums: number[] = new Array(out.length + 1).fill(0);
  let next = out.length;
  for (let i = out.length - 1; i >= 0; i -= 1) {
    nextTimed[i] = next;
    if (anchors[i] != null) next = i;
    sums[i] = (sums[i + 1] ?? 0) + (weights[i] ?? 1);
  }
  let before = 0;
  for (let index = 0; index < out.length; index += 1) {
    const anchor = anchors[index];
    if (anchor != null) { before = anchor; continue; }
    const afterIndex = nextTimed[index] ?? out.length;
    const after = anchors[afterIndex] ?? durationGuess;
    const runTotal = ((sums[index] ?? 0) - (sums[afterIndex] ?? 0)) || 1;
    const span = Math.max(after - before, (afterIndex - index) * 2);
    const start = before;
    const end = before + (span * (weights[index] ?? 1)) / runTotal;
    anchors[index] = start;
    const line = out[index];
    if (line) line.timestamp = `${secondsToStamp(start)} - ${secondsToStamp(Math.max(end, start + 1))}`;
    before = start;
  }
  return out;
}
