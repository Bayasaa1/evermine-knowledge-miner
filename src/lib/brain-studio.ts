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
  /** When this statement entered the brain. */
  createdAt: string;
  /** When this statement last changed. Drives the "Latest Wins" rule. */
  updatedAt: string;
  /** Active statements are the ground truth; archived ones live in the history timeline. */
  status: "active" | "archived";
  /** Id of the newer entry that replaced this one, if any. */
  supersededBy: string | null;
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
    const now = new Date().toISOString();
    doc.entries[cat] = uniq(results.flatMap((r) => r.data.subconsciousness?.[cat] ?? [])).map((text) => ({
      id: brainId(cat, text),
      text,
      source: "mined" as const,
      edited: false,
      createdAt: now,
      updatedAt: now,
      status: "active" as const,
      supersededBy: null,
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
  return resolveConflicts(out);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";

function normEntry(v: unknown, cat: string): BrainEntry | null {
  if (!isObj(v) || !isStr(v['text']) || !v['text'].trim()) return null;
  const now = new Date().toISOString();
  return {
    id: isStr(v['id']) && v['id'] ? v['id'] : brainId(cat, v['text']),
    text: v['text'],
    source: v['source'] === "custom" ? "custom" : "mined",
    edited: v['edited'] === true,
    createdAt: isStr(v['createdAt']) ? v['createdAt'] : now,
    updatedAt: isStr(v['updatedAt']) ? v['updatedAt'] : isStr(v['createdAt']) ? v['createdAt'] : now,
    status: v['status'] === "archived" ? "archived" : "active",
    supersededBy: isStr(v['supersededBy']) ? v['supersededBy'] : null,
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

/** Storage key for a mind's brain — each Mind Vault keeps a fully isolated Core Brain. */
export function brainKeyFor(mindId?: string | null): string {
  return mindId ? `${BRAIN_KEY}:${mindId}` : BRAIN_KEY;
}

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "was", "were", "be", "never", "not", "you", "it", "that", "this", "with", "for", "on", "at", "by", "as", "if", "when", "your"]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * "Latest Wins" conflict resolution: two active statements in the same category
 * that talk about the same subject (high word overlap) but say different things
 * are treated as a conflict. The one with the most recent timestamp stays active;
 * the older is archived into the history timeline (never deleted).
 */
export function resolveConflicts(doc: BrainDoc): BrainDoc {
  const next: BrainDoc = { ...doc, entries: { ...doc.entries } };
  for (const cat of BRAIN_CATEGORIES) {
    const list = doc.entries[cat];
    const active = list.filter((e) => e.status === "active");
    const archivedIds = new Map<string, string>(); // loser id -> winner id
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const a = active[i]!;
        const b = active[j]!;
        if (a.text.trim().toLowerCase() === b.text.trim().toLowerCase()) continue;
        if (jaccard(tokens(a.text), tokens(b.text)) < 0.45) continue;
        const [winner, loser] = a.updatedAt >= b.updatedAt ? [a, b] : [b, a];
        archivedIds.set(loser.id, winner.id);
      }
    }
    if (archivedIds.size === 0) continue;
    next.entries[cat] = list.map((e) =>
      archivedIds.has(e.id) ? { ...e, status: "archived" as const, supersededBy: archivedIds.get(e.id)! } : e,
    );
  }
  return next;
}

/** Creator override: make a specific version active. Its conflict rivals are archived. */
export function setEntryActive(doc: BrainDoc, cat: BrainCategory, id: string, active: boolean): BrainDoc {
  const list = doc.entries[cat];
  const target = list.find((e) => e.id === id);
  if (!target) return doc;
  const now = new Date().toISOString();
  let out = list.map((e) =>
    e.id === id
      ? { ...e, status: (active ? "active" : "archived") as "active" | "archived", updatedAt: now, supersededBy: active ? null : e.supersededBy }
      : e,
  );
  if (active) {
    // Archive any active sibling that conflicts with the re-activated statement.
    const ref = tokens(target.text);
    out = out.map((e) =>
      e.id !== id && e.status === "active" && e.text.trim().toLowerCase() !== target.text.trim().toLowerCase() && jaccard(ref, tokens(e.text)) >= 0.45
        ? { ...e, status: "archived" as const, supersededBy: id }
        : e,
    );
  }
  return { ...doc, entries: { ...doc.entries, [cat]: out } };
}

/** Active (ground-truth) entries per category — what the chat/voice engines should query. */
export function activeEntries(doc: BrainDoc, cat: BrainCategory): BrainEntry[] {
  return doc.entries[cat].filter((e) => e.status === "active");
}

export async function loadBrainDoc(mindId?: string | null): Promise<BrainDoc | null> {
  const raw = await idbGet<unknown>(STORES.SETTINGS, brainKeyFor(mindId));
  if (!raw) return null;
  try {
    return parseBrainDoc(raw);
  } catch {
    return null;
  }
}

export async function saveBrainDoc(doc: BrainDoc, mindId?: string | null): Promise<void> {
  await idbSet(STORES.SETTINGS, brainKeyFor(mindId), doc);
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
