import { useEffect, useRef, useState } from "react";

/**
 * Streaming tiers, best to worst.
 * - `hd`     : full HD video call (video backdrop + avatar video layer)
 * - `voice`  : audio-reactive avatar only (video layers dropped, lip-sync kept)
 * - `audio`  : voice-only, no motion — cheapest possible call
 */
export type StreamTier = "hd" | "voice" | "audio";

export const TIER_LABEL: Record<StreamTier, string> = {
  hd: "Full HD video",
  voice: "Audio-reactive avatar",
  audio: "Voice only",
};

/** Latency thresholds in ms. Above 200ms we drop out of full HD. */
export const LATENCY_HD_MAX = 200;
export const LATENCY_VOICE_MAX = 500;

export type NetworkQuality = {
  /** Smoothed round-trip latency in ms (null before the first probe). */
  latency: number | null;
  /** Tier the network can currently sustain. */
  tier: StreamTier;
  /** True when the last probe failed outright. */
  offline: boolean;
  /** Effective connection type from the Network Information API, when available. */
  effectiveType: string | null;
  /** User asked the OS/browser to reduce data usage. */
  saveData: boolean;
};

function connection(): any {
  if (typeof navigator === "undefined") return null;
  return (navigator as any).connection ?? (navigator as any).mozConnection ?? null;
}

export function tierForLatency(latency: number | null, opts?: { saveData?: boolean; effectiveType?: string | null }): StreamTier {
  if (opts?.saveData) return "audio";
  const et = opts?.effectiveType;
  if (et === "slow-2g" || et === "2g") return "audio";
  if (latency === null) return "hd";
  if (latency <= LATENCY_HD_MAX) return et === "3g" ? "voice" : "hd";
  if (latency <= LATENCY_VOICE_MAX) return "voice";
  return "audio";
}

/** One latency sample against the tiny `/api/public/ping` endpoint. */
export async function probeLatency(timeoutMs = 4000): Promise<number | null> {
  if (typeof window === "undefined") return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    await fetch(`/api/public/ping?t=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
    return Math.round(performance.now() - started);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Polls latency while `active`, smooths it, and derives the tier the call
 * should run at. Hysteresis: two consecutive bad samples downgrade, three
 * consecutive good samples upgrade — so a single spike never flaps the UI.
 */
export function useNetworkQuality(active: boolean, intervalMs = 4000): NetworkQuality {
  const [state, setState] = useState<NetworkQuality>({
    latency: null,
    tier: "hd",
    offline: false,
    effectiveType: null,
    saveData: false,
  });
  const smoothed = useRef<number | null>(null);
  const streak = useRef({ good: 0, bad: 0 });

  useEffect(() => {
    if (!active) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      const sample = await probeLatency();
      if (!alive) return;
      const conn = connection();
      const effectiveType: string | null = conn?.effectiveType ?? null;
      const saveData: boolean = Boolean(conn?.saveData);

      if (sample === null) {
        streak.current.bad += 1;
        streak.current.good = 0;
        setState((prev) => ({ ...prev, offline: true, tier: "audio", effectiveType, saveData }));
      } else {
        smoothed.current = smoothed.current === null ? sample : Math.round(smoothed.current * 0.6 + sample * 0.4);
        const latency = smoothed.current;
        const next = tierForLatency(latency, { saveData, effectiveType });
        if (next === "hd") {
          streak.current.good += 1;
          streak.current.bad = 0;
        } else {
          streak.current.bad += 1;
          streak.current.good = 0;
        }
        setState((prev) => {
          const downgrade = next !== "hd" && streak.current.bad >= 2;
          const upgrade = next === "hd" && streak.current.good >= 3;
          const tier = downgrade || upgrade || prev.latency === null ? next : prev.tier;
          return { latency, tier, offline: false, effectiveType, saveData };
        });
      }
      timer = setTimeout(run, intervalMs);
    };

    void run();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [active, intervalMs]);

  return state;
}
