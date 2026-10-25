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

/**
 * Removes every mined record that came from one source video.
 *
 * Records rarely carry the video id themselves, so we match on the payload's
 * own `source` marker first (the whole brain slice belongs to that video) and
 * additionally drop any individual record that references the id or URL.
 */
export function stripSource(
  payload: MindPayload,
  source: { youtubeId?: string; sourceUrl?: string },
): MindPayload {
  const needles = [source.youtubeId, source.sourceUrl].filter((s): s is string => !!s && s.length > 3);
  if (needles.length === 0) return payload;

  const payloadSource = typeof payload['source'] === "string" ? (payload['source'] as string) : "";
  const wholePayloadMatches = needles.some((n) => payloadSource.includes(n));

  const result = { ...((payload.result ?? {}) as Record<string, unknown>) };
  for (const { key } of COLLECTIONS) {
    const items = arr(result[key]);
    if (items.length === 0) continue;
    result[key] = wholePayloadMatches
      ? []
      : items.filter((item) => {
          const blob = JSON.stringify(item);
          return !needles.some((n) => blob.includes(n));
        });
  }

  return {
    ...payload,
    result,
    scrubbedSources: [...new Set([...(Array.isArray(payload['scrubbedSources']) ? (payload['scrubbedSources'] as string[]) : []), ...needles])],
  };
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

// ─── Visual Studio cards ──────────────────────────────────────────────────
// Human-friendly cards over the stored payload. Every helper is pure and only
// touches the one field the creator edited, so nothing else in the Mind moves.

export type CardKind = "claim" | "faq" | "step" | "drill" | "rule";
export type CardHint = "lowConfidence" | "noSummary" | "noRecovery" | "noMistake" | "noWhy" | "noAnswer";
export type EditCard = {
  id: string;
  kind: CardKind;
  fields: Record<string, string>;
  timestamp: string | null;
  hints: CardHint[];
};

/** Editable fields per card kind, in display order. */
export const CARD_FIELDS: Record<CardKind, string[]> = {
  claim: ["title", "summary", "quote"],
  faq: ["question", "answer"],
  step: ["precondition", "action_primitive", "target_object", "postcondition", "hazard_or_recovery"],
  drill: ["skill_name", "body_or_hand_mechanics", "tempo_and_rhythm", "sensory_cue", "common_mistake_to_avoid"],
  rule: ["situation", "action", "why"],
};

const DRILL_PREFIX = "movement_skill_drill:";
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const res = (p: MindPayload) => ({ ...((p.result ?? {}) as Record<string, unknown>) });
const gamingOf = (r: Record<string, unknown>) => ({ ...((r['gaming'] ?? {}) as Record<string, unknown>) });

function parseDrill(step: string): Record<string, unknown> | null {
  if (!step.startsWith(DRILL_PREFIX)) return null;
  try {
    const v = JSON.parse(step.slice(DRILL_PREFIX.length));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function listCards(payload: MindPayload): EditCard[] {
  const r = (payload.result ?? {}) as Record<string, unknown>;
  const cards: EditCard[] = [];
  arr(r['knowledgeNodes']).forEach((n, i) => {
    const conf = typeof n['confidence_score'] === "number" ? (n['confidence_score'] as number) : 1;
    const fields = { title: str(n['concept_title']), summary: str(n['detailed_explanation']), quote: str(n['creator_quote']) };
    const hints: CardHint[] = [];
    if (conf < 0.8) hints.push("lowConfidence");
    if (!fields.summary.trim()) hints.push("noSummary");
    cards.push({ id: `claim:${i}`, kind: "claim", fields, timestamp: str(n['timestamp_start']) || null, hints });
  });
  (payload.faqPatches ?? []).forEach((f) => {
    cards.push({ id: `faq:${f.id}`, kind: "faq", fields: { question: f.question, answer: f.answer }, timestamp: null, hints: f.answer.trim() ? [] : ["noAnswer"] });
  });
  arr(r['screenItems']).forEach((item, i) => {
    const e = item['embodied'] as Record<string, unknown> | undefined;
    if (e && typeof e === "object") {
      const fields = Object.fromEntries(CARD_FIELDS.step.map((k) => [k, str(e[k])]));
      cards.push({ id: `step:${i}`, kind: "step", fields, timestamp: str(item['timestamp']) || null, hints: fields.hazard_or_recovery!.trim() ? [] : ["noRecovery"] });
    }
    const steps = Array.isArray(item['steps']) ? (item['steps'] as unknown[]) : [];
    steps.forEach((s, j) => {
      const d = typeof s === "string" ? parseDrill(s) : null;
      if (!d) return;
      const fields = Object.fromEntries(CARD_FIELDS.drill.map((k) => [k, str(d[k])]));
      fields.phase = str(d['phase']) || "execution";
      cards.push({ id: `drill:${i}:${j}`, kind: "drill", fields, timestamp: str(item['timestamp']) || null, hints: fields.common_mistake_to_avoid!.trim() ? [] : ["noMistake"] });
    });
  });
  arr(gamingOf(r)['decisions']).forEach((d, i) => {
    const fields = { situation: str(d['situation']), action: str(d['action']), why: str(d['why']) };
    cards.push({ id: `rule:${i}`, kind: "rule", fields, timestamp: str(d['timestamp']) || null, hints: fields.why.trim() ? [] : ["noWhy"] });
  });
  return cards;
}

const CLAIM_KEYS: Record<string, string> = { title: "concept_title", summary: "detailed_explanation", quote: "creator_quote" };

/** Writes one field of one card. Unknown cards/fields return the payload unchanged. */
export function setCardField(payload: MindPayload, id: string, field: string, value: string): MindPayload {
  const [kind, a, b] = id.split(":");
  if (!kind || !CARD_FIELDS[kind as CardKind]?.includes(field) && !(kind === "drill" && field === "phase")) return payload;
  const r = res(payload);
  if (kind === "faq") {
    return { ...payload, faqPatches: (payload.faqPatches ?? []).map((f) => (f.id === a ? { ...f, [field]: value } : f)) };
  }
  if (kind === "claim") {
    const list = [...arr(r['knowledgeNodes'])];
    const i = Number(a);
    if (!list[i]) return payload;
    list[i] = { ...list[i], [CLAIM_KEYS[field]!]: value };
    return { ...payload, result: { ...r, knowledgeNodes: list } };
  }
  if (kind === "step" || kind === "drill") {
    const list = [...arr(r['screenItems'])];
    const i = Number(a);
    const item = list[i];
    if (!item) return payload;
    if (kind === "step") {
      list[i] = { ...item, embodied: { ...((item['embodied'] ?? {}) as object), [field]: value } };
    } else {
      const steps = [...((item['steps'] as string[]) ?? [])];
      const d = parseDrill(steps[Number(b)] ?? "");
      if (!d) return payload;
      steps[Number(b)] = DRILL_PREFIX + JSON.stringify({ ...d, [field]: value });
      list[i] = { ...item, steps };
    }
    return { ...payload, result: { ...r, screenItems: list } };
  }
  if (kind === "rule") {
    const g = gamingOf(r);
    const list = [...arr(g['decisions'])];
    const i = Number(a);
    if (!list[i]) return payload;
    list[i] = { ...list[i], [field]: value };
    return { ...payload, result: { ...r, gaming: { ...g, decisions: list } } };
  }
  return payload;
}

export function removeCard(payload: MindPayload, id: string): MindPayload {
  const [kind, a, b] = id.split(":");
  const r = res(payload);
  const i = Number(a);
  if (kind === "faq") return removeFaqPatch(payload, a!);
  if (kind === "claim") return { ...payload, result: { ...r, knowledgeNodes: arr(r['knowledgeNodes']).filter((_, k) => k !== i) } };
  if (kind === "step" || kind === "drill") {
    const list = [...arr(r['screenItems'])];
    const item = list[i];
    if (!item) return payload;
    if (kind === "step") {
      const { embodied: _drop, ...rest } = item;
      list[i] = rest;
    } else {
      list[i] = { ...item, steps: ((item['steps'] as string[]) ?? []).filter((_, k) => k !== Number(b)) };
    }
    return { ...payload, result: { ...r, screenItems: list } };
  }
  if (kind === "rule") {
    const g = gamingOf(r);
    return { ...payload, result: { ...r, gaming: { ...g, decisions: arr(g['decisions']).filter((_, k) => k !== i) } } };
  }
  return payload;
}

/** Swaps a robot step / game rule with its neighbour of the same kind. */
export function moveCard(payload: MindPayload, id: string, dir: -1 | 1): MindPayload {
  const same = listCards(payload).filter((c) => c.kind === id.split(":")[0]);
  const at = same.findIndex((c) => c.id === id);
  const other = same[at + dir];
  if (at < 0 || !other) return payload;
  const r = res(payload);
  const ia = Number(id.split(":")[1]);
  const ib = Number(other.id.split(":")[1]);
  if (id.startsWith("step:")) {
    // Swap only the step content; each moment keeps its own video time.
    const list = [...arr(r['screenItems'])];
    const ea = list[ia]!['embodied'];
    list[ia] = { ...list[ia]!, embodied: list[ib]!['embodied'] };
    list[ib] = { ...list[ib]!, embodied: ea };
    return { ...payload, result: { ...r, screenItems: list } };
  }
  if (id.startsWith("rule:")) {
    const g = gamingOf(r);
    const list = [...arr(g['decisions'])];
    [list[ia], list[ib]] = [list[ib]!, list[ia]!];
    return { ...payload, result: { ...r, gaming: { ...g, decisions: list } } };
  }
  return payload;
}

export function addCard(payload: MindPayload, kind: "claim" | "faq" | "step" | "rule"): MindPayload {
  const r = res(payload);
  if (kind === "faq") return addFaqPatch(payload, "", "");
  if (kind === "claim") {
    const node = { timestamp_start: "", timestamp_end: "", concept_title: "", detailed_explanation: "", spatial_action: null, confidence_score: 1, addedByCreator: true };
    return { ...payload, result: { ...r, knowledgeNodes: [...arr(r['knowledgeNodes']), node] } };
  }
  if (kind === "step") {
    const item = { timestamp: "", kind: "action", title: "", content: "", url: "", language: "", steps: [], interaction: "", addedByCreator: true,
      embodied: { precondition: "", action_primitive: "", target_object: "", postcondition: "", hazard_or_recovery: "" } };
    return { ...payload, result: { ...r, screenItems: [...arr(r['screenItems']), item] } };
  }
  const g = gamingOf(r);
  return { ...payload, result: { ...r, gaming: { ...g, decisions: [...arr(g['decisions']), { situation: "", action: "", why: "", addedByCreator: true }] } } };
}

export type CardPatch = { id: string; field: string; value: string };

/** Applies AI-suggested field changes, keeping only ones that hit a real card and field. */
export function applyCardPatches(payload: MindPayload, patches: CardPatch[]): { payload: MindPayload; applied: number } {
  const ids = new Set(listCards(payload).map((c) => c.id));
  let next = payload;
  let applied = 0;
  for (const p of patches) {
    if (!p || typeof p.id !== "string" || typeof p.field !== "string" || typeof p.value !== "string" || !ids.has(p.id)) continue;
    const after = setCardField(next, p.id, p.field, p.value.slice(0, 2000));
    if (after !== next) { next = after; applied += 1; }
  }
  return { payload: next, applied };
}

/** YouTube id of the video this Mind came from, when the payload names one. */
export function sourceVideoId(payload: MindPayload): string | null {
  const s = [payload['source'], payload['sourceUrl'], payload['youtubeId']].map(str).join(" ");
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/) ?? s.match(/^([\w-]{11})$/m);
  return m?.[1] ?? (/^[\w-]{11}$/.test(str(payload['youtubeId'])) ? str(payload['youtubeId']) : null);
}
