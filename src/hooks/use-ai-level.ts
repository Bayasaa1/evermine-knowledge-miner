import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api-fetch";
import { clampLevel, DEFAULT_AI_LEVEL, loadAiLevel } from "@/lib/ai-level";

/**
 * The AI level for one mind: what this device remembers, capped by whatever the
 * mind's owner allows.
 */
export function useMindAiLevel(mindId: string | null) {
  const [level, setLevel] = useState(DEFAULT_AI_LEVEL);
  const [max, setMax] = useState(100);

  useEffect(() => {
    let cancelled = false;
    setLevel(loadAiLevel(mindId));
    setMax(100);
    if (!mindId) return;
    void (async () => {
      try {
        const res = await apiFetch(`/api/mind-level?mindId=${encodeURIComponent(mindId)}`);
        const data = (await res.json()) as { default?: number; max?: number };
        if (cancelled) return;
        const cap = clampLevel(data.max ?? 100);
        setMax(cap);
        setLevel((current) => Math.min(current, cap));
      } catch {
        /* the owner's limit is enforced on the server anyway */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mindId]);

  return { level, setLevel, max };
}
