import type { Chunk } from "@/lib/chunking";
import type { ChunkResult } from "@/lib/gemini";

/** Answers collected by the pre-mining assessment wizard. */
export type Assessment = {
  videoContext: string;
  primaryFocus: string;
  customInstructions: string;
  /** Podcast diarization hint, e.g. "Host: Batbold, Guest: Elon Musk". */
  speakerIdentity: string;
  /** Auto-extracted YouTube metadata, injected into the Gemini context. */
  sourceTitle: string;
  sourceDescription: string;
  sourcePublishedAt: string;
  sourceDurationLabel: string;
  sourceChannel: string;
  /** UI language code the mined JSON must be written in ("en" | "mn" | "ko" | ...). */
  outputLanguage: string;
  /**
   * How the video is read. "auto" decides from the video type, "fast" reads
   * YouTube's subtitles (seconds, any text engine), "watch" always uses Gemini
   * video (needed whenever what you see matters).
   */
  miningMode: MiningMode;
};

export type MiningMode = "auto" | "fast" | "watch";

/** Metadata auto-extracted from a pasted YouTube link. */
export type VideoMetadata = {
  videoId: string;
  url: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSec: number;
  durationLabel: string;
  thumbnail: string;
  channel: string;
};

/** Seconds -> HH:MM:SS (or MM:SS for videos under an hour). */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** ISO timestamp -> readable date in the active UI language. */
export function formatPublishedDate(iso: string, locale = "en"): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  try {
    return d.toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Chunk plan size for a duration — always at least one 5-minute chunk. */
export function totalChunksFor(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;
  return Math.max(1, Math.ceil(durationSec / 300));
}


export const VIDEO_CONTEXTS = [
  "Podcast",
  "Gaming Stream",
  "Movie / Film",
  "Football Match",
  "Lecture / Tutorial",
  "Vlog / Personal Archive",
] as const;

export const PRIMARY_FOCUSES = [
  "Tactical / Strategy",
  "Emotion / Facial Reactions",
  "Knowledge / QA",
  "Physical Action",
] as const;

/**
 * The question chips only ever show choices that make sense for the kind of
 * Mind being built — a Robot Brain was being offered "Football Match".
 * The first entry of each list is the default answer.
 */
const CONTEXTS_BY_CATEGORY: Record<string, readonly string[]> = {
  robot: ["Robot demo", "Hands-on task", "Workshop / factory", "Walkthrough"],
  gaming: ["Gameplay", "Match replay", "Tutorial run"],
  voice: ["Conversation", "Podcast", "Phone call", "Speech"],
  movement: ["Hands-on task", "Tutorial", "Workout", "Cooking"],
  sales: ["Product demo", "Sales call", "Ad / promo", "Review"],
  knowledge: ["Talk / lecture", "Interview", "Podcast", "Tutorial"],
};

const FOCUSES_BY_CATEGORY: Record<string, readonly string[]> = {
  robot: ["Movement & grasping", "Objects & space", "Step order"],
  gaming: ["Tactics", "Reactions", "Mechanics"],
  voice: ["Tone & emotion", "Wording", "Timing"],
  movement: ["Movement & grasping", "Step order", "Explanations"],
  sales: ["Offers & pricing", "Objections", "Product details"],
  knowledge: ["Facts & answers", "Explanations", "Opinions"],
};

/** Video-type choices for a creation category. */
export function contextsFor(category: string): readonly string[] {
  return CONTEXTS_BY_CATEGORY[category] ?? CONTEXTS_BY_CATEGORY['knowledge']!;
}

/** Focus choices for a creation category. */
export function focusesFor(category: string): readonly string[] {
  return FOCUSES_BY_CATEGORY[category] ?? FOCUSES_BY_CATEGORY['knowledge']!;
}

/** Video types where naming the speakers actually helps the AI. */
export function wantsSpeakerNames(context: string): boolean {
  return ["Podcast", "Conversation", "Interview", "Phone call", "Sales call", "Talk / lecture"].includes(context);
}

export const DEFAULT_ASSESSMENT: Assessment = {
  videoContext: "Talk / lecture",
  primaryFocus: "Facts & answers",
  customInstructions: "",
  speakerIdentity: "",
  sourceTitle: "",
  sourceDescription: "",
  sourcePublishedAt: "",
  sourceDurationLabel: "",
  sourceChannel: "",
  outputLanguage: "en",
  miningMode: "auto",
};

/** Starting answers for a creation category — already sensible, so the
 *  fine-tune panel can stay closed. */
export function defaultAssessmentFor(category: string): Assessment {
  return {
    ...DEFAULT_ASSESSMENT,
    videoContext: contextsFor(category)[0]!,
    primaryFocus: focusesFor(category)[0]!,
    // The mind type decides how the video is read: talking minds use the
    // subtitles, anything physical or visual is watched.
    miningMode: category === "knowledge" || category === "voice" || category === "sales" ? "fast" : "watch",
  };
}

const SPEAKER_MARKER = "[SPEAKER_IDENTITY]";
const META_MARKER = "[SOURCE_META]";

type MetaFields = Pick<
  Assessment,
  | "sourceTitle"
  | "sourceDescription"
  | "sourcePublishedAt"
  | "sourceDurationLabel"
  | "sourceChannel"
  | "outputLanguage"
  | "miningMode"
>;

const EMPTY_META: MetaFields = {
  outputLanguage: "en",
  miningMode: "auto",
  sourceTitle: "",
  sourceDescription: "",
  sourcePublishedAt: "",
  sourceDurationLabel: "",
  sourceChannel: "",
};

/** Folds the diarization hint and auto metadata into the stored instructions column. */
export function packInstructions(a: Assessment): string {
  let out = a.customInstructions ?? "";
  if (a.speakerIdentity?.trim()) out = `${out}\n${SPEAKER_MARKER} ${a.speakerIdentity.trim()}`.trim();
  const meta: MetaFields = {
    sourceTitle: a.sourceTitle ?? "",
    sourceDescription: (a.sourceDescription ?? "").slice(0, 4_000),
    sourcePublishedAt: a.sourcePublishedAt ?? "",
    sourceDurationLabel: a.sourceDurationLabel ?? "",
    sourceChannel: a.sourceChannel ?? "",
    outputLanguage: a.outputLanguage || "en",
    miningMode: a.miningMode || "auto",
  };
  if (Object.values(meta).some((v) => v)) out = `${out}\n${META_MARKER} ${JSON.stringify(meta)}`.trim();
  return out;
}

/** Splits a stored instructions column back into instructions + identity + metadata. */
export function unpackInstructions(
  raw: string,
): { customInstructions: string; speakerIdentity: string } & MetaFields {
  let rest = raw ?? "";
  let meta: MetaFields = { ...EMPTY_META };
  const metaAt = rest.indexOf(META_MARKER);
  if (metaAt >= 0) {
    const line = rest.slice(metaAt + META_MARKER.length).split("\n")[0] ?? "";
    try {
      meta = { ...meta, ...(JSON.parse(line.trim()) as Partial<MetaFields>) };
    } catch {
      /* stored line is not valid JSON — keep empty metadata */
    }
    rest = (rest.slice(0, metaAt) + rest.slice(metaAt + META_MARKER.length + line.length)).trim();
  }
  const at = rest.indexOf(SPEAKER_MARKER);
  if (at < 0) return { customInstructions: rest, speakerIdentity: "", ...meta };
  return {
    customInstructions: rest.slice(0, at).trim(),
    speakerIdentity: rest.slice(at + SPEAKER_MARKER.length).trim(),
    ...meta,
  };
}


export type MiningJobStatus =
  | "queued"
  | "running"
  | "paused_quota"
  /** Paused by the creator — the background worker leaves it alone until resumed. */
  | "paused_user"
  /** Stopped by the creator — finished checkpoints stay, nothing more is mined. */
  | "stopped"
  | "error"
  | "done";

export type MiningJob = {
  id: string;
  sourceUrl: string;
  sourceLabel: string;
  playlistId: string | null;
  queuePosition: number;
  assessment: Assessment;
  chunks: Chunk[];
  nextIndex: number;
  totalChunks: number;
  status: MiningJobStatus;
  /** Set once the finished job has been written into a Mind vault. */
  vaultId: string | null;
  lastError: string | null;
  retryAfter: string | null;
  updatedAt: string;
  createdAt?: string;
  personaId?: string | null;
};

export type ChunkStepResult = {
  job: MiningJob;
  /** The freshly mined checkpoint, when this call produced one. */
  chunk: ChunkResult | null;
  /** Every checkpoint stored so far, merged and ready to display/persist. */
  merged: ChunkResult | null;
  done: boolean;
  /** Another runner holds this job right now. */
  busy?: boolean;
};

export function jobProgress(job: MiningJob): number {
  if (job.totalChunks <= 0) return 0;
  return Math.round((job.nextIndex / job.totalChunks) * 100);
}

/**
 * When a stopped video may try again. A per-minute burst waits ~90s; the free
 * daily quota waits until Google's reset at midnight US Pacific, so no calls
 * are wasted while tokens are gone.
 */
export function quotaRetryAfter(message: string, now = new Date()): string {
  if (/one minute|per.?minute|rate_minute|wait a moment/i.test(message)) {
    return new Date(now.getTime() + 90_000).toISOString();
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const elapsed = (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000;
  // +2 minutes of margin after the reset.
  return new Date(now.getTime() + (86_400_000 - elapsed) + 120_000).toISOString();
}

export function isQuotaMessage(message: string): boolean {
  return /quota|rate limit|429|too many requests|resource_exhausted|one minute/i.test(message);
}

export type PartState = "done" | "mining" | "waiting" | "failed";

/** Per-part list shown before and during mining. */
export function jobParts(job: MiningJob): { index: number; start: number; end: number; state: PartState }[] {
  return job.chunks.map((c, i) => ({
    index: i,
    start: c.start,
    end: c.end,
    state:
      i < job.nextIndex
        ? "done"
        : i === job.nextIndex
          ? job.status === "error"
            ? "failed"
            : job.status === "running"
              ? "mining"
              : "waiting"
          : "waiting",
  }));
}
