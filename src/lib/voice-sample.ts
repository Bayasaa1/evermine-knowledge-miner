/** Client-side 60-second audio sample extraction for voice cloning (ElevenLabs etc.). */

export type VoiceSample = {
  url: string;
  mimeType: string;
  size: number;
  start: number;
  duration: number;
  filename: string;
};

/** Parses "MM:SS" / "HH:MM:SS" (or a bare seconds string) into seconds. */
export function parseTimestamp(ts: string): number | null {
  const s = (ts ?? "").trim();
  if (!s) return null;
  const parts = s.split(":").map((p) => Number(p.replace(/[^\d.]/g, "")));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 1) return parts[0] as number;
  if (parts.length === 2) return (parts[0] as number) * 60 + (parts[1] as number);
  if (parts.length === 3) return (parts[0] as number) * 3600 + (parts[1] as number) * 60 + (parts[2] as number);
  return null;
}

type CaptureVideo = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };

/**
 * Records `length` seconds of audio from `file`, starting at `start` seconds.
 * Runs in real time in the browser; nothing is uploaded anywhere.
 */
export async function extractVoiceSample(
  file: File,
  start: number,
  length = 60,
  opts: { signal?: AbortSignal; onProgress?: (seconds: number) => void } = {},
): Promise<VoiceSample> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video") as CaptureVideo;
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const cleanup = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read the video file."));
    });

    const total = Number.isFinite(video.duration) ? video.duration : start + length;
    const begin = Math.max(0, Math.min(start, Math.max(0, total - 1)));
    const dur = Math.max(1, Math.min(length, total - begin));

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Could not seek the video file."));
      video.currentTime = begin;
    });

    const capture = video.captureStream?.bind(video) ?? video.mozCaptureStream?.bind(video);
    if (!capture) throw new Error("This browser cannot capture audio from video files.");
    const stream = capture();
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) throw new Error("This video has no audio track.");
    const audioStream = new MediaStream(audioTracks);

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
      (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
    );
    const recorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
    const parts: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data);
    };

    const done = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    recorder.start();
    await video.play();

    const stop = () => {
      if (recorder.state !== "inactive") recorder.stop();
      video.pause();
    };
    const tick = setInterval(() => {
      const elapsed = video.currentTime - begin;
      opts.onProgress?.(Math.max(0, Math.min(dur, elapsed)));
      if (opts.signal?.aborted || elapsed >= dur || video.ended) {
        clearInterval(tick);
        stop();
      }
    }, 250);

    await done;
    clearInterval(tick);
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const type = recorder.mimeType || mimeType || "audio/webm";
    const blob = new Blob(parts, { type });
    const ext = type.includes("mp4") ? "m4a" : "webm";
    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "voice";
    return {
      url: URL.createObjectURL(blob),
      mimeType: type,
      size: blob.size,
      start: begin,
      duration: dur,
      filename: `${base}_voice_sample.${ext}`,
    };
  } finally {
    cleanup();
  }
}

export function downloadVoiceSample(sample: VoiceSample) {
  const a = document.createElement("a");
  a.href = sample.url;
  a.download = sample.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
