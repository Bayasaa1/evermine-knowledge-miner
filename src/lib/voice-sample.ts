/** Client-side 60-second audio sample extraction for voice cloning (ElevenLabs etc.). */

export type VoiceSample = {
  url: string;
  mimeType: string;
  size: number;
  start: number;
  duration: number;
  filename: string;
  /** True when background music was filtered out of the recording. */
  speechFiltered: boolean;
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
 * Speech-isolation chain: strips sub-bass and cymbal/hiss music energy that sits
 * outside the human voice band, notches typical bass-line frequencies, lifts the
 * consonant range, and levels the result so the cloning sample stays clean speech.
 */
function buildSpeechIsolationChain(ctx: AudioContext, source: AudioNode): AudioNode {
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 90; // drop music sub-bass / rumble
  highpass.Q.value = 0.7;

  const lowBassCut = ctx.createBiquadFilter();
  lowBassCut.type = "peaking";
  lowBassCut.frequency.value = 180; // typical bass-line / kick body
  lowBassCut.Q.value = 1.1;
  lowBassCut.gain.value = -8;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 2600; // speech consonants
  presence.Q.value = 0.9;
  presence.gain.value = 4;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7800; // drop cymbals / synth shimmer
  lowpass.Q.value = 0.7;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -26;
  compressor.knee.value = 24;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.22;

  source.connect(highpass);
  highpass.connect(lowBassCut);
  lowBassCut.connect(presence);
  presence.connect(lowpass);
  lowpass.connect(compressor);
  return compressor;
}

/**
 * Records `length` seconds of audio from `file`, starting at `start` seconds.
 * Runs in real time in the browser; nothing is uploaded anywhere.
 * Background music is filtered out by default so the sample is clean speech.
 */
export async function extractVoiceSample(
  file: File,
  start: number,
  length = 60,
  opts: { signal?: AbortSignal; onProgress?: (seconds: number) => void; isolateSpeech?: boolean } = {},
): Promise<VoiceSample> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video") as CaptureVideo;
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  let audioCtx: AudioContext | null = null;

  const cleanup = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    void audioCtx?.close().catch(() => {});
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
    let audioStream = new MediaStream(audioTracks);

    // Filter background music out of the sample so voice cloning gets clean speech.
    const isolate = opts.isolateSpeech !== false;
    if (isolate && typeof AudioContext !== "undefined") {
      try {
        audioCtx = new AudioContext();
        const src = audioCtx.createMediaStreamSource(audioStream);
        const dest = audioCtx.createMediaStreamDestination();
        buildSpeechIsolationChain(audioCtx, src).connect(dest);
        audioStream = dest.stream;
        await audioCtx.resume().catch(() => {});
      } catch {
        audioCtx = null; // fall back to the raw track
      }
    }

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
      speechFiltered: audioCtx !== null,
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
