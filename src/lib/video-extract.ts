/**
 * Browser-side pre-processing for creator-uploaded videos.
 *
 * A 300–500MB file is never sent to the server or to Gemini. The browser cuts
 * it into 5-minute parts and, per part, takes a handful of small JPEG frames
 * and a low-rate mono WAV of the sound. Only those few MB travel to the miner.
 */

export const PART_SECONDS = 300;
export const AUDIO_RATE = 12_000;
export const FRAMES_PER_PART = 24;
export const FRAME_WIDTH = 512;

export type PartWindow = { index: number; startSec: number; endSec: number };

/** Splits a duration into consecutive 5-minute windows; the last one is shorter. */
export function planWindows(durationSec: number, partSec = PART_SECONDS): PartWindow[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];
  const out: PartWindow[] = [];
  for (let s = 0, i = 0; s < durationSec; s += partSec, i++) {
    out.push({ index: i, startSec: s, endSec: Math.min(durationSec, s + partSec) });
  }
  return out;
}

/** Evenly spaced frame times inside a window (centred, never at the very end). */
export function frameTimes(win: PartWindow, count = FRAMES_PER_PART): number[] {
  const span = win.endSec - win.startSec;
  if (span <= 0 || count <= 0) return [];
  const n = Math.max(1, Math.min(count, Math.ceil(span / 2)));
  const step = span / n;
  return Array.from({ length: n }, (_, i) => +(win.startSec + step * (i + 0.5)).toFixed(2));
}

/** 16-bit PCM mono WAV from float samples. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]!));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export type ExtractedPart = PartWindow & {
  frames: { t: number; jpeg: string }[];
  audioWav: string | null;
};

export type ExtractProgress = { stage: "audio" | "frames"; done: number; total: number };

/** Reads the video length without loading the whole file. */
export function readDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This video file could not be read.")); };
    v.src = url;
  });
}

/** Decodes the whole sound track once and resamples it to 12kHz mono. */
async function decodeMonoAudio(file: File): Promise<AudioBuffer | null> {
  try {
    const raw = await file.arrayBuffer();
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const decoded = await ctx.decodeAudioData(raw);
    void ctx.close();
    const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * AUDIO_RATE), AUDIO_RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    return await off.startRendering();
  } catch {
    return null; // silent or unsupported audio — frames still go through
  }
}

function seek(v: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { v.removeEventListener("seeked", done); resolve(); };
    v.addEventListener("seeked", done);
    v.currentTime = t;
  });
}

/**
 * Cuts a local video file into mining parts. Yields one part at a time so the
 * caller can send it and free memory before the next one is built.
 */
export async function* extractParts(
  file: File,
  onProgress?: (p: ExtractProgress) => void,
  /** The saved job's own part plan; defaults to plain 5-minute windows. */
  plan?: PartWindow[],
  /** Parts already mined are skipped (resume). */
  fromIndex = 0,
): AsyncGenerator<ExtractedPart> {
  const duration = await readDuration(file);
  const windows = (plan?.length ? plan : planWindows(duration)).filter((w) => w.index >= fromIndex);
  onProgress?.({ stage: "audio", done: 0, total: 1 });
  const audio = await decodeMonoAudio(file);
  onProgress?.({ stage: "audio", done: 1, total: 1 });

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  await new Promise<void>((r, j) => { video.onloadeddata = () => r(); video.onerror = () => j(new Error("This video file could not be played.")); });
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, FRAME_WIDTH / (video.videoWidth || FRAME_WIDTH));
  canvas.width = Math.max(1, Math.round((video.videoWidth || FRAME_WIDTH) * scale));
  canvas.height = Math.max(1, Math.round((video.videoHeight || FRAME_WIDTH) * scale));
  const g = canvas.getContext("2d")!;

  try {
    for (const win of windows) {
      const frames: { t: number; jpeg: string }[] = [];
      const times = frameTimes(win);
      for (const [i, t] of times.entries()) {
        await seek(video, t);
        g.drawImage(video, 0, 0, canvas.width, canvas.height);
        frames.push({ t, jpeg: canvas.toDataURL("image/jpeg", 0.6).split(",")[1] ?? "" });
        onProgress?.({ stage: "frames", done: (win.index - fromIndex) * FRAMES_PER_PART + i + 1, total: windows.length * FRAMES_PER_PART });
      }
      let audioWav: string | null = null;
      if (audio) {
        const from = Math.floor(win.startSec * AUDIO_RATE);
        const to = Math.min(audio.length, Math.ceil(win.endSec * AUDIO_RATE));
        if (to > from) audioWav = bytesToBase64(encodeWav(audio.getChannelData(0).slice(from, to), AUDIO_RATE));
      }
      yield { ...win, frames, audioWav };
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
