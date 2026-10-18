/** Short, safe @handle from a creator name: letters/digits only, max 24 chars. */
export function cleanHandle(name: string | null | undefined): string {
  const base = (name || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_]+/gu, "")
    .slice(0, 24);
  return `@${base || "creator"}`;
}

/** True when a handle looks like a pasted title/summary instead of a name. */
export function isBrokenHandle(handle: string): boolean {
  const h = handle.replace(/^@/, "");
  return h.length > 24 || /[\s,|.!?:;'"()]/.test(h);
}

/** True when a title looks like a cut-off AI summary rather than a real title. */
export function looksLikeSummaryTitle(title: string): boolean {
  const t = title.trim();
  return /^(the|this|in this|a) (creator|video|speaker|host|streamer)\b/i.test(t) || (t.length >= 55 && t.length <= 64 && /[a-z]$/.test(t) && !/[|#\-:]/.test(t));
}
