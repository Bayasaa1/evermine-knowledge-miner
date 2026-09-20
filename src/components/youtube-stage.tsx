import { useEffect, useRef, useState } from "react";

/**
 * TikTok-style YouTube stage. Plays the video straight from YouTube's Iframe
 * player — nothing is downloaded or re-hosted — and reports playback time so the
 * feed can show mined timestamps and emotion tags live alongside the video.
 */

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration?: () => number;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}

export function YouTubeStage({
  videoId,
  active,
  muted,
  paused,
  duck,
  onTime,
  onToggle,
}: {
  videoId: string;
  active: boolean;
  muted: boolean;
  paused: boolean;
  /** Drop the original sound to a quiet background while a translated voice speaks. */
  duck?: boolean;
  onTime?: (seconds: number, duration: number) => void;
  onToggle?: () => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadApi()
      .then((YT) => {
        if (cancelled || !holder.current || player.current) return;
        player.current = new YT.Player(holder.current, {
          videoId,
          playerVars: {
            // Muted autoplay is the only form browsers allow without a gesture.
            autoplay: 1,
            mute: 1,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            loop: 1,
            playlist: videoId,
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (cancelled) return;
              e.target.mute();
              setReady(true);
            },
          },
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
    };
  }, [videoId]);

  // Mirror `muted` into a ref so the play/pause effect below never re-runs
  // (and re-mutes) when the viewer toggles sound — the unmute must stay inside
  // the tap gesture or mobile browsers silently block the audio.
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
    const p = player.current;
    if (!ready || !p) return;
    if (muted) p.mute();
    else {
      p.unMute();
      p.setVolume(duck ? 18 : 100);
    }
  }, [muted, duck, ready]);

  useEffect(() => {
    const p = player.current;
    if (!ready || !p) return;
    if (active && !paused) {
      // Always start muted so the browser cannot block autoplay. If the viewer
      // already asked for sound (a real tap earlier), restore it once rolling.
      p.mute();
      p.playVideo();
      if (!mutedRef.current) {
        const restore = window.setTimeout(() => {
          p.unMute();
          p.setVolume(100);
        }, 400);
        return () => window.clearTimeout(restore);
      }
    } else {
      p.pauseVideo();
    }
    return;
  }, [active, paused, ready]);


  useEffect(() => {
    if (!ready || !active || !onTime) return;
    const id = window.setInterval(() => {
      const p = player.current;
      if (p) onTime(p.getCurrentTime(), typeof p.getDuration === "function" ? p.getDuration() : 0);
    }, 500);
    return () => window.clearInterval(id);
  }, [ready, active, onTime]);

  return (
    <div className="absolute inset-0">
      <div className="pointer-events-none absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full">
        <div ref={holder} className="h-full w-full" />
      </div>
      <button
        type="button"
        aria-label={paused ? "Play video" : "Pause video"}
        onClick={onToggle}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
