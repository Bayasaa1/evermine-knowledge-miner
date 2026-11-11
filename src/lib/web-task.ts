/**
 * Phase 4 web task (human-in-the-loop). When the viewer asks the Mind to put
 * its result onto a website, the reply's field map becomes a step card: the
 * app opens the site and hands over each value; login, OTP/token and the
 * final submit are always done by the person, never automatically.
 */
import { isSafeEndpoint } from "./safe-endpoint";
import { extractUrls } from "./chat-attach";

const ACT = /\b(submit|send|upload|attach|fill( in)?|file (it|my|the)|enter (it|them))\b|илгээ|оруул|бөглө|хавсарг|тушаа|байршуул|제출|보내|업로드|첨부|입력/i;

export type WebTask = { url: string; host: string };
export type FieldRow = { field: string; value: string; source: string };

export function detectWebTask(text: string): WebTask | null {
  const asked = text.replace(/\[\[(file|link):[\s\S]*?\[\[\/(file|link)\]\]/g, " ");
  if (!ACT.test(asked)) return null;
  const url = extractUrls(asked)[0];
  if (!url || !isSafeEndpoint(url)) return null;
  try { return { url, host: new URL(url).hostname }; } catch { return null; }
}

/** Rows of the first markdown table whose first column is a field and second a value. */
export function parseFieldMap(reply: string): FieldRow[] {
  const rows: FieldRow[] = [];
  let header = true;
  for (const line of reply.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) { if (rows.length) break; header = true; continue; }
    const cells = t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replace(/\*\*/g, ""));
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) { header = false; continue; }
    if (header || cells.length < 2 || !cells[0]) continue;
    rows.push({ field: cells[0], value: cells[1] ?? "", source: cells[2] ?? "" });
  }
  return rows;
}

/** CSV the person can attach on the site; values with "?" stay visible. */
export function fieldsCsv(rows: FieldRow[]): string {
  const q = (s: string) => `"${(/^[=+@\-\t\r\n]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
  return ["Field,Value,Source", ...rows.map((r) => [r.field, r.value, r.source].map(q).join(","))].join("\n");
}

export const missingValues = (rows: FieldRow[]) => rows.filter((r) => !r.value || r.value.includes("?")).length;
