import { Languages, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useLang } from "@/lib/i18n";
import { LANGUAGES, LANG_LIST } from "@/lib/languages";

type Props = {
  /** Floating pill (default) or an inline trigger inside another toolbar. */
  variant?: "floating" | "inline";
  className?: string;
};

/**
 * Global 20-language switcher. Writes to the shared language store, so every
 * open tab (Mining, Vaults, Feed, Profile, Settings) re-renders instantly.
 */
export function LanguageSelector({ variant = "floating", className = "" }: Props) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div
      ref={ref}
      // The phone status bar / Dynamic Island used to sit on top of this pill,
      // which swallowed the tap. Push it below the safe area and above the feed.
      style={variant === "floating" ? { top: "calc(env(safe-area-inset-top) + 0.75rem)" } : undefined}
      className={`${variant === "floating" ? "fixed right-3 z-[70]" : "relative"} ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change language"
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 text-xs font-medium text-foreground shadow-sm backdrop-blur-md transition-colors hover:bg-muted"
      >
        <Languages className="h-4 w-4 text-primary" />
        {LANGUAGES[lang].native}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 max-h-[60vh] w-56 overflow-y-auto rounded-[12px] border border-border bg-card/95 shadow-xl backdrop-blur-xl">
          {LANG_LIST.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm ${
                l.code === lang ? "bg-primary/15 text-primary" : "text-foreground hover:bg-muted"
              }`}
            >
              <span>
                {l.native}
                <span className="ml-2 text-[11px] text-muted-foreground">{l.name}</span>
              </span>
              {l.code === lang && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
