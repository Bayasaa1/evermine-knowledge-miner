import type { Chunk } from "@/lib/chunking";
import type { ChunkResult } from "@/lib/gemini";

/** Answers collected by the pre-mining assessment wizard. */
export type Assessment = {
  videoContext: string;
  primaryFocus: string;
  customInstructions: string;
};

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

export const DEFAULT_ASSESSMENT: Assessment = {
  videoContext: "Podcast",
  primaryFocus: "Knowledge / QA",
  customInstructions: "",
};

export type MiningJobStatus = "queued" | "running" | "paused_quota" | "error" | "done";

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
  lastError: string | null;
  retryAfter: string | null;
  updatedAt: string;
};

export type ChunkStepResult = {
  job: MiningJob;
  /** The freshly mined checkpoint, when this call produced one. */
  chunk: ChunkResult | null;
  /** Every checkpoint stored so far, merged and ready to display/persist. */
  merged: ChunkResult | null;
  done: boolean;
};

export function jobProgress(job: MiningJob): number {
  if (job.totalChunks <= 0) return 0;
  return Math.round((job.nextIndex / job.totalChunks) * 100);
}
