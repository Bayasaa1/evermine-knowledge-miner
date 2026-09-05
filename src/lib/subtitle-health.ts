/**
 * Shared subtitle-timing diagnostics. A mined transcript "drifts" when its
 * lines have no timestamp at all, or when the stamps go backwards / pile up on
 * the same second — in both cases the player has to guess and captions slide
 * away from the audio.
 */

export type TranscriptLine = {
  timestamp?: string | null;
  speech?: string | null;
  speaker?: string | null;
  role?: string | null;
};

export function stampToSeconds(raw: string | null | undefined): number | null {
  const first = String(raw ?? "").split(/\s*(?:-|–|—|>)\s*/)[0]?.trim() ?? "";
  if (!first) return null;
  const parts = first.split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0] ?? null;
}

export function secondsToStamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type TimingHealth = {
  total: number;
  untimed: number;
  outOfOrder: number;
  /** 0 = perfectly timed, 1 = fully unusable. */
  drift: number;
  status: "synced" | "drifting" | "untimed";
};

export function analyzeTiming(lines: TranscriptLine[]): TimingHealth {
  const total = lines.length;
  if (!total) return { total: 0, untimed: 0, outOfOrder: 0, drift: 0, status: "untimed" };

  let untimed = 0;
  let outOfOrder = 0;
  let previous: number | null = null;
  for (const line of lines) {
    const value = stampToSeconds(line.timestamp);
    if (value == null) {
      untimed += 1;
      continue;
    }
    if (previous != null && value < previous - 1) outOfOrder += 1;
    previous = value;
  }

  const drift = Math.min(1, (untimed + outOfOrder) / total);
  const status: TimingHealth["status"] =
    untimed === total ? "untimed" : drift > 0.05 ? "drifting" : "synced";
  return { total, untimed, outOfOrder, drift, status };
}
