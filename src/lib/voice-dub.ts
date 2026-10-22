import type { LangCode } from "@/lib/languages";
import { apiFetch } from "@/lib/api-fetch";
import type { AvatarEmotion } from "@/lib/emotion";

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
  /** Persona's real cloned voice id, when the owner has built one. */
  voiceId?: string;
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
          voiceId: opts.voiceId,
        }),
        signal: controller.signal,
      });
      if (stopped) return;

      if (!res.ok || !res.body) {
        let message = `Voice dubbing failed (${res.status}).`;
        let code = "";
        try {
          const data = (await res.json()) as { error?: string; code?: string };
          if (data.error) message = data.error;
          code = data.code ?? "";
        } catch {
          /* non-JSON error body */
        }
        // Free path: whatever went wrong above (no cloned voice, no voice
        // credit, a busy AI key), the reply must still be heard — the phone's
        // own built-in voice speaks it, at no cost to anyone.
        void code;
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          const utter = new SpeechSynthesisUtterance(opts.text);
          const bcp47 = opts.lang === "mn" ? "mn-MN" : opts.lang === "ko" ? "ko-KR" : "en-US";
          let voices = window.speechSynthesis.getVoices();
          if (voices.length === 0) {
            // Voices load lazily on first use, especially on phones.
            await new Promise<void>((resolve) => {
              const t = setTimeout(resolve, 1200);
              window.speechSynthesis.onvoiceschanged = () => { clearTimeout(t); resolve(); };
            });
            voices = window.speechSynthesis.getVoices();
          }
          if (stopped) return;
          const match = voices.find((v) => v.lang.toLowerCase().startsWith(opts.lang));
          if (match) {
            utter.voice = match;
            utter.lang = match.lang;
          } else {
            // No voice for this language on the device: speak with the
            // default voice rather than staying silent.
            const fallback = voices.find((v) => v.default) ?? voices[0];
            if (fallback) {
              utter.voice = fallback;
              utter.lang = fallback.lang;
            } else {
              utter.lang = bcp47;
            }
          }
          let mouth = 0;
          opts.onStart?.();
          const animate = () => {
            if (stopped) return;
            mouth = mouth > 0.4 ? 0.15 : 0.75;
            opts.onViseme?.(mouth);
            raf = window.setTimeout(animate, 140) as unknown as number;
          };
          animate();
          await new Promise<void>((resolve) => {
            utter.onend = () => resolve();
            utter.onerror = () => { clearInterval(watch); resolve(); };
            window.speechSynthesis.speak(utter);
            // A stop() during speech cancels the utterance.
            const watch = setInterval(() => {
              if (stopped) {
                window.speechSynthesis.cancel();
                clearInterval(watch);
                resolve();
              }
            }, 150);
            utter.onend = () => {
              clearInterval(watch);
              resolve();
            };
          });
          window.clearTimeout(raf);
          opts.onViseme?.(0);
          return;
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
      if (stopped || !ctx) return;

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
          const v = ((frame[i] ?? 128) - 128) / 128;
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
      window.clearTimeout(raf);
      cancelAnimationFrame(raf);
      window.speechSynthesis?.cancel();
      void ctx?.close().catch(() => {});
      ctx = null;
      opts.onViseme?.(0);
    },
    done,
  };
}
