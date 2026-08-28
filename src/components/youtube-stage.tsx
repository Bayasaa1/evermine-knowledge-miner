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
  getCurrentTime: () => number;
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
  onTime,
  onToggle,
}: {
  videoId: string;
  active: boolean;
  muted: boolean;
  paused: boolean;
  onTime?: (seconds: number) => void;
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
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            loop: 1,
            playlist: videoId,
          },
          events: { onReady: () => !cancelled && setReady(true) },
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
    };
  }, [videoId]);

  useEffect(() => {
    const p = player.current;
    if (!ready || !p) return;
    if (muted) p.mute();
    else p.unMute();
  }, [muted, ready]);

  useEffect(() => {
    const p = player.current;
    if (!ready || !p) return;
    if (active && !paused) p.playVideo();
    else p.pauseVideo();
  }, [active, paused, ready]);

  useEffect(() => {
    if (!ready || !active || !onTime) return;
    const id = window.setInterval(() => {
      const p = player.current;
      if (p) onTime(p.getCurrentTime());
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
