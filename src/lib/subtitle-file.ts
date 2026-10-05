/**
 * Reads a subtitle file the creator supplies themselves (SRT, VTT, or the text
 * copied from YouTube's "Show transcript" panel) into timed lines.
 * Browser-safe: no server imports.
 */
export type SubtitleCue = { start: number; end: number; text: string };

/** "01:02:03,450" / "1:02:03.4" / "373:19" / "0:05" → seconds. */
export function clockToSeconds(raw: string): number | null {
  const m = raw.trim().match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?(?:[.,](\d+))?$/);
  if (!m) return null;
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  return m[3] != null
    ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac
    : Number(m[1]) * 60 + Number(m[2]) + frac;
}

const ARROW = /^\s*(\d+:\d{1,2}(?::\d{1,2})?(?:[.,]\d+)?)\s*-->\s*(\d+:\d{1,2}(?::\d{1,2})?(?:[.,]\d+)?)/;
const LEAD = /^\s*\[?(\d+:\d{1,2}(?::\d{1,2})?)\]?\s*(.*)$/;

function clean(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\{[^}]*\}/g, "").replace(/\s+/g, " ").trim();
}

export function parseSubtitleText(input: string): SubtitleCue[] {
  const lines = input.replace(/\r/g, "").replace(/^\uFEFF/, "").split("\n");
  const out: SubtitleCue[] = [];

  // SRT / VTT: "start --> end" followed by text lines until a blank line.
  if (lines.some((l) => ARROW.test(l))) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i]!.match(ARROW);
      if (!m) continue;
      const start = clockToSeconds(m[1]!);
      const end = clockToSeconds(m[2]!);
      const text: string[] = [];
      while (i + 1 < lines.length && lines[i + 1]!.trim() && !ARROW.test(lines[i + 1]!)) text.push(lines[++i]!);
      const body = clean(text.join(" "));
      if (start != null && body) out.push({ start, end: end != null && end > start ? end : start + 3, text: body });
    }
  } else {
    // YouTube "Show transcript" copy: a clock on its own line or at the line start.
    let pending: { start: number; text: string[] } | null = null;
    const flush = () => {
      if (pending && pending.text.length) out.push({ start: pending.start, end: pending.start + 3, text: clean(pending.text.join(" ")) });
    };
    for (const line of lines) {
      if (!line.trim()) continue;
      const m = line.match(LEAD);
      const sec = m ? clockToSeconds(m[1]!) : null;
      if (m && sec != null) {
        flush();
        pending = { start: sec, text: m[2]?.trim() ? [m[2]] : [] };
      } else if (pending) {
        pending.text.push(line);
      }
    }
    flush();
  }

  // Ordered, and each line ends when the next begins (never overlapping it).
  out.sort((a, b) => a.start - b.start);
  for (let i = 0; i < out.length - 1; i++) {
    const next = out[i + 1]!.start;
    if (out[i]!.end > next || out[i]!.end - out[i]!.start > 15) out[i]!.end = Math.max(out[i]!.start + 0.5, Math.min(next, out[i]!.start + 15));
  }
  return out.filter((c) => c.text);
}
