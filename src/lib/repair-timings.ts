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
  for (let index = 0; index < out.length; index += 1) {
    if (anchors[index] != null) continue;
    let before = 0;
    for (let i = index - 1; i >= 0; i -= 1)
      if (anchors[i] != null) {
        before = anchors[i]!;
        break;
      }
    let afterIndex = out.length;
    let after = durationGuess;
    for (let i = index + 1; i < out.length; i += 1)
      if (anchors[i] != null) {
        afterIndex = i;
        after = anchors[i]!;
        break;
      }
    let startOfRun = index;
    while (startOfRun > 0 && anchors[startOfRun - 1] == null) startOfRun -= 1;
    const runWeights = weights.slice(startOfRun, afterIndex);
    const runTotal = runWeights.reduce((s, w) => s + w, 0) || 1;
    const consumed = weights.slice(startOfRun, index).reduce((s, w) => s + w, 0);
    const span = Math.max(after - before, runWeights.length * 2);
    const start = before + (span * consumed) / runTotal;
    const end = before + (span * (consumed + weights[index]!)) / runTotal;
    anchors[index] = start;
    out[index]!.timestamp = `${secondsToStamp(start)} - ${secondsToStamp(Math.max(end, start + 1))}`;
  }
  return out;
}
