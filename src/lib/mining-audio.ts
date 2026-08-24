import type { StreamTier } from "@/lib/network-quality";

/**
 * Background Mind Mining audio capture.
 *
 * Mining only needs intelligible speech, never fidelity, so the mic is captured
 * as mono, 16 kHz, low-bitrate Opus and duty-cycled: a short slice every cycle
 * instead of a continuous stream. On weak networks the bitrate and duty cycle
 * drop further, which is where the mobile-data saving comes from.
 */

export type MiningAudioProfile = {
  /** Encoder bitrate in bits per second. */
  bitsPerSecond: number;
  /** Length of each recorded slice, in ms. */
  sliceMs: number;
  /** Idle gap between slices, in ms. */
  gapMs: number;
  label: string;
};

export const MINING_PROFILES: Record<StreamTier, MiningAudioProfile> = {
  hd: { bitsPerSecond: 24000, sliceMs: 6000, gapMs: 4000, label: "24 kbps Opus" },
  voice: { bitsPerSecond: 16000, sliceMs: 5000, gapMs: 9000, label: "16 kbps Opus" },
  audio: { bitsPerSecond: 10000, sliceMs: 4000, gapMs: 16000, label: "10 kbps Opus" },
};

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

/** Uncompressed 16-bit/44.1 kHz mono reference, for the savings estimate. */
const RAW_BPS = 44100 * 16;

export type MiningRecorderHandle = {
  stop: () => void;
  /** Compressed bytes captured so far. */
  bytes: () => number;
};

export type MiningRecorderOptions = {
  getTier: () => StreamTier;
  onChunk?: (chunk: Blob) => void;
  onBytes?: (totalBytes: number, savedBytes: number) => void;
  onError?: (message: string) => void;
};

/**
 * Starts duty-cycled compressed capture. Returns null when the browser has no
 * MediaRecorder or the user denies the mic — mining then stays text-only.
 */
export async function startMiningCapture(opts: MiningRecorderOptions): Promise<MiningRecorderHandle | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  const mimeType = pickMimeType();
  if (!mimeType) return null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch {
    opts.onError?.("Microphone unavailable — mining continues from text only.");
    return null;
  }

  let stopped = false;
  let bytes = 0;
  let recorder: MediaRecorder | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let recordedMs = 0;

  const cycle = () => {
    if (stopped) return;
    const profile = MINING_PROFILES[opts.getTier()];
    try {
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: profile.bitsPerSecond });
    } catch {
      opts.onError?.("Compressed capture unsupported — mining continues from text only.");
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      bytes += e.data.size;
      recordedMs += profile.sliceMs;
      opts.onChunk?.(e.data);
      opts.onBytes?.(bytes, Math.max(0, Math.round((recordedMs / 1000) * (RAW_BPS / 8)) - bytes));
    };
    recorder.start();
    timer = setTimeout(() => {
      try {
        recorder?.stop();
      } catch {
        /* already stopped */
      }
      timer = setTimeout(cycle, profile.gapMs);
    }, profile.sliceMs);
  };

  cycle();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      try {
        if (recorder && recorder.state !== "inactive") recorder.stop();
      } catch {
        /* noop */
      }
      stream.getTracks().forEach((t) => t.stop());
    },
    bytes: () => bytes,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
