import { useEffect, useRef } from "react";

/**
 * setInterval that only runs while the tab is actually visible.
 *
 * Background tabs used to keep polling every few seconds — draining battery,
 * data and server time for a screen nobody was looking at. When the tab comes
 * back the callback fires once immediately so the view is never stale.
 */
export function useVisibleInterval(callback: () => void, delayMs: number, enabled = true): void {
  const cb = useRef(callback);
  cb.current = callback;

  useEffect(() => {
    if (!enabled || delayMs <= 0 || typeof document === "undefined") return;
    let id: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (id !== null) clearInterval(id);
      id = null;
    };
    const start = () => {
      if (id !== null) return;
      id = setInterval(() => cb.current(), delayMs);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        cb.current();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [delayMs, enabled]);
}
