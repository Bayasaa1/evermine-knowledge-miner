import { useEffect, useState } from "react";
import { translateChatDisplay } from "@/lib/chat-display-translation";

/**
 * Screen-only Google translation for lines currently on screen (subtitles).
 * No AI keys, no saved data. Untranslated lines fall back to the original.
 */
export function useScreenTranslations(texts: (string | null)[], lang: string | "source"): string[] {
  const [done, setDone] = useState<Record<string, string>>({});
  const joined = JSON.stringify(texts);
  useEffect(() => {
    if (lang === "source") return;
    let live = true;
    for (const text of texts) {
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
