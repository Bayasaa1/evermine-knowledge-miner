import type { CulturalExpression } from "./gemini";
import type { MineResult } from "./mine-file";
import { idbGet, idbSet, STORES } from "./store";

export const BRAIN_FORMAT = "evermine.core-brain";
export const BRAIN_VERSION = 1;
export const BRAIN_KEY = "coreBrainDoc";

export type BrainCategory = "beliefs" | "decisionLogic" | "skills" | "expressiveStyle" | "aestheticProfile";

export const BRAIN_CATEGORIES: BrainCategory[] = [
  "beliefs",
  "decisionLogic",
  "skills",
  "expressiveStyle",
  "aestheticProfile",
];

export type BrainEntry = {
  id: string;
  text: string;
  source: "mined" | "custom";
  edited: boolean;
  createdAt: string;
};

export type CulturalEntry = CulturalExpression & { id: string; source: "mined" | "custom"; edited: boolean };

export type ActionEntry = {
  id: string;
  label: string;
  description: string;
  timestamp: string;
  clipStart: string;
  clipEnd: string;
};

export type BrainDoc = {
  format: typeof BRAIN_FORMAT;
  version: number;
  updatedAt: string;
  entries: Record<BrainCategory, BrainEntry[]>;
  cultural: CulturalEntry[];
  actions: ActionEntry[];
  /** Ids of mined entries the creator removed — never re-added on regenerate. */
  deleted: string[];
};

/** Stable, content-derived id so regenerating the brain keeps user edits attached. */
export function brainId(prefix: string, seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return `${prefix}_${h.toString(36)}`;
}

export function emptyBrainDoc(): BrainDoc {
  return {
    format: BRAIN_FORMAT,
    version: BRAIN_VERSION,
    updatedAt: new Date().toISOString(),
    entries: { beliefs: [], decisionLogic: [], skills: [], expressiveStyle: [], aestheticProfile: [] },
    cultural: [],
    actions: [],
    deleted: [],
  };
}

const uniq = (xs: string[]) => Array.from(new Set(xs.map((s) => s.trim()).filter(Boolean)));

/** Builds a fresh brain document straight from the mined vault (no user edits). */
export function deriveBrainDoc(results: MineResult[]): BrainDoc {
  const doc = emptyBrainDoc();
  for (const cat of BRAIN_CATEGORIES) {
    doc.entries[cat] = uniq(results.flatMap((r) => r.data.subconsciousness?.[cat] ?? [])).map((text) => ({
      id: brainId(cat, text),
      text,
      source: "mined" as const,
      edited: false,
      createdAt: new Date().toISOString(),
    }));
  }
  const seenPhrase = new Set<string>();
  for (const r of results)
    for (const c of r.data.subconsciousness?.culturalVocabulary ?? []) {
      const key = (c.phrase || "").trim().toLowerCase();
      if (!key || seenPhrase.has(key)) continue;
      seenPhrase.add(key);
      doc.cultural.push({ ...c, id: brainId("cul", key), source: "mined", edited: false });
    }
  const seenAction = new Set<string>();
  for (const r of results)
    for (const f of r.data.faceData ?? []) {
      if (!f.isKeyAction) continue;
      const key = `${f.timestamp}|${f.actionType || f.description}`;
      if (seenAction.has(key)) continue;
      seenAction.add(key);
      doc.actions.push({
        id: brainId("act", key),
        label: f.actionType || f.gestures || "Action",
        description: f.description || f.gestures || "",
        timestamp: f.timestamp,
        clipStart: f.clipStart || f.timestamp,
        clipEnd: f.clipEnd || f.timestamp,
      });
    }
  return doc;
}

