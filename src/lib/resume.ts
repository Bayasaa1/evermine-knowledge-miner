import { idbGet, idbSet, idbDelete, STORES } from "./store";
import type { Chunk } from "./chunking";
import type { UploadedFile } from "./gemini";

const RESUME_KEY = "mining-resume";

/**
 * Progressive mining checkpoint — written after every 5-minute chunk so a
 * quota stop can be resumed later without re-uploading the video.
 */
export type ResumeState = {
  fileName: string;
  fileSize: number;
  duration: number | null;
  model: string;
  chunks: Chunk[];
  /** Index of the next chunk to mine. */
  nextIndex: number;
  /** Gemini File API reference — valid for ~48h after upload. */
  fileRef: UploadedFile | null;
  reason: "quota" | "error" | "stopped" | "running";
  savedAt: number;
};

export async function saveResume(state: ResumeState): Promise<void> {
  await idbSet(STORES.SESSION, RESUME_KEY, state);
}

export async function loadResume(): Promise<ResumeState | null> {
  const raw = await idbGet<ResumeState>(STORES.SESSION, RESUME_KEY);
  if (!raw || !Array.isArray(raw.chunks) || typeof raw.nextIndex !== "number") return null;
  if (raw.nextIndex >= raw.chunks.length) return null;
  return raw;
}

export async function clearResume(): Promise<void> {
  await idbDelete(STORES.SESSION, RESUME_KEY);
}
