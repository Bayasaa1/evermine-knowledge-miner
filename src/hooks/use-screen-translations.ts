import { useEffect, useState } from "react";
import { translateChatDisplay } from "@/lib/chat-display-translation";

/** How many lines ahead of the playing line are translated in advance. */
export const LOOKAHEAD_LINES = 25;
const WINDOW_STEP = 20;

/**
 * Screen-only Google translation for lines currently on screen (subtitles).
 * No AI keys, no saved data. Untranslated lines fall back to the original.
 *
 * Pass `focus` (the playing line) to translate only a lookahead window instead
 * of the whole video. The window moves in steps of 20 lines, so ordinary
 * playback triggers a new batch only every ~20 lines, never on every tick.
 */
export function useScreenTranslations(
  texts: (string | null)[],
  lang: string | "source",
  focus?: number,
): string[] {
  const [done, setDone] = useState<Record<string, string>>({});
  const from = focus === undefined ? 0 : Math.floor(Math.max(0, focus) / WINDOW_STEP) * WINDOW_STEP;
  const to = focus === undefined ? texts.length : from + WINDOW_STEP + LOOKAHEAD_LINES;
  const joined = JSON.stringify(texts.slice(from, to));
  useEffect(() => {
    if (lang === "source") return;
    let live = true;
    for (const text of texts.slice(from, to)) {
      if (!text?.trim()) continue;
      const k = `${lang}\u0000${text}`;
      if (done[k]) continue;
      void translateChatDisplay(text, lang, "screen")
        .then((out) => { if (live) setDone((d) => (d[k] ? d : { ...d, [k]: out })); })
        .catch(() => { /* keep original */ });
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, lang]);
  if (lang === "source") return texts.map((t) => t ?? "");
  return texts.map((t) => (t ? done[`${lang}\u0000${t}`] ?? t : ""));
}
