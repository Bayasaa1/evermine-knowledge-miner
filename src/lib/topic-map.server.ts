/**
 * Topic map: a post-mining index over a project's mined facts.
 *
 * Runs only after mining has saved its results, never inside the miner, so a
 * failure here can never damage journals, subtitles or knowledge. Gemini (on
 * the creator's own key) invents the topics itself and keeps growing them:
 * each batch sees the existing topic list and either files a fact under an
 * existing topic or opens a new one. Facts are copied verbatim with their
 * source video and timestamp; the AI only decides where they belong.
 */
import { generateRoleText } from "@/lib/user-ai.server";

export type TopicFact = { id: string; text: string; ts: string; videoId: string; vaultId: string };
/** parentId nests a topic under a broader one, so the map grows like roots. */
export type Topic = { id: string; title: string; summary: string; group: string; parentId?: string; facts: TopicFact[] };
export type TopicMap = {
  version: 1;
  projectId: string;
  updatedAt: string;
  topics: Topic[];
  /** Fact ids already filed, so a rebuild only sends new facts. */
  filed: string[];
};

const BATCH = 100;

function parseJson<T>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(t) as T;
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s < 0 || e <= s) return null;
    try {
      return JSON.parse(t.slice(s, e + 1)) as T;
    } catch {
      return null;
    }
  }
}

