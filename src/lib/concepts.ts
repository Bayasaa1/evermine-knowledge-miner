/**
 * Pure concept extraction — shared by the browser graph and the server index.
 *
 * Kept free of any Supabase import so server-only code (mining finalisation)
 * can use it without pulling the browser client into the worker bundle.
 */
import type { MindPayload } from "@/lib/mind-json";

export type ConceptKind = "topic" | "lesson" | "emotion";

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

/** Normalized grouping key: the same topic written differently still merges. */
export const normalizeConcept = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);

/**
 * Every concept a single mined video contributes, derived from data that
 * already exists. Nothing is re-mined and nothing is rewritten in storage —
 * normalization happens at read time, so old Core Brains work immediately.
 */
export function extractConcepts(row: {
  tags?: unknown;
  timeline?: unknown;
  emotion_timeline?: unknown;
}): Array<{ concept: string; label: string; kind: ConceptKind }> {
  const out = new Map<string, { concept: string; label: string; kind: ConceptKind }>();
  const add = (raw: unknown, kind: ConceptKind) => {
    const label = clean(raw);
    if (!label) return;
    const concept = normalizeConcept(label);
    if (!concept) return;
    const key = `${kind}:${concept}`;
    if (!out.has(key)) out.set(key, { concept, label, kind });
  };

  for (const tag of Array.isArray(row.tags) ? row.tags : []) add(tag, "topic");
  for (const mark of Array.isArray(row.timeline) ? row.timeline.slice(0, 40) : []) {
    add((mark as Record<string, unknown>)?.["label"], "lesson");
  }
  for (const mark of Array.isArray(row.emotion_timeline) ? row.emotion_timeline.slice(0, 40) : []) {
    const m = (mark as Record<string, unknown>) ?? {};
    add(m["emotion"] ?? m["primary_emotion"] ?? m["label"], "emotion");
  }
  return [...out.values()];
}

/** Concepts stored inside a saved `.json.md` Core Brain payload. */
export function extractVaultConcepts(payload: unknown): Array<{ concept: string; label: string; kind: ConceptKind }> {
  const value = (payload ?? {}) as MindPayload;
  const result = (value.result ?? {}) as Record<string, unknown>;
  const nodes = Array.isArray(result["knowledgeNodes"]) ? (result["knowledgeNodes"] as Record<string, unknown>[]) : [];
  const out: Array<{ concept: string; label: string; kind: ConceptKind }> = [];
  for (const node of nodes.slice(0, 200)) {
    const label = clean(node["concept_title"] ?? node["title"] ?? node["concept"]);
    if (!label) continue;
    const concept = normalizeConcept(label);
    if (concept) out.push({ concept, label, kind: "topic" });
  }
  return out;
}

