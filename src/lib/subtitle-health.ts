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
  const first = (String(raw ?? "").split(/\s*(?:-|–|—|>)\s*/)[0]?.trim() ?? "").replace(/(\d)\s*s(?:ec)?$/i, "$1");
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

export type PartPlan = { start: number; end: number };

export type MineProblemKind = "time_jump" | "foreign_lines" | "empty_part" | "unfinished";

/** One concrete problem, pinned to the mined part it came from. */
export type MineProblem = {
  kind: MineProblemKind;
  /** Index of the mined part, or -1 when it concerns the whole video. */
  part: number;
  start: number;
  end: number;
  lines: number;
};

function cyrillic(text: string): number {
  const letters = String(text ?? "").match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => /[\u0400-\u04FF]/.test(c)).length / letters.length;
}

/**
 * Finds what is actually wrong with a mined video's subtitles, part by part:
 * clocks that leap outside their part, model summaries in another language
 * mixed into the captions, parts that came back silent while their neighbours
 * talk, and parts that were never mined.
 */
export function findMineProblems(
  lines: (TranscriptLine & { source?: string | null })[],
  parts: PartPlan[],
  minedParts: number,
): MineProblem[] {
  const problems: MineProblem[] = [];
  if (!parts.length) return problems;
  const end = parts[parts.length - 1]!.end;
  const partOf = (sec: number) => {
    const i = parts.findIndex((p) => sec >= p.start - 1 && sec < p.end + 1);
    return i < 0 ? -1 : i;
  };
  const add = (kind: MineProblemKind, part: number) => {
    const found = problems.find((p) => p.kind === kind && p.part === part);
    if (found) found.lines += 1;
    else problems.push({ kind, part, start: parts[part]?.start ?? 0, end: parts[part]?.end ?? end, lines: 1 });
  };

  const captions = lines.filter((l) => l.source === "caption" || l.source === "verified");
  const captionCyr = captions.length ? captions.reduce((s, l) => s + cyrillic(l.speech ?? ""), 0) / captions.length : null;
  const perPart = new Array(parts.length).fill(0);
  let lastGood: number | null = null;

  for (const line of lines) {
    const at = stampToSeconds(line.timestamp);
    if (at == null) continue;
    if (at > end + 30 || (lastGood != null && at < lastGood - 20 && at < lastGood - 600)) {
      // The clock leapt out of the video: blame the part we were in.
      add("time_jump", lastGood == null ? 0 : Math.max(0, partOf(lastGood)));
      continue;
    }
    const part = partOf(at);
    if (part >= 0) perPart[part] += 1;
    if (line.source === "heard" && captionCyr != null && part >= 0) {
      const own = cyrillic(line.speech ?? "");
      if ((captionCyr > 0.6 && own < 0.3) || (captionCyr < 0.2 && own > 0.6)) add("foreign_lines", part);
    }
    lastGood = at;
  }

  const talking = perPart.filter((n) => n > 0).length;
  if (talking >= 2) {
    for (let i = 0; i < Math.min(minedParts, parts.length); i++) {
      const before = perPart[i - 1] ?? 0;
      const after = perPart[i + 1] ?? 0;
      if (perPart[i] === 0 && (before > 0 || after > 0)) problems.push({ kind: "empty_part", part: i, start: parts[i]!.start, end: parts[i]!.end, lines: 0 });
    }
  }
  if (minedParts < parts.length) {
    problems.push({ kind: "unfinished", part: -1, start: parts[minedParts]?.start ?? 0, end, lines: parts.length - minedParts });
  }
  return problems;
}
