/**
 * Live spoken translation for the feed player.
 *
 * Each subtitle line is spoken in the viewer's chosen language using the
 * creator's own cloned voice (their ElevenLabs key, resolved server side by
 * /api/mind-voice — the viewer never sees or pays for it).
 *
 * Performance rules that matter here:
 *  - one line speaks at a time; a line the picture has already passed is
 *    dropped instead of queued, so the voice can never drift behind,
 *  - the next line is fetched while the current one plays, so there is no gap,
 *  - finished audio is kept in memory for the session, so rewinding or
 *    re-watching costs the creator nothing a second time.
 */
import type { LangCode } from "@/lib/languages";
import { apiFetch } from "@/lib/api-fetch";

const SAMPLE_RATE = 24000;

export type SpeakFailure = { code: "no_clone" | "no_key" | "error"; message: string };

type Cache = Map<string, Float32Array>;

const audioCache: Cache = new Map();
/** Keeps the session cache from growing without bound on long watch sessions. */
const MAX_CACHED_LINES = 120;

const cacheKey = (mindId: string, lang: LangCode, text: string) => `${mindId}:${lang}:${text}`;

function remember(key: string, pcm: Float32Array) {
  if (audioCache.size >= MAX_CACHED_LINES) {
    const oldest = audioCache.keys().next().value;
    if (oldest) audioCache.delete(oldest);
  }
  audioCache.set(key, pcm);
}

/** Downloads one spoken line as raw samples. Throws a {@link SpeakFailure}. */
async function fetchLine(
  mindId: string,
  text: string,
  lang: LangCode,
  signal: AbortSignal,
): Promise<Float32Array> {
  const key = cacheKey(mindId, lang, text);
  const hit = audioCache.get(key);
  if (hit) return hit;

  const res = await apiFetch("/api/mind-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mindId, text, lang }),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = "The voice could not speak this line.";
    let code: SpeakFailure["code"] = "error";
    try {
      const data = (await res.json()) as { error?: string; code?: string };
      if (data.error) message = data.error;
      if (data.code === "no_clone") code = "no_clone";
      else if (data.code === "no_key" || res.status === 402) code = "no_key";
    } catch {
      /* non-JSON body */
    }
    throw { code, message } satisfies SpeakFailure;
  }

  const chunks: Float32Array[] = [];
  let total = 0;
  let carry = new Uint8Array(0);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += value;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let evt: { type?: string; audio?: string };
      try {
        evt = JSON.parse(payload) as { type?: string; audio?: string };
      } catch {
        continue;
      }
      if (evt.type !== "speech.audio.delta" || !evt.audio) continue;
      const binary = atob(evt.audio);
      const raw = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) raw[i] = binary.charCodeAt(i);
      // 16-bit samples can straddle two chunks; keep the odd byte for the next.
      const merged = new Uint8Array(carry.length + raw.length);
      merged.set(carry);
      merged.set(raw, carry.length);
      const usable = merged.length - (merged.length % 2);
      carry = merged.slice(usable);
      if (!usable) continue;
      const samples = new Int16Array(merged.buffer, 0, usable / 2);
      const floats = Float32Array.from(samples, (s) => s / 32768);
      chunks.push(floats);
      total += floats.length;
    }
  }

  const pcm = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    pcm.set(c, at);
    at += c.length;
  }
  if (!pcm.length) throw { code: "error", message: "The voice returned no sound." } satisfies SpeakFailure;
  remember(key, pcm);
  return pcm;
}

export type LiveDub = {
  /** Speaks a line, replacing whatever is playing. `id` dedupes repeats. */
  speak: (id: string, text: string) => void;
  /** Warms the cache for the line that comes next, without playing it. */
  prefetch: (text: string) => void;
  /** Stops immediately and forgets the current line. */
  stop: () => void;
  /** Releases the audio device. */
  dispose: () => void;
};

export function createLiveDub(opts: {
  mindId: string;
  lang: LangCode;
  onSpeaking: (speaking: boolean) => void;
  onFailure: (failure: SpeakFailure) => void;
  /** Answers "is this line still the one on screen?" just before playback. */
  stillCurrent: (id: string) => boolean;
}): LiveDub {
  let ctx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let controller: AbortController | null = null;
  let currentId: string | null = null;
  let disposed = false;

  const context = () => {
    if (ctx) return ctx;
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor({ sampleRate: SAMPLE_RATE });
    return ctx;
  };

  const stopSound = () => {
    if (source) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* already finished */
      }
      source = null;
    }
  };

  const stop = () => {
    controller?.abort();
    controller = null;
    currentId = null;
    stopSound();
    opts.onSpeaking(false);
  };

  const speak = (id: string, text: string) => {
    if (disposed || !text.trim() || id === currentId) return;
    controller?.abort();
    stopSound();
    currentId = id;
    const ac = new AbortController();
    controller = ac;
    void (async () => {
      try {
        const pcm = await fetchLine(opts.mindId, text, opts.lang, ac.signal);
        // The picture may have moved on while the voice was being prepared —
        // skipping is always better than talking over the next line.
        if (ac.signal.aborted || disposed || !opts.stillCurrent(id)) return;
        const audio = context();
        if (!audio) return;
        if (audio.state === "suspended") await audio.resume().catch(() => {});
        const buffer = audio.createBuffer(1, pcm.length, SAMPLE_RATE);
        buffer.getChannelData(0).set(pcm);
        const node = audio.createBufferSource();
        node.buffer = buffer;
        node.connect(audio.destination);
        node.onended = () => {
          if (source === node) {
            source = null;
            opts.onSpeaking(false);
          }
        };
        stopSound();
        source = node;
        opts.onSpeaking(true);
        node.start();
      } catch (err) {
        if (ac.signal.aborted || disposed) return;
        opts.onSpeaking(false);
        const failure = err as SpeakFailure;
        opts.onFailure(
          failure && typeof failure === "object" && "code" in failure
            ? failure
            : { code: "error", message: "The voice could not speak this line." },
        );
      }
    })();
  };

  const prefetch = (text: string) => {
    if (disposed || !text.trim()) return;
    if (audioCache.has(cacheKey(opts.mindId, opts.lang, text))) return;
    const ac = new AbortController();
    void fetchLine(opts.mindId, text, opts.lang, ac.signal).catch(() => undefined);
  };

  return {
    speak,
    prefetch,
    stop,
    dispose: () => {
      disposed = true;
      stop();
      void ctx?.close().catch(() => undefined);
      ctx = null;
    },
  };
}
