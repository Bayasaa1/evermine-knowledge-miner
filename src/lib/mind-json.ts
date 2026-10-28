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
      cards.push({ id: `step:${i}`, kind: "step", fields, timestamp: str(item['timestamp']) || null, hints: fields["hazard_or_recovery"]!.trim() ? [] : ["noRecovery"] });
    }
    const steps = Array.isArray(item['steps']) ? (item['steps'] as unknown[]) : [];
    steps.forEach((s, j) => {
      const d = typeof s === "string" ? parseDrill(s) : null;
      if (!d) return;
      const fields = Object.fromEntries(CARD_FIELDS.drill.map((k) => [k, str(d[k])]));
      fields["phase"] = str(d['phase']) || "execution";
      cards.push({ id: `drill:${i}:${j}`, kind: "drill", fields, timestamp: str(item['timestamp']) || null, hints: fields["common_mistake_to_avoid"]!.trim() ? [] : ["noMistake"] });
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

// ─── Zero-coding exports ──────────────────────────────────────────────────
// Instant-use formats for anyone who unlocked a Mind. Every downloader takes
// the caller's `allowed` (from canDownloadMind / useMindEntitlement) and does
// nothing when it is false, so the paywall can never be skipped from here.

export type MindExportInput = { name: string; data: unknown; allowed: boolean };

type Digest = {
  name: string;
  identity: string[];
  models: { title: string; text: string }[];
  quotes: string[];
  rules: { situation: string; action: string; why: string }[];
  drills: string[];
  tree: unknown;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Walks any Mind/bundle shape and gathers the parts a prompt or app needs. */
export function digestMind(name: string, data: unknown): Digest {
  const d: Digest = { name: name || "Mind", identity: [], models: [], quotes: [], rules: [], drills: [], tree: null };
  const seen = new Set<unknown>();
  const walk = (v: unknown, key: string, depth: number) => {
    if (!v || typeof v !== "object" || seen.has(v) || depth > 8) return;
    seen.add(v);
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key, depth + 1));
    const o = v as Record<string, unknown>;
    if (o['concept_title'] || o['detailed_explanation']) {
      d.models.push({ title: str(o['concept_title']), text: str(o['detailed_explanation']) });
      if (str(o['creator_quote']).trim()) d.quotes.push(str(o['creator_quote']));
    }
    if (o['situation'] && o['action']) d.rules.push({ situation: str(o['situation']), action: str(o['action']), why: str(o['why']) });
    if (o['skill_name']) d.drills.push([o['skill_name'], o['body_or_hand_mechanics'], o['tempo_and_rhythm'], o['common_mistake_to_avoid']].map(str).filter(Boolean).join(" — "));
    for (const [k, val] of Object.entries(o)) {
      if (k === "behavior_tree" && !d.tree) d.tree = val;
      if (/identity|voice_dna|persona|catchphrase|tone/i.test(k) && typeof val === "string" && val.trim()) d.identity.push(`${k}: ${val}`);
      if (/quote/i.test(k) && Array.isArray(val)) val.forEach((q) => typeof q === "string" ? d.quotes.push(q) : q && typeof q === "object" && d.quotes.push(str((q as Record<string, unknown>)['quote'] ?? (q as Record<string, unknown>)['text'])));
      walk(val, k, depth + 1);
    }
  };
  walk(data, "", 0);
  const uniq = <T,>(xs: T[], f: (x: T) => string) => { const s = new Set<string>(); return xs.filter((x) => { const k = f(x); if (!k.trim() || s.has(k)) return false; s.add(k); return true; }); };
  d.models = uniq(d.models, (m) => m.title + m.text).slice(0, 200);
  d.quotes = uniq(d.quotes, (q) => q).slice(0, 60);
  d.rules = uniq(d.rules, (r) => r.situation + r.action).slice(0, 120);
  d.drills = uniq(d.drills, (x) => x).slice(0, 60);
  d.identity = uniq(d.identity, (x) => x).slice(0, 20);
  return d;
}

/** Markdown system prompt for ChatGPT / Claude / Cursor / Gemini. */
export function buildMasterPrompt(name: string, data: unknown): string {
  const d = digestMind(name, data);
  const out = [`# You are ${d.name}`, "", "Stay fully in character. Speak in this Mind's voice, use its mental models, and answer from the knowledge below. If something is not covered, say so honestly instead of inventing it.", ""];
  if (d.identity.length) out.push("## Identity & speaking style", ...d.identity.map((x) => `- ${clip(x, 400)}`), "");
  if (d.models.length) out.push("## Core mental models & knowledge", ...d.models.map((m) => `- **${m.title || "Idea"}**: ${clip(m.text, 600)}`), "");
  if (d.quotes.length) out.push("## Signature quotes (verbatim)", ...d.quotes.map((q) => `> ${clip(q, 300)}`), "");
  if (d.rules.length) out.push("## Decision playbook", ...d.rules.map((r) => `- If ${r.situation} → ${r.action}${r.why ? ` (because ${r.why})` : ""}`), "");
  if (d.drills.length) out.push("## Movement / skill drills", ...d.drills.map((x) => `- ${clip(x, 400)}`), "");
  out.push("— Exported from Evermind");
  return out.join("\n");
}

/** Ollama Modelfile: `ollama create <slug> -f <slug>.Modelfile`. */
export function buildOllamaModelfile(name: string, data: unknown, base = "llama3.1"): string {
  const prompt = buildMasterPrompt(name, data).replace(/"""/g, '\\"\\"\\"');
  return `# ${name} — Evermind Mind for Ollama\n# Run: ollama create ${mindSlug(name)} -f ${mindSlug(name)}.Modelfile && ollama run ${mindSlug(name)}\nFROM ${base}\nPARAMETER temperature 0.7\nSYSTEM """\n${prompt}\n"""\n`;
}

export const mindSlug = (name: string) => (name || "mind").toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "mind";

/** One self-contained offline HTML app with the Mind embedded. */
export function buildStandaloneMindHtml(name: string, data: unknown): string {
  const d = digestMind(name, data);
  const payload = JSON.stringify({ digest: d, prompt: buildMasterPrompt(name, data), raw: data }).replace(/</g, "\\u003c");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.name)} — Evermind</title>
<style>body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#0e0f12;color:#e9e9ec}main{max-width:820px;margin:auto;padding:16px}h1{font-size:22px}nav{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}nav button,.b{background:#1b1d23;color:#e9e9ec;border:1px solid #2c2f38;border-radius:8px;padding:8px 12px;cursor:pointer}nav button.on{border-color:#f2b84b;color:#f2b84b}input,textarea{width:100%;box-sizing:border-box;background:#15171c;color:#e9e9ec;border:1px solid #2c2f38;border-radius:8px;padding:10px}.c{background:#15171c;border:1px solid #23262e;border-radius:10px;padding:12px;margin:8px 0}.m{color:#9a9ca5;font-size:13px}.big{font-size:44px;text-align:center;margin:12px}pre{white-space:pre-wrap;font-size:12px}</style></head>
<body><main><h1>${esc(d.name)}</h1><p class="m">${d.models.length} ideas · ${d.rules.length} rules · ${d.drills.length} drills · works offline</p>
<nav><button data-t="s" class="on">Search</button><button data-t="k">Coach timer</button><button data-t="t">Behavior tree</button><button data-t="a">Chat</button></nav><section id="v"></section></main>
<script>const M=${payload};const v=document.getElementById('v');const e=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
const items=[...M.digest.models.map(x=>({h:x.title,b:x.text})),...M.digest.rules.map(r=>({h:'If '+r.situation,b:r.action+(r.why?' — because '+r.why:'')})),...M.digest.quotes.map(q=>({h:'Quote',b:q})),...M.digest.drills.map(x=>({h:'Drill',b:x}))];
const steps=[...M.digest.drills,...M.digest.rules.map(r=>r.situation+' → '+r.action)];
function S(){v.innerHTML='<input id=q placeholder="Search this Mind…"><div id=r></div>';const f=()=>{const q=document.getElementById('q').value.toLowerCase();document.getElementById('r').innerHTML=items.filter(i=>(i.h+' '+i.b).toLowerCase().includes(q)).slice(0,80).map(i=>'<div class=c><b>'+e(i.h)+'</b><div>'+e(i.b)+'</div></div>').join('')||'<p class=m>Nothing found.</p>'};document.getElementById('q').oninput=f;f()}
let ti=0,tt=null,left=60;function K(){if(!steps.length){v.innerHTML='<p class=m>No steps in this Mind.</p>';return}v.innerHTML='<div class=c><div class=m>Step '+(ti+1)+' / '+steps.length+'</div><p>'+e(steps[ti])+'</p><div class=big id=cl>'+left+'s</div><button class=b id=go>'+(tt?'Pause':'Start')+'</button> <button class=b id=nx>Next</button> <input id=sec type=number value=60 style="width:90px"></div>';document.getElementById('go').onclick=()=>{if(tt){clearInterval(tt);tt=null}else{tt=setInterval(()=>{left--;if(left<=0){ti=(ti+1)%steps.length;left=+document.getElementById('sec').value||60}K()},1000)}K()};document.getElementById('nx').onclick=()=>{ti=(ti+1)%steps.length;left=+document.getElementById('sec').value||60;K()}}
let path=[];function node(){let n=M.digest.tree;for(const i of path){const ch=n&&(n.children||n.nodes||n.steps);n=Array.isArray(ch)?ch[i]:null}return n}
function T(){const n=node();if(!n){v.innerHTML='<p class=m>This Mind has no behavior tree.</p>';return}const ch=n.children||n.nodes||n.steps;v.innerHTML='<div class=c><b>'+e(n.type||n.kind||'node')+'</b> '+e(n.name||n.label||n.action||'')+'<pre>'+e(JSON.stringify(Object.fromEntries(Object.entries(n).filter(([k])=>!['children','nodes','steps'].includes(k))),null,1))+'</pre></div>'+(path.length?'<button class=b id=up>← Back</button> ':'')+(Array.isArray(ch)?ch.map((c,i)=>'<button class=b data-i='+i+'>'+e((c&&(c.name||c.label||c.action||c.type))||('Step '+(i+1)))+'</button> ').join(''):'');v.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{path.push(+b.dataset.i);T()});const u=document.getElementById('up');if(u)u.onclick=()=>{path.pop();T()}}
const hist=[];function A(){v.innerHTML='<p class=m>Optional: paste your own free Gemini key (aistudio.google.com). It stays on this device.</p><input id=k placeholder="Gemini API key" value="'+e(localStorage.getItem('evm_key')||'')+'"><div id=log>'+hist.map(h=>'<div class=c><b>'+(h.role==='user'?'You':e(M.digest.name))+'</b><div>'+e(h.text)+'</div></div>').join('')+'</div><textarea id=m rows=3 placeholder="Ask anything…"></textarea><button class=b id=snd>Send</button> <button class=b id=cp>Copy prompt for ChatGPT / Claude</button>';
document.getElementById('cp').onclick=()=>navigator.clipboard.writeText(M.prompt);document.getElementById('snd').onclick=async()=>{const k=document.getElementById('k').value.trim(),q=document.getElementById('m').value.trim();if(!q)return;if(!k){alert('Add a key first, or use Copy prompt.');return}localStorage.setItem('evm_key',k);hist.push({role:'user',text:q});A();try{const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(k),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:M.prompt}]},contents:hist.map(h=>({role:h.role==='user'?'user':'model',parts:[{text:h.text}]}))})});const j=await r.json();const t=j.candidates&&j.candidates[0]&&j.candidates[0].content.parts.map(p=>p.text).join('');if(!t)throw new Error((j.error&&j.error.message)||'No answer');hist.push({role:'model',text:t})}catch(x){hist.push({role:'model',text:'Error: '+x.message})}A()}}
const V={s:S,k:K,t:T,a:A};document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(x=>x.classList.remove('on'));b.classList.add('on');if(tt){clearInterval(tt);tt=null}V[b.dataset.t]()});S();</script></body></html>`;
}

function saveText(filename: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function downloadCompleteMindJson({ name, data, allowed }: MindExportInput): boolean {
  if (!allowed) return false;
  saveText(`${mindSlug(name)}.evermind.json`, JSON.stringify(data, null, 2), "application/json");
  return true;
}

export function downloadStandaloneMindHtmlApp({ name, data, allowed }: MindExportInput): boolean {
  if (!allowed) return false;
  saveText(`${mindSlug(name)}-evermind-app.html`, buildStandaloneMindHtml(name, data), "text/html;charset=utf-8");
  return true;
}

export async function copyMindAsMasterPrompt({ name, data, allowed }: MindExportInput): Promise<boolean> {
  if (!allowed) return false;
  await navigator.clipboard.writeText(buildMasterPrompt(name, data));
  return true;
}

export function downloadOllamaModelfile({ name, data, allowed }: MindExportInput): boolean {
  if (!allowed) return false;
  saveText(`${mindSlug(name)}.Modelfile`, buildOllamaModelfile(name, data), "text/plain;charset=utf-8");
  return true;
}
