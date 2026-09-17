/**
 * The "AI 100%" button and its slider, shared by every chat surface.
 *
 * The level is remembered per mind on this device and never goes above the
 * maximum the mind's owner allows.
 */
import { clampLevel, levelCapNote, levelHint, levelTitle, saveAiLevel } from "@/lib/ai-level";
import type { Lang } from "@/lib/i18n";

export function AiLevelButton({
  level,
  open,
  onToggle,
}: {
  level: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="AI usage"
      aria-expanded={open}
      className="shrink-0 rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
    >
      AI {level}%
    </button>
  );
}

export function AiLevelSlider({
  mindId,
  level,
  max = 100,
  lang,
  onChange,
}: {
  mindId: string | null;
  level: number;
  max?: number;
  lang: Lang;
  onChange: (level: number) => void;
}) {
  const cap = clampLevel(max);
  return (
    <div className="border-b border-border bg-muted/30 p-4">
      <p className="mb-2 text-[11px] font-medium text-foreground">{levelTitle(lang)}</p>
      <input
        type="range"
        min={0}
        max={cap}
        step={10}
        value={Math.min(level, cap)}
        aria-label={levelTitle(lang)}
        onChange={(e) => {
          const v = clampLevel(e.target.value);
          onChange(v);
          saveAiLevel(mindId, v);
        }}
        className="w-full accent-[hsl(var(--primary))]"
      />
      <p className="mt-2 text-[11px] text-muted-foreground">{levelHint(Math.min(level, cap), lang)}</p>
      {cap < 100 && <p className="mt-1 text-[11px] text-muted-foreground">{levelCapNote(cap, lang)}</p>}
    </div>
  );
}
