/**
 * Pre-mining assessment. Three quick answers that are injected straight into
 * the Gemini system prompt so extraction is tailored to the video.
 */
import { useState } from "react";
import { ClipboardList, Sparkles } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import {
  DEFAULT_ASSESSMENT,
  PRIMARY_FOCUSES,
  VIDEO_CONTEXTS,
  type Assessment,
} from "@/lib/mining-jobs";

const copy = {
  en: {
    title: "Before we mine — 3 quick questions",
    sub: "Your answers steer the AI so it extracts what actually matters to you.",
    context: "1. Video context",
    focus: "2. Primary focus",
    custom: "3. Custom analysis instructions",
    customPlaceholder: "e.g. Focus on the defensive shape and the coach's tactical calls.",
    start: "Start mining",
  },
  mn: {
    title: "Шинжилгээний өмнө — 3 богино асуулт",
    sub: "Таны хариулт AI-д яг хэрэгтэй мэдээллийг задлан авахад чиглүүлнэ.",
    context: "1. Видеоны төрөл",
    focus: "2. Гол анхаарах зүйл",
    custom: "3. Нэмэлт зааварчилгаа",
    customPlaceholder: "жишээ нь: Хамгаалалтын бүтэц, дасгалжуулагчийн шийдвэрт анхаараарай.",
    start: "Шинжилгээ эхлүүлэх",
  },
} as const;

export function MiningWizard({
  lang,
  value,
  onChange,
  onStart,
  busy,
}: {
  lang: Lang;
  value?: Assessment;
  onChange?: (a: Assessment) => void;
  onStart: (a: Assessment) => void;
  busy?: boolean;
}) {
  const t = copy[lang];
  const [local, setLocal] = useState<Assessment>(value ?? DEFAULT_ASSESSMENT);
  const state = value ?? local;

  const update = (patch: Partial<Assessment>) => {
    const next = { ...state, ...patch };
    setLocal(next);
    onChange?.(next);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ClipboardList className="h-4 w-4 text-primary" /> {t.title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.context}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {VIDEO_CONTEXTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update({ videoContext: c })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                state.videoContext === c
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.focus}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRIMARY_FOCUSES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => update({ primaryFocus: f })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                state.primaryFocus === f
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.custom}</span>
        <textarea
          value={state.customInstructions}
          onChange={(e) => update({ customInstructions: e.target.value.slice(0, 2000) })}
          rows={3}
          placeholder={t.customPlaceholder}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
      </label>

      <button
        type="button"
        onClick={() => onStart(state)}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <Sparkles className="h-4 w-4" /> {t.start}
      </button>
    </div>
  );
}
