/**
 * Two ears are better than one.
 *
 * YouTube's automatic captions carry accurate TIMES but often the wrong WORDS —
 * badly so for Mongolian and for speech that mixes languages. Gemini, listening
 * to the same audio, gets the words closer but drifts on the clock.
 *
 * This module marries the two: caption timing, verified wording. Nothing here
 * calls an AI engine, so reconciling costs nobody a single token.
 */
import type { SpeakerProfile, SpeakerRole, TranscriptLine } from "@/lib/gemini";

export type ReconcileCue = { start: number; end: number; text: string; speaker: string };

export function stampToSeconds(stamp: string): number {
  const first = String(stamp ?? "").split("-")[0] ?? "";
  const parts = first.trim().split(":").map((p) => Number(p.replace(",", ".")));
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return NaN;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

export function secondsToStamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Words only, lower-cased, so punctuation and spacing never count as a difference. */
function words(text: string): string[] {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** 0..1 — how much of the two wordings is shared. */
export function wordAgreement(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (!left.length || !right.length) return 0;
  const pool = [...right];
  let hits = 0;
  for (const w of left) {
    const at = pool.indexOf(w);
    if (at >= 0) {
      pool.splice(at, 1);
      hits++;
    }
  }
  return hits / Math.max(left.length, right.length);
}

/** Captions and heard speech agree above this, so the caption wording is kept as-is. */
const AGREEMENT_KEPT = 0.82;
/** Below this the heard wording is almost certainly about a different moment. */
const AGREEMENT_UNRELATED = 0.15;

type ModelLine = { start: number; end: number; line: TranscriptLine };

function parsedModelLines(lines: TranscriptLine[]): ModelLine[] {
  const out: ModelLine[] = [];
  for (const line of lines) {
    const raw = String(line.timestamp ?? "");
    const [from, to] = raw.split("-");
    const start = stampToSeconds(from ?? "");
    if (!Number.isFinite(start)) continue;
    const endParsed = stampToSeconds(to ?? "");
    out.push({ start, end: Number.isFinite(endParsed) && endParsed > start ? endParsed : start + 5, line });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Builds the final spoken timeline from the caption track and what the model
 * heard, marking every line with where its wording came from.
 */
export function reconcileTranscript(
  cues: ReconcileCue[],
  modelLines: TranscriptLine[],
  speakers: SpeakerProfile[] = [],
): TranscriptLine[] {
  const roleOf = new Map(speakers.map((s) => [s.label.toLowerCase().trim(), s.role] as const));
  const heard = parsedModelLines(modelLines);
  const usedHeard = new Set<number>();

  const roleFor = (label: string, fallback: SpeakerRole = "unknown"): SpeakerRole =>
    roleOf.get(label.toLowerCase().trim()) ?? fallback;

  const rows: { at: number; line: TranscriptLine }[] = [];

  for (const cue of cues) {
    // Everything the model heard inside this caption's window.
    const overlapping = heard
      .map((h, index) => ({ h, index }))
      .filter(({ h }) => h.end > cue.start && h.start < cue.end);

    const spoken = overlapping.map(({ h }) => h.line.speech).join(" ").trim();
    const agreement = wordAgreement(cue.text, spoken);
    const speaker =
      cue.speaker?.trim() || overlapping[0]?.h.line.speaker?.trim() || "Speaker";

    let line: TranscriptLine;
    if (!spoken || agreement < AGREEMENT_UNRELATED) {
      // Nothing comparable was heard here — the caption stands on its own.
      line = {
        timestamp: `${secondsToStamp(cue.start)} - ${secondsToStamp(cue.end)}`,
        speech: cue.text,
        speaker,
        role: roleFor(speaker),
        source: "caption",
      };
    } else if (agreement >= AGREEMENT_KEPT) {
      // Both heard the same thing.
      line = {
        timestamp: `${secondsToStamp(cue.start)} - ${secondsToStamp(cue.end)}`,
        speech: cue.text,
        speaker,
        role: roleFor(speaker),
        source: "verified",
      };
      for (const { index } of overlapping) usedHeard.add(index);
    } else {
      // They disagree: keep the measured time, trust the listened wording, and
      // keep the caption's version so the creator can see what changed.
      line = {
        timestamp: `${secondsToStamp(cue.start)} - ${secondsToStamp(cue.end)}`,
        speech: spoken,
        speaker,
        role: roleFor(speaker),
        source: "verified",
        captionText: cue.text,
      };
      for (const { index } of overlapping) usedHeard.add(index);
    }
    rows.push({ at: cue.start, line });
  }

  // Speech the captions missed entirely stays in, marked as heard-only.
  heard.forEach((h, index) => {
    if (usedHeard.has(index)) return;
    const covered = cues.some((c) => c.end > h.start && c.start < h.end);
    if (covered || !h.line.speech.trim()) return;
    rows.push({
      at: h.start,
      line: {
        ...h.line,
        speaker: h.line.speaker || "Speaker",
        role: roleFor(h.line.speaker || "", h.line.role),
        source: "heard",
      },
    });
  });

  return rows.sort((a, b) => a.at - b.at).map((r) => r.line);
}

/**
 * Stable, descriptive names for voices nobody named — "Support role 1",
 * "Guest 2" — so no person in a video is ever left as a blank "unknown".
 */
export function describeSpeakerLabel(label: string, role: SpeakerRole, index: number): string {
  const clean = String(label ?? "").trim();
  const generic = !clean || /^(unknown|speaker|voice)\b/i.test(clean) || /^speaker [a-z0-9]$/i.test(clean);
  if (!generic) return clean;
  if (role === "primary") return "Host";
  if (role === "secondary") return `Support role ${index + 1}`;
  return `Voice ${index + 1}`;
}
