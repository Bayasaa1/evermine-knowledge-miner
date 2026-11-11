export type MentionChoice = { mindId: string; name: string; kind: "persona" | "project"; inRoom?: boolean };
export type MentionTrigger = "@" | "#";

/** Returns the active mention being typed at the caret: "@" = people, "#" = projects. Null when none. */
export function activeMention(text: string, caret: number): { start: number; query: string; trigger: MentionTrigger } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  const hash = before.lastIndexOf("#");
  const pos = Math.max(at, hash);
  if (pos < 0 || (pos > 0 && !/\s/.test(before[pos - 1] ?? ""))) return null;
  const query = before.slice(pos + 1);
  if (query.length > 40 || /\n/.test(query)) return null;
  return { start: pos, query, trigger: before[pos] as MentionTrigger };
}

/** Deterministic ranking: room Minds, then recent, then prefix > word-prefix > contains. Max `limit`. */
export function rankMentions(choices: MentionChoice[], query: string, recent: string[] = [], limit = 8): MentionChoice[] {
  const q = query.trim().toLowerCase();
  const scored: { c: MentionChoice; s: number; i: number }[] = [];
  choices.forEach((c, i) => {
    const n = c.name.toLowerCase();
    let s: number;
    if (!q) s = 0;
    else if (n.startsWith(q)) s = 300;
    else if (n.split(/[\s&\-·,]+/).some((w) => w.startsWith(q))) s = 200;
    else if (n.includes(q)) s = 100;
    else return;
    if (c.inRoom) s += 50;
    const r = recent.indexOf(c.mindId);
    if (r >= 0) s += 40 - Math.min(r, 39);
    scored.push({ c, s, i });
  });
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).slice(0, limit).map((x) => x.c);
}

export function insertMention(text: string, start: number, caret: number, name: string, trigger: MentionTrigger = "@"): { text: string; caret: number } {
  const ins = `${trigger}${name} `;
  return { text: text.slice(0, start) + ins + text.slice(caret), caret: start + ins.length };
}

const KEY = "evermind:recent-mentions";
export function recentMentions(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]").slice(0, 20); } catch { return []; }
}
export function rememberMention(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify([id, ...recentMentions().filter((x) => x !== id)].slice(0, 20))); } catch { /* ignore */ }
}