function hash(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

function videoIdOf(payload: Record<string, unknown>): string {
  const src = (payload["source"] ?? {}) as Record<string, unknown>;
  const url = String(src["url"] ?? "");
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? "";
}

/** Every fact a mined vault holds, with a stable id. */
export function factsOfVault(vaultId: string, payload: Record<string, unknown>): TopicFact[] {
  const result = (payload["result"] ?? {}) as Record<string, unknown>;
  const videoId = videoIdOf(payload);
  const out: TopicFact[] = [];
  const push = (text: string, ts: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 4) return;
    out.push({ id: `${vaultId.slice(0, 8)}_${hash(clean)}`, text: clean.slice(0, 600), ts, videoId, vaultId });
  };
  for (const n of arr(result["knowledgeNodes"])) {
    const title = String(n["concept_title"] ?? "").trim();
    const detail = String(n["detailed_explanation"] ?? "").trim();
    push(detail ? `${title}: ${detail}` : title, String(n["timestamp_start"] ?? ""));
  }
  for (const q of arr(result["qaPairs"])) {
    const qq = String(q["question"] ?? "").trim();
    const a = String(q["answer"] ?? "").trim();
    if (qq && a) push(`Q: ${qq} — A: ${a}`, String(q["timestamp"] ?? ""));
  }
  if (Array.isArray(result["knowledge"])) for (const k of result["knowledge"]) if (typeof k === "string") push(k, "");
  const seen = new Set<string>();
  return out.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

/**
 * Files one batch of not-yet-filed facts into the map. Returns the updated
 * map and how many facts are still waiting. On any AI failure the map is
 * returned unchanged, so nothing is ever lost.
 */
export async function fileNextBatch(opts: {
  userId: string;
  map: TopicMap;
  allFacts: TopicFact[];
  label: string;
}): Promise<{ map: TopicMap; remaining: number; filedNow: number }> {
  const filed = new Set(opts.map.filed);
  const pending = opts.allFacts.filter((f) => !filed.has(f.id));
  if (pending.length === 0) return { map: opts.map, remaining: 0, filedNow: 0 };
  const batch = pending.slice(0, BATCH);

  const existing = opts.map.topics.map((t) => `${t.id} | ${t.group} | ${t.title} — ${t.summary.slice(0, 160)}`).join("\n");
  const prompt = `You maintain a topic index of one person's knowledge, built from their videos.

EXISTING TOPICS (id | group | title — summary):
${existing || "(none yet)"}

NEW FACTS:
${batch.map((f, i) => `#${i + 1} ${f.text.slice(0, 400)}`).join("\n")}

File every fact under the best topic.
- Reuse an existing topic whenever the fact is about the same subject. Open a new topic only for a genuinely new subject.
- The index grows like tree roots: when a new topic is a narrower part of an existing topic, set "parent" to that existing id (e.g. "Raptor engine" under "Starship"). Leave "parent" empty for a broad subject.
- Topics are specific subjects (e.g. "iPhone pricing", "Knife technique", "PvP tactics"), not vague buckets. Choose as many as the content needs; there is no fixed number.
- "group" is a broad domain you choose freely (e.g. "Technology", "Cooking", "Gaming") that clusters related topics.
- Write titles, summaries and groups in the main language of the facts.
- Never rewrite the facts.
Return JSON only:
{"newTopics":[{"key":"n1","title":"...","group":"...","parent":"<existing id or empty>","summary":"one sentence"}],
 "assign":[{"n":1,"topic":"<existing id or new key>"}],
 "updatedSummaries":[{"id":"<existing id>","summary":"one sentence that now covers the new facts"}]}
Every numbered fact must appear in "assign" exactly once.`;

  let reply;
  try {
    reply = await generateRoleText({
      userId: opts.userId,
      role: "core_brain",
      system: "You organise knowledge into a growing topic index. You answer with JSON only.",
      prompt,
      json: true,
      maxTokens: 8192,
      subjectKind: "project",
      subjectId: opts.map.projectId,
      subjectLabel: opts.label,
    });
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : "Topic sorting failed");
  }
  const parsed = parseJson<{
    newTopics?: { key?: string; title?: string; group?: string; parent?: string; summary?: string }[];
    assign?: { n?: number; topic?: string }[];
    updatedSummaries?: { id?: string; summary?: string }[];
  }>(reply.text);
  if (!parsed || !Array.isArray(parsed.assign) || parsed.assign.length === 0) {
    throw new Error("The AI returned no topic sorting. Nothing was changed — try again.");
  }

  const topics = opts.map.topics.map((t) => ({ ...t, facts: [...t.facts] }));
  const byId = new Map(topics.map((t) => [t.id, t]));
  const keyToId = new Map<string, string>();
  for (const nt of parsed.newTopics ?? []) {
    const title = String(nt.title ?? "").trim();
    const key = String(nt.key ?? "").trim();
    if (!title || !key) continue;
    // Same title as an existing topic → merge rather than duplicate.
    const same = topics.find((t) => t.title.toLowerCase() === title.toLowerCase());
    if (same) {
      keyToId.set(key, same.id);
      continue;
    }
    const id = `t_${hash(title.toLowerCase())}`;
    const parentRef = String(nt.parent ?? "").trim();
    const parent = parentRef && parentRef !== id && byId.has(parentRef) ? byId.get(parentRef)! : undefined;
    const topic: Topic = {
      id,
      title: title.slice(0, 120),
      summary: String(nt.summary ?? "").trim().slice(0, 400),
      group: parent?.group ?? (String(nt.group ?? "").trim().slice(0, 60) || "General"),
      ...(parent ? { parentId: parent.id } : {}),
      facts: [],
    };
    topics.push(topic);
    byId.set(id, topic);
    keyToId.set(key, id);
  }
  for (const u of parsed.updatedSummaries ?? []) {
    const t = byId.get(String(u.id ?? ""));
    const s = String(u.summary ?? "").trim();
    if (t && s) t.summary = s.slice(0, 400);
  }

  const newFiled: string[] = [];
  let misc: Topic | undefined;
  for (let i = 0; i < batch.length; i++) {
    const fact = batch[i]!;
    const a = parsed.assign.find((x) => Number(x?.n) === i + 1);
    const ref = String(a?.topic ?? "");
    let target = byId.get(ref) ?? byId.get(keyToId.get(ref) ?? "");
    if (!target) {
      // A fact the AI skipped still lands somewhere visible — never dropped.
      misc = misc ?? topics.find((t) => t.id === "t_unsorted");
      if (!misc) {
        misc = { id: "t_unsorted", title: "Unsorted", summary: "Facts not yet placed under a topic.", group: "General", facts: [] };
        topics.push(misc);
        byId.set(misc.id, misc);
      }
      target = misc;
    }
    target.facts.push(fact);
    newFiled.push(fact.id);
  }

  return {
    map: {
      ...opts.map,
      topics: topics.filter((t) => t.facts.length > 0),
      filed: [...opts.map.filed, ...newFiled],
      updatedAt: new Date().toISOString(),
    },
    remaining: pending.length - batch.length,
    filedNow: batch.length,
  };
}

/** Compact index text for chat prompts: topic titles and summaries only. */
export function topicIndexText(map: TopicMap | null, limit = 60): string[] {
  if (!map) return [];
  return [...map.topics]
    .sort((a, b) => b.facts.length - a.facts.length)
    .slice(0, limit)
    .map((t) => `${t.group} › ${t.title} (${t.facts.length}): ${t.summary}`);
}
