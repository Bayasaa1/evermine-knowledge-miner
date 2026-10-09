/** 5-minute parts: short enough that Gemini records both speech and the screen without dropping either. */
export const CHUNK_SECONDS = 300;
export const EPSILON = 1e-6;
export const MIN_TAIL_SECONDS = 10;

export type Chunk = {
  index: number;
  start: number;
  end: number;
  duration: number;
};

/**
 * Split a video duration (seconds) into fixed 5-minute (CHUNK_SECONDS) chunks.
 * - 660s  -> 3 pieces (300, 300, 60)
 * - 9180s -> 31 pieces (30x300, 180)
 * - 600s  -> 2 pieces (exact boundary, epsilon guarded)
 * - 600.02s -> 2 pieces (0.02s tail merged into previous chunk)
 * A final chunk shorter than 10s is merged into the previous chunk.
 */
export function splitIntoChunks(durationSeconds: number): Chunk[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];

  const count = Math.max(1, Math.ceil((durationSeconds - EPSILON) / CHUNK_SECONDS));
  const chunks: Chunk[] = [];

  for (let i = 0; i < count; i++) {
    const start = i * CHUNK_SECONDS;
    const end = Math.min(durationSeconds, start + CHUNK_SECONDS);
    chunks.push({ index: i, start, end, duration: end - start });
  }

  // Merge a too-short tail into the previous chunk.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1]!;
    if (last.duration < MIN_TAIL_SECONDS - EPSILON) {
      chunks.pop();
      const prev = chunks[chunks.length - 1]!;
      prev.end = last.end;
      prev.duration = prev.end - prev.start;
    }
  }

  return chunks.map((c, i) => ({ ...c, index: i }));
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
