import { useDisplayText } from "@/lib/i18n";

/**
 * Renders an English source string (a mined title, topic tag, note or log line)
 * in the viewer's active language. The stored data itself is never mutated —
 * this is the display layer only.
 */
export function Localized({ text, className }: { text: string | null | undefined; className?: string }) {
  const shown = useDisplayText(text);
  return <span className={className}>{shown}</span>;
}
