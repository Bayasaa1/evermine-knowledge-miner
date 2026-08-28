import type { LangCode } from "@/lib/languages";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Native voice dubbing playback.
 *
 * Streams the cloned-voice PCM from /api/mind-voice, plays it as it arrives and
 * reports a live mouth-openness value (0..1) derived from the waveform so the
 * video avatar can be lip-synced to the dubbed audio in real time.
 */
export type DubHandle = {
  stop: () => void;
  done: Promise<void>;
};

const SAMPLE_RATE = 24000;

export function startDub(opts: {
  mindId: string;
  text: string;
  lang: LangCode;
  /** Active emotion tag so the voice engine can shift pitch and tone. */
  emotion?: AvatarEmotion;
  onViseme?: (openness: number) => void;
  onStart?: () => void;
  onError?: (message: string) => void;
}): DubHandle {
  const controller = new AbortController();
  let stopped = false;
  let ctx: AudioContext | null = null;
  let raf = 0;

  const done = (async () => {
    try {
      const res = await apiFetch("/api/mind-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mindId: opts.mindId,
          text: opts.text,
          lang: opts.lang,
          emotion: opts.emotion,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        let message = `Voice dubbing failed (${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* non-JSON error body */
        }
        opts.onError?.(message);
        return;
      }

      const AudioCtor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        opts.onError?.("This browser cannot play dubbed audio.");
        return;
      }

      ctx = new AudioCtor({ sampleRate: SAMPLE_RATE });
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      analyser.connect(ctx.destination);
      const frame = new Uint8Array(analyser.fftSize);

      const tick = () => {
        if (stopped || !ctx) return;
        analyser.getByteTimeDomainData(frame);
        let sum = 0;
        for (let i = 0; i < frame.length; i++) {
          const v = (frame[i]! - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / frame.length);
        opts.onViseme?.(Math.min(1, rms * 5.5));
        raf = requestAnimationFrame(tick);
      };

      let playhead = 0;
      let pending = new Uint8Array(0);
      let started = false;

      const pushChunk = (incoming: Uint8Array) => {
        if (!ctx || stopped) return;
        const bytes = new Uint8Array(pending.length + incoming.length);
        bytes.set(pending);
        bytes.set(incoming, pending.length);
        const usable = bytes.length - (bytes.length % 2);
        pending = bytes.slice(usable);
        if (usable === 0) return;
        const samples = new Int16Array(bytes.buffer, 0, usable / 2);
        const floats = Float32Array.from(samples, (s) => s / 32768);
        const buffer = ctx.createBuffer(1, floats.length, SAMPLE_RATE);
        buffer.copyToChannel(floats, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        if (playhead === 0) playhead = ctx.currentTime + 0.08;
        else playhead = Math.max(playhead, ctx.currentTime);
        source.start(playhead);
        playhead += buffer.duration;
        if (!started) {
          started = true;
          opts.onStart?.();
          raf = requestAnimationFrame(tick);
        }
      };

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      while (!stopped) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload) as { type?: string; audio?: string };
            if (evt.type !== "speech.audio.delta" || !evt.audio) continue;
            const binary = atob(evt.audio);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            pushChunk(bytes);
          } catch {
            /* ignore keep-alive fragments */
          }
        }
      }

      // Let scheduled audio finish playing before tearing the context down.
      const remaining = ctx ? Math.max(0, playhead - ctx.currentTime) : 0;
      await new Promise((r) => setTimeout(r, remaining * 1000 + 120));
    } catch (e) {
      if (!controller.signal.aborted) {
        opts.onError?.(e instanceof Error ? e.message : "Voice dubbing failed.");
      }
    } finally {
      stopped = true;
      cancelAnimationFrame(raf);
      opts.onViseme?.(0);
      void ctx?.close().catch(() => {});
      ctx = null;
    }
  })();

  return {
    stop: () => {
      stopped = true;
      controller.abort();
    },
    done,
  };
}
