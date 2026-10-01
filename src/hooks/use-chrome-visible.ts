import { useEffect, useState } from "react";

/**
 * Shared "are the on-screen controls showing?" flag.
 *
 * The feed hides every control after a few idle seconds so only the video is
 * left on screen. The bottom dock and the language button live outside the
 * feed card, so they listen to this event instead of taking a prop.
 */
const EVENT = "evermind:chrome";

export function setChromeVisible(visible: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: visible }));
}

export function useChromeVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = (event: Event) => setVisible(!!(event as CustomEvent).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return visible;
}
