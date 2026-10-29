import { memo, useEffect, useRef, useState } from "react";
import { ExternalLink, Pause, Play, RotateCcw, RotateCw, SkipBack, SkipForward } from "lucide-react";

/**
 * TikTok-style YouTube stage. Plays the video straight from YouTube's Iframe
 * player — nothing is downloaded or re-hosted — and reports playback time so the
 * feed can show mined timestamps and emotion tags live alongside the video.
 */

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
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

function YouTubeStageImpl({
  videoId,
  active,
  muted,
  paused,
  duck,
  onTime,
  onToggle,
  onSeekRef,
  onBlocked,
  onPrev,
  onNext,
}: {
  /** Jump to the previous / next video of the same project (creator's order). */
  onPrev?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  videoId: string;
  active: boolean;
  muted: boolean;
  paused: boolean;
  /** Drop the original sound to a quiet background while a translated voice speaks. */
  duck?: boolean;
  onTime?: (seconds: number, duration: number) => void;
  onToggle?: () => void;
  /** Hands the parent a jump-to-second function so the feed can show a scrubber. */
  onSeekRef?: (seek: ((seconds: number) => void) | null) => void;
  /** YouTube refuses to play some videos outside its own site (age limits,
      embedding turned off). The feed drops those videos instead of showing an error. */
  onBlocked?: () => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const [ready, setReady] = useState(false);
  /** True only while frames are actually moving. Any other moment YouTube
      paints its own title bar, logo and video grid, so we cover the frame. */
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // Blocked videos now show a fallback card in place; the feed keeps them.
  void onBlocked;

  activeRef.current = active;
  pausedRef.current = paused;


  useEffect(() => {
    let cancelled = false;
    void loadApi()
      .then((YT) => {
        if (cancelled || !holder.current || player.current) return;
        // Build the frame ourselves: YouTube's mobile player paints its own
        // prev / ⟲10 / pause / 10⟳ / next buttons when it sees `playlist` or
        // `origin` in the address, which doubled our controls. Looping is
        // handled in onStateChange below instead.
        const frame = document.createElement("iframe");
        const origin = encodeURIComponent(window.location.origin);
        frame.src =
          `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&autoplay=1&mute=1&controls=0` +
          `&disablekb=1&fs=0&iv_load_policy=3&rel=0&modestbranding=1&playsinline=1&origin=${origin}`;
        frame.allow = "autoplay; encrypted-media; picture-in-picture";
        frame.setAttribute("frameborder", "0");
        holder.current.replaceChildren(frame);
        player.current = new YT.Player(frame as unknown as HTMLElement, {
          events: {
            onReady: (e: { target: YTPlayer }) => {
              if (cancelled) return;
              e.target.mute();
              setReady(true);
            },
            onStateChange: (e: { data: number; target: YTPlayer }) => {
              if (cancelled) return;
              setPlaying(e.data === 1);
              // YouTube shows recommendation cards when playback ends. Restart
              // immediately so the feed remains an Evermind-controlled loop.
              if (e.data !== 0) return;
              e.target.seekTo(0, true);
              if (activeRef.current && !pausedRef.current) e.target.playVideo();
            },
            onError: () => {
              // Show a clean fallback card instead of YouTube's black error screen.
              if (cancelled) return;
              setFailed(true);
              try { player.current?.destroy(); } catch { /* already gone */ }
              player.current = null;
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
  const duckRef = useRef(duck);
  duckRef.current = duck;

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
          p.setVolume(duckRef.current ? 18 : 100);
        }, 400);
        return () => window.clearTimeout(restore);
      }
    } else {
      p.pauseVideo();
      // Belt and braces: also send the raw IFrame API command, in case the
      // wrapper lost its handle. The frame stays mounted while paused.
      const frame = holder.current?.querySelector("iframe");
      frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: "" }), "*");
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

  useEffect(() => {
    if (!onSeekRef) return;
    onSeekRef(ready ? (seconds: number) => player.current?.seekTo(seconds, true) : null);
    return () => onSeekRef(null);
  }, [ready, onSeekRef]);

  // Facebook-style centre controls: a tap shows ⟲10 / play-pause / 10⟳,
  // they fade after 3 seconds while playing and stay while paused.
  const [showUi, setShowUi] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const flashUi = () => {
    setShowUi(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowUi(false), 3000);
  };
  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);
  // YouTube's phone player paints its own round pause button in the centre for
  // ~6s whenever playback starts. Keep our row up (with an opaque centre button
  // of the same size) for that window so theirs is always covered.
  useEffect(() => {
    if (!playing) return;
    setShowUi(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowUi(false), 7000);
  }, [playing]);
  const skip = (delta: number) => {
    const p = player.current;
    if (p) {
      const dur = typeof p.getDuration === "function" ? p.getDuration() : 0;
      const next = Math.max(0, p.getCurrentTime() + delta);
      p.seekTo(dur ? Math.min(next, dur - 1) : next, true);
    }
    flashUi();
  };


  if (failed) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-black">
        <img
          src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
          alt=""
          className="h-full w-full object-cover opacity-80"
        />
        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 z-[6] flex items-center justify-center"
        >
          <span className="flex items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
            <ExternalLink className="h-4 w-4" /> Watch on YouTube
          </span>
        </a>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* YouTube paints its own title bar, channel avatar and "More videos"
          strip inside the frame. Blow the frame up slightly and clip it, so
          those bands fall outside the visible picture. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          ref={holder}
          className="absolute inset-x-0 top-1/2 h-[160%] w-full -translate-y-1/2 [&>iframe]:h-full [&>iframe]:w-full"
        />
      </div>
      {/* While paused, YouTube paints its own logo and "More videos" grid over
          the frame. Cover it with the still image so the stage stays ours. */}
      {!playing && (
        <div
          className="pointer-events-none absolute inset-0 z-[4] bg-neutral-950 bg-cover bg-center"
          style={{ backgroundImage: `url(https://i.ytimg.com/vi/${videoId}/hqdefault.jpg)` }}
        />
      )}
      <button
        type="button"
        aria-label="Show controls"
        onClick={() => {
          if (showUi && !paused) setShowUi(false);
          else flashUi();
        }}
        className="absolute inset-0 z-[6] h-full w-full"
      />
      {(showUi || paused) && (
        <div
          className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center gap-2.5 px-2"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {onPrev && (
            <button
              type="button"
              aria-label="Previous video in project"
              onClick={(e) => { e.stopPropagation(); onPrev(); flashUi(); }}
              className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/75 text-white backdrop-blur-sm"
            >
              <SkipBack className="h-4 w-4 fill-current" />
            </button>
          )}
          <button
            type="button"
            aria-label="Back 10 seconds"
            onClick={(e) => { e.stopPropagation(); skip(-10); }}
            className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/75 text-white backdrop-blur-sm"
          >
            <RotateCcw className="h-5 w-5" />
            <span className="absolute text-[9px] font-bold">10</span>
          </button>
          <button
            type="button"
            aria-label={paused ? "Play video" : "Pause video"}
            onClick={(e) => { e.stopPropagation(); onToggle?.(); flashUi(); }}
            className="pointer-events-auto flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-black text-white"
          >
            {paused ? <Play className="h-6 w-6 fill-current" /> : <Pause className="h-6 w-6 fill-current" />}
          </button>
          <button
            type="button"
            aria-label="Forward 10 seconds"
            onClick={(e) => { e.stopPropagation(); skip(10); }}
            className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/75 text-white backdrop-blur-sm"
          >
            <RotateCw className="h-5 w-5" />
            <span className="absolute text-[9px] font-bold">10</span>
          </button>
          {onNext && (
            <button
              type="button"
              aria-label="Next video in project"
              onClick={(e) => { e.stopPropagation(); onNext(); flashUi(); }}
              className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/75 text-white backdrop-blur-sm"
            >
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type StageProps = Parameters<typeof YouTubeStageImpl>[0] & {
  /** Direct video file (uploaded / camera-recorded). When set, a native <video> plays instead of YouTube. */
  videoUrl?: string | null;
  /** Cover picture for the native video. */
  posterUrl?: string | null;
};

/** True for direct video files (.mp4/.mov/.webm or storage URLs). */
export function isNativeVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url) || /\/storage\/v1\/object\//.test(url) || url.startsWith("blob:");
}

function NativeStage({
  videoUrl, posterUrl, active, muted, paused, duck, onTime, onToggle, onSeekRef, onPrev, onNext,
}: StageProps & { videoUrl: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [showUi, setShowUi] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const lastTap = useRef(0);
  const flashUi = () => {
    setShowUi(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowUi(false), 3000);
  };
  useEffect(() => () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); }, []);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    v.muted = muted;
    v.volume = duck ? 0.18 : 1;
  }, [muted, duck]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active && !paused) {
      void v.play().catch(() => {
        // Autoplay with sound blocked: retry muted.
        v.muted = true;
        void v.play().catch(() => undefined);
      });
    } else v.pause();
  }, [active, paused]);

  useEffect(() => {
    if (!onSeekRef) return;
    onSeekRef((s: number) => { if (video.current) video.current.currentTime = s; });
    return () => onSeekRef(null);
  }, [onSeekRef]);

  const skip = (delta: number) => {
    const v = video.current;
    if (v) v.currentTime = Math.max(0, Math.min((v.duration || Infinity) - 0.5, v.currentTime + delta));
    flashUi();
  };

  const btn = "pointer-events-auto flex shrink-0 items-center justify-center rounded-full bg-black/75 text-white backdrop-blur-sm";
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video
        ref={video}
        src={videoUrl}
        poster={posterUrl ?? undefined}
        playsInline
        preload="metadata"
        loop
        muted={muted}
        onTimeUpdate={(e) => onTime?.(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        onLoadedMetadata={(e) => onTime?.(e.currentTarget.currentTime, e.currentTarget.duration || 0)}
        className="h-full w-full object-cover md:object-contain"
      />
      <button
        type="button"
        aria-label="Show controls"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const now = Date.now();
          const rect = e.currentTarget.getBoundingClientRect();
          if (now - lastTap.current < 300) {
            // Double-tap: left half rewinds, right half skips forward.
            skip(e.clientX - rect.left < rect.width / 2 ? -10 : 10);
            lastTap.current = 0;
            return;
          }
          lastTap.current = now;
          if (showUi && !paused) setShowUi(false);
          else flashUi();
        }}
        className="absolute inset-0 z-[6] h-full w-full"
      />
      {(showUi || paused) && (
        <div
          className="pointer-events-none absolute inset-0 z-[7] flex items-center justify-center gap-2.5 px-2"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {onPrev && (
            <button type="button" aria-label="Previous video in project" onClick={(e) => { e.stopPropagation(); onPrev(); flashUi(); }} className={`${btn} h-9 w-9`}>
              <SkipBack className="h-4 w-4 fill-current" />
            </button>
          )}
          <button type="button" aria-label="Back 10 seconds" onClick={(e) => { e.stopPropagation(); skip(-10); }} className={`${btn} h-10 w-10`}>
            <RotateCcw className="h-5 w-5" />
            <span className="absolute text-[9px] font-bold">10</span>
          </button>
          <button type="button" aria-label={paused ? "Play video" : "Pause video"} onClick={(e) => { e.stopPropagation(); onToggle?.(); flashUi(); }} className="pointer-events-auto flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-black text-white">
            {paused ? <Play className="h-6 w-6 fill-current" /> : <Pause className="h-6 w-6 fill-current" />}
          </button>
          <button type="button" aria-label="Forward 10 seconds" onClick={(e) => { e.stopPropagation(); skip(10); }} className={`${btn} h-10 w-10`}>
            <RotateCw className="h-5 w-5" />
            <span className="absolute text-[9px] font-bold">10</span>
          </button>
          {onNext && (
            <button type="button" aria-label="Next video in project" onClick={(e) => { e.stopPropagation(); onNext(); flashUi(); }} className={`${btn} h-9 w-9`}>
              <SkipForward className="h-4 w-4 fill-current" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StageSwitch(props: StageProps) {
  const { videoUrl, posterUrl, ...rest } = props;
  void posterUrl;
  if (videoUrl) return <NativeStage {...props} videoUrl={videoUrl} />;
  return <YouTubeStageImpl {...rest} />;
}

/** Memoized so unrelated card updates never reload the player. Plays YouTube ids or native video files. */
export const YouTubeStage = memo(StageSwitch);
