/**
 * Surgical editing helpers for a stored Mind JSON payload.
 *
 * A payload looks like:
 *   { source, category, minedAt, result: ChunkResult, annotations?, faqPatches?, erasedChunks? }
 *
 * Everything here is pure: it takes a payload and returns a NEW payload, so the
 * caller can save it as a fresh version (never destroying the previous one).
 */
import { CHUNK_SECONDS } from "@/lib/chunking";

export type Annotation = { id: string; statement: string; overrule: string; createdAt: string };
export type FaqPatch = { id: string; question: string; answer: string; createdAt: string };

export type MindPayload = {
  result?: Record<string, unknown>;
  annotations?: Annotation[];
  faqPatches?: FaqPatch[];
  erasedChunks?: number[];
  [key: string]: unknown;
};

const newId = () => `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** "1:02:03" | "12:34" | "78" -> seconds. Returns null when unparseable. */
export function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parts = value.trim().split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return null;
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

function chunkIndexOf(item: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const sec = parseTimestamp(item[key]);
    if (sec !== null) return Math.floor(sec / CHUNK_SECONDS);
  }
  return null;
}

const COLLECTIONS: { key: string; stamps: string[] }[] = [
  { key: "transcript", stamps: ["timestamp"] },
  { key: "scenes", stamps: ["timestamp"] },
  { key: "faceData", stamps: ["timestamp", "clipStart"] },
  { key: "voiceData", stamps: ["start"] },
  { key: "knowledgeNodes", stamps: ["timestamp_start"] },
  { key: "emotionTimeline", stamps: ["timestamp", "start"] },
];

export type ChunkSummary = {
  index: number;
  startSec: number;
  endSec: number;
  label: string;
  counts: Record<string, number>;
  total: number;
  preview: string;
};

/** Groups every timestamped record into its 5-minute checkpoint bucket. */
export function chunkBuckets(payload: MindPayload): ChunkSummary[] {
  const result = (payload.result ?? {}) as Record<string, unknown>;
  const buckets = new Map<number, ChunkSummary>();

  const ensure = (index: number): ChunkSummary => {
    let b = buckets.get(index);
    if (!b) {
      b = {
        index,
        startSec: index * CHUNK_SECONDS,
        endSec: (index + 1) * CHUNK_SECONDS,
        label: `${formatSeconds(index * CHUNK_SECONDS)} – ${formatSeconds((index + 1) * CHUNK_SECONDS)}`,
        counts: {},
        total: 0,
        preview: "",
      };
      buckets.set(index, b);
    }
    return b;
  };

  for (const { key, stamps } of COLLECTIONS) {
    for (const item of arr(result[key])) {
      const index = chunkIndexOf(item, stamps);
      if (index === null) continue;
      const b = ensure(index);
      b.counts[key] = (b.counts[key] ?? 0) + 1;
      b.total += 1;
      if (!b.preview) {
        const text = item['speech'] ?? item['description'] ?? item['concept_title'] ?? item['note'] ?? "";
        if (typeof text === "string") b.preview = text.slice(0, 140);
      }
    }
  }

  return [...buckets.values()].sort((a, b) => a.index - b.index);
}

/** Removes every timestamped record that falls inside the given 5-minute chunk. */
export function eraseChunk(payload: MindPayload, index: number): MindPayload {
  const result = { ...((payload.result ?? {}) as Record<string, unknown>) };
  for (const { key, stamps } of COLLECTIONS) {
    const items = arr(result[key]);
    if (items.length === 0) continue;
    result[key] = items.filter((item) => chunkIndexOf(item, stamps) !== index);
  }
  const erased = [...new Set([...(payload.erasedChunks ?? []), index])].sort((a, b) => a - b);
  return { ...payload, result, erasedChunks: erased };
}

export function addAnnotation(payload: MindPayload, statement: string, overrule: string): MindPayload {
  const entry: Annotation = { id: newId(), statement, overrule, createdAt: new Date().toISOString() };
  return { ...payload, annotations: [...(payload.annotations ?? []), entry] };
}

export function removeAnnotation(payload: MindPayload, id: string): MindPayload {
  return { ...payload, annotations: (payload.annotations ?? []).filter((a) => a.id !== id) };
}

export function addFaqPatch(payload: MindPayload, question: string, answer: string): MindPayload {
  const entry: FaqPatch = { id: newId(), question, answer, createdAt: new Date().toISOString() };
  return { ...payload, faqPatches: [...(payload.faqPatches ?? []), entry] };
}

export function removeFaqPatch(payload: MindPayload, id: string): MindPayload {
  return { ...payload, faqPatches: (payload.faqPatches ?? []).filter((f) => f.id !== id) };
}

export type DataTypeCard = { key: string; count: number };

/** Visual summary of what kinds of data this Mind actually stores. */
export function dataTypeCards(payload: MindPayload): DataTypeCard[] {
  const result = (payload.result ?? {}) as Record<string, unknown>;
  const nodes = arr(result['knowledgeNodes']);
  return [
    { key: "knowledgeGraph", count: nodes.length + arr(result['transcript']).length },
    { key: "voiceEmbeddings", count: arr(result['voiceData']).length },
    { key: "emotionTimeline", count: arr(result['emotionTimeline']).length },
    { key: "vlaTrajectories", count: nodes.filter((n) => n['spatial_action']).length },
  ];
}