/** Re-derives from the vault while preserving custom entries, manual edits and deletions. */
export function mergeBrainDoc(existing: BrainDoc | null, fresh: BrainDoc): BrainDoc {
  if (!existing) return fresh;
  const deleted = new Set(existing.deleted);
  const out = emptyBrainDoc();
  out.deleted = [...deleted];

  for (const cat of BRAIN_CATEGORIES) {
    const prev = new Map(existing.entries[cat].map((e) => [e.id, e]));
    const merged: BrainEntry[] = [];
    for (const e of fresh.entries[cat]) {
      if (deleted.has(e.id)) continue;
      const old = prev.get(e.id);
      merged.push(old && old.edited ? old : (old ?? e));
    }
    for (const e of existing.entries[cat])
      if (e.source === "custom" && !deleted.has(e.id) && !merged.some((m) => m.id === e.id)) merged.push(e);
    out.entries[cat] = merged;
  }

  const prevCul = new Map(existing.cultural.map((c) => [c.id, c]));
  out.cultural = fresh.cultural
    .filter((c) => !deleted.has(c.id))
    .map((c) => {
      const old = prevCul.get(c.id);
      return old && old.edited ? old : (old ?? c);
    });
  for (const c of existing.cultural)
    if (c.source === "custom" && !deleted.has(c.id) && !out.cultural.some((x) => x.id === c.id)) out.cultural.push(c);

  out.actions = fresh.actions.filter((a) => !deleted.has(a.id));
  out.updatedAt = new Date().toISOString();
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function normEntry(v: unknown, cat: string): BrainEntry | null {
  if (!isObj(v) || !isStr(v['text']) || !v['text'].trim()) return null;
  return {
    id: isStr(v['id']) && v['id'] ? v['id'] : brainId(cat, v['text']),
    text: v['text'],
    source: v['source'] === "custom" ? "custom" : "mined",
    edited: v['edited'] === true,
    createdAt: isStr(v['createdAt']) ? v['createdAt'] : new Date().toISOString(),
  };
}

/** Strictly validates an imported brain file. Throws with a readable reason. */
export function parseBrainDoc(raw: unknown): BrainDoc {
  if (!isObj(raw)) throw new Error("File is not a valid Core Brain object.");
  if (raw['format'] !== BRAIN_FORMAT) throw new Error('Missing or wrong "format" field — not an Evermine brain file.');
  if (typeof raw['version'] !== "number" || raw['version'] > BRAIN_VERSION)
    throw new Error("Unsupported Core Brain file version.");
  const entriesRaw = raw['entries'];
  if (!isObj(entriesRaw)) throw new Error('Invalid "entries" section.');

  const doc = emptyBrainDoc();
  for (const cat of BRAIN_CATEGORIES) {
    const list = entriesRaw[cat];
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw new Error(`Invalid "entries.${cat}" section.`);
    doc.entries[cat] = list.map((e) => normEntry(e, cat)).filter((e): e is BrainEntry => e !== null);
  }
  if (raw['cultural'] !== undefined) {
    if (!Array.isArray(raw['cultural'])) throw new Error('Invalid "cultural" section.');
    doc.cultural = raw['cultural'].filter(isObj).map((c) => ({
      id: isStr(c['id']) && c['id'] ? c['id'] : brainId("cul", String(c['phrase'] ?? Math.random())),
      phrase: isStr(c['phrase']) ? c['phrase'] : "",
      timestamp: isStr(c['timestamp']) ? c['timestamp'] : "",
      kind: isStr(c['kind']) ? c['kind'] : "",
      literal: isStr(c['literal']) ? c['literal'] : "",
      meaning: isStr(c['meaning']) ? c['meaning'] : "",
      intent: isStr(c['intent']) ? c['intent'] : "",
      sentiment: isStr(c['sentiment']) ? c['sentiment'] : "",
      usage: isStr(c['usage']) ? c['usage'] : "",
      source: c['source'] === "custom" ? "custom" : "mined",
      edited: c['edited'] === true,
    }));
  }
  if (raw['actions'] !== undefined) {
    if (!Array.isArray(raw['actions'])) throw new Error('Invalid "actions" section.');
    doc.actions = raw['actions'].filter(isObj).map((a) => ({
      id: isStr(a['id']) && a['id'] ? a['id'] : brainId("act", String(a['timestamp'] ?? Math.random())),
      label: isStr(a['label']) ? a['label'] : "Action",
      description: isStr(a['description']) ? a['description'] : "",
      timestamp: isStr(a['timestamp']) ? a['timestamp'] : "",
      clipStart: isStr(a['clipStart']) ? a['clipStart'] : "",
      clipEnd: isStr(a['clipEnd']) ? a['clipEnd'] : "",
    }));
  }
  doc.deleted = Array.isArray(raw['deleted']) ? raw['deleted'].filter(isStr) : [];
  doc.updatedAt = isStr(raw['updatedAt']) ? raw['updatedAt'] : new Date().toISOString();
  return doc;
}

export async function loadBrainDoc(): Promise<BrainDoc | null> {
  const raw = await idbGet<unknown>(STORES.SETTINGS, BRAIN_KEY);
  if (!raw) return null;
  try {
    return parseBrainDoc(raw);
  } catch {
    return null;
  }
}

export async function saveBrainDoc(doc: BrainDoc): Promise<void> {
  await idbSet(STORES.SETTINGS, BRAIN_KEY, doc);
}

export function downloadBrainDoc(doc: BrainDoc, baseName = "core-brain"): string {
  const filename = `${(baseName || "core-brain").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "core-brain"}.brain.json`;
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
