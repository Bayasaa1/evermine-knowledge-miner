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
import { recallBranch } from "./topic-recall";

export type TopicFact = { id: string; text: string; ts: string; videoId: string; vaultId: string };
/** parentId nests a topic under a broader one, so the map grows like roots. */
/** The four axes that order recordings along a branch: when, where, how, and what drove it. */
export type TopicContext = { when?: string; where?: string; how?: string; factors?: string[] };
export type Topic = { id: string; title: string; summary: string; group: string; parentId?: string; context?: TopicContext; facts: TopicFact[] };
export type TopicMap = {
  version: 1;
  projectId: string;
  updatedAt: string;
  topics: Topic[];
  /** Fact ids already filed, so a rebuild only sends new facts. */
  filed: string[];
};

const BATCH = 100;

/** Keeps only non-empty when/where/how/factors; undefined when nothing is known. */
export function cleanContext(v: unknown): TopicContext | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.trim().slice(0, 160) : "");
  const out: TopicContext = {};
  for (const k of ["when", "where", "how"] as const) { const s = str(o[k]); if (s) out[k] = s; }
  const f = Array.isArray(o.factors) ? o.factors.map(str).filter(Boolean).slice(0, 4) : [];
  if (f.length) out.factors = f;
  return Object.keys(out).length ? out : undefined;
}

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

const tok = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2);

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

function videoIdOf(payload: Record<string, unknown>): string {
  const src = (payload["source"] ?? {}) as Record<string, unknown>;
  const url = String(src["url"] ?? "");
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? "";
}

/** Timed speech/journal lines of a mined result, tokenised once. */
function timedLines(result: Record<string, unknown>): { ts: string; words: Set<string> }[] {
  // Journal and transcript both hold timed speech; read both so more facts find their moment.
  const src = [...arr(result["journal"]), ...arr(result["transcript"])];
  const out: { ts: string; words: Set<string> }[] = [];
  for (const l of src) {
    const ts = String(l["timestamp"] ?? l["ts"] ?? l["t"] ?? "").trim();
    const text = String(l["text"] ?? l["speech"] ?? "");
    if (!/^\d{1,3}:\d{2}(:\d{2})?$/.test(ts) || !text) continue;
    out.push({ ts, words: new Set(tok(text)) });
  }
  return out;
}

/**
 * Best source moment for an untimed fact: the 3-line window sharing the most
 * words with it. Read-only lookup over saved lines; "" when nothing matches well.
 */
const stem = (w: string) => w.slice(0, 5);

function guessTs(text: string, lines: { ts: string; words: Set<string> }[]): string {
  const want = [...new Set(tok(text).filter((w) => w.length > 3).map(stem))];
  if (want.length < 3 || !lines.length) return "";
  const stems = lines.map((l) => new Set([...l.words].map(stem)));
  let best = 0;
  let bestTs = "";
  for (let i = 0; i < lines.length; i++) {
    let hit = 0;
    for (const w of want) if (stems[i]!.has(w) || stems[i + 1]?.has(w) || stems[i + 2]?.has(w) || stems[i + 3]?.has(w)) hit++;
    if (hit > best) { best = hit; bestTs = lines[i]!.ts; }
  }
  return best >= Math.max(3, Math.ceil(want.length * 0.25)) ? bestTs : "";
}

/** Every fact a mined vault holds, with a stable id. */
export function factsOfVault(vaultId: string, payload: Record<string, unknown>): TopicFact[] {
  const result = (payload["result"] ?? {}) as Record<string, unknown>;
  const videoId = videoIdOf(payload);
  const lines = timedLines(result);
  const out: TopicFact[] = [];
  const push = (text: string, ts: string) => {
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean.length < 4) return;
    const at = /^\d{1,3}:\d{2}(:\d{2})?$/.test(ts.trim()) ? ts.trim() : guessTs(clean, lines);
    out.push({ id: `${vaultId.slice(0, 8)}_${hash(clean)}`, text: clean.slice(0, 600), ts: at, videoId, vaultId });
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
  if (Array.isArray(result["knowledge"])) {
    for (const k of result["knowledge"]) if (typeof k === "string") push(k, "");
  }
  const seen = new Set<string>();
  return out.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

/**
 * Mongolian (Cyrillic and Latin) question words mapped to the English words
 * topic titles use, so a Mongolian question still finds its branch. Read-only.
 */
const BRIDGE: [RegExp, string][] = [
  [/^(пуужин|puujin|пуужн)/, "rocket starship spacex launch"],
  [/^(сансар|sansar|ангарag)/, "space starship mars colonization"],
  [/^(ангараг|angarag)/, "mars colonization"],
  [/^(хөдөлгүүр|hudulgu|khudulgu)/, "engine raptor propulsion"],
  [/^(нислэг|nisleg)/, "flight launch"],
  [/^(хиймэл|hiimel|оюун|oyun)/, "intelligence digital safety"],
  [/^(машин|mashin|тесла|tesla)/, "tesla automotive"],
  [/^(жолоо|joloo|автомат|avtomat)/, "fsd autonomous"],
  [/^(тархи|tarhi|чип|chip|нейралинк|neiralink)/, "neuralink brain interface"],
  [/^(робот|robot)/, "robotics optimus"],
  [/^(нар|нарны|narni)/, "solar"],
  [/^(батарей|batarei|зай)/, "battery energy"],
  [/^(хонгил|hongil|туннел|tunnel)/, "boring tunnel transportation"],
  [/^(үйлдвэр|uildver)/, "manufacturing factory production"],
  [/^(зардал|zardal|өртөг|urtug|үнэ|une)/, "cost price"],
  [/^(зарчим|zarchim|анхдагч|ankhdagch)/, "first principles methodology"],
  [/^(инженер|injener)/, "engineering"],
  [/^(компани|kompani|удирд|udird|ажилтан|ajiltan)/, "corporate leadership management"],
  [/^(улс төр|улстөр|ulstur|засгийн|zasgiin|төр)/, "political government policy"],
  [/^(эдийн|ediin|эдийн засаг|ажлын|ajliin)/, "economy work economic"],
  [/^(крипто|kripto|биткойн|bitcoin|доге|doge)/, "cryptocurrency"],
  [/^(хүн төрөлхтөн|хүн|hun|ирээдүй|irээдүй|irеedui)/, "humanity civilization future"],
  [/^(орчлон|orchlon|ертөнц|yertunts)/, "cosmic cosmology philosophy"],
  [/^(хиймэл дагуул|дагуул|daguul|интернет|internet)/, "starlink satellite"],
  [/^(тулаан|tulaan|бокс|boks|бөх)/, "martial arts combat"],
  [/^(хайрцаг|hairtsag|кейс|keis|case)/, "case opening cs2"],
  [/^(скин|skin|магадлал|magadlal)/, "skin case"],
  [/^(тоглоом|togloom|cs|кс)/, "cs2 gaming"],
  [/^(стрим|strim|стриймэр|streamer)/, "stream streamer content"],
  [/^(фен|fen|үзэгч|uzegch|донат|donat)/, "audience parasocial engagement"],
  [/^(айфон|aifon|iphone|утас|utas|apple)/, "apple iphone"],
  [/^(болзоо|bolzoo|хайр|hair|харилцаа|hariltsaa)/, "dating relationship"],
  [/^(фитнес|fitnes|эрүүл|eruul|спорт|sport)/, "fitness health"],
  [/^(буу|buu|зэвсэг|zevseg)/, "firearms ballistics"],
  [/^(арилжаа|arilj|зах|zah|хөрөнгө|hurungu)/, "market trade investment"],
  [/^(баг|bag|монголз|mongolz)/, "esports team mongolz"],
];

/** Question words plus their English bridge words. */
export function bridgeQuery(query: string): string[] {
  const words = tok(query);
  const out = new Set(words);
  for (const w of words) for (const [re, en] of BRIDGE) if (re.test(w)) for (const e of en.split(" ")) out.add(e);
  return [...out];
}

/**
 * Tucks a small topic under a bigger near-duplicate (same leading subject
 * word or mostly shared title words). Facts are never moved or removed; it
 * only sets parentId, so the tree reads as one root instead of scattered twins.
 */
const GENERIC = new Set(["development","engineering","technology","systems","future","strategy","strategies","management","industry","analysis","philosophy","design","impact","content","dynamics","production","challenges","general","personal","economics","culture"]);

export function nestNearDuplicates(map: TopicMap): number {
  const byId = new Map(map.topics.map((t) => [t.id, t]));
  const ancestors = (t: Topic) => {
    const s = new Set<string>();
    let p = t.parentId ? byId.get(t.parentId) : undefined;
    while (p && !s.has(p.id)) { s.add(p.id); p = p.parentId ? byId.get(p.parentId) : undefined; }
    return s;
  };
  const words = (t: Topic) => tok(t.title).filter((w) => !["and", "the", "for", "with"].includes(w));
  const sorted = [...map.topics].sort((a, b) => b.facts.length - a.facts.length);
  let moved = 0;
  for (const small of [...sorted].reverse()) {
    const sw = words(small);
    if (!sw.length) continue;
    for (const big of sorted) {
      if (big.id === small.id || big.facts.length <= small.facts.length) continue;
      if (small.parentId === big.id) break;
      const bw = words(big);
      const shared = sw.filter((w) => bw.includes(w)).length;
      const sameLead = sw[0] === bw[0] && sw[0]!.length > 5;
      // Same distinctive subject word (e.g. "Neuralink", "Starship") in both titles.
      const subject = sw.some((w) => w.length > 5 && !GENERIC.has(w) && bw.includes(w));
      const close = shared / Math.min(sw.length, bw.length) >= 0.6 && shared >= 2;
      if (!sameLead && !close && !subject) continue;
      if (ancestors(big).has(small.id)) continue;
      if (map.topics.some((t) => t.parentId === small.id && t.id === big.id)) continue;
      small.parentId = big.id;
      small.group = big.group;
      moved++;
      break;
    }
  }
  return moved;
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
- "context" places the topic on its branch: "when" (time or stage, e.g. "2019, early prototype"), "where" (place or setting), "how" (method used), "factors" (up to 4 short drivers/constraints). Use only what the facts say; leave a field empty if unknown.
Return JSON only:
{"newTopics":[{"key":"n1","title":"...","group":"...","parent":"<existing id or empty>","summary":"one sentence","context":{"when":"","where":"","how":"","factors":[]}}],
 "assign":[{"n":1,"topic":"<existing id or new key>"}],
 "updatedSummaries":[{"id":"<existing id>","summary":"one sentence that now covers the new facts","context":{"when":"","where":"","how":"","factors":[]}}]}
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
    newTopics?: { key?: string; title?: string; group?: string; parent?: string; summary?: string; context?: unknown }[];
    assign?: { n?: number; topic?: string }[];
    updatedSummaries?: { id?: string; summary?: string; context?: unknown }[];
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
      ...(cleanContext(nt.context) ? { context: cleanContext(nt.context) } : {}),
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
    const c = cleanContext(u.context);
    if (t && c) t.context = { ...t.context, ...c };
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
      topics: topics.filter((t) => t.facts.length > 0 || topics.some((c) => c.parentId === t.id)),
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


/**
 * Root-guided recall: picks the branches a question belongs to (or the branch
 * the viewer chose) and returns that branch's facts plus its sub-branches, so
 * the chat answers from the whole relevant root instead of loose word hits.
 * Read-only: never changes the map.
 */
export function branchFactsFor(
  map: TopicMap | null,
  query: string,
  focusTopicId?: string | null,
  maxFacts = 30,
  focusTitle?: string,
): { titles: string[]; facts: string[] } {
  if (!map?.topics.length) return { titles: [], facts: [] };
  return recallBranch(map.topics, query, bridgeQuery(query), focusTopicId, maxFacts, focusTitle);
}

/** Projects whose topic map still has unsorted facts, for the background grower. */
export async function growPendingTopicMaps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  deadline: number,
): Promise<number> {
  const { data: projects } = await admin.from("projects").select("id,user_id").limit(50);
  let grown = 0;
  for (const p of (projects ?? []) as { id: string; user_id: string }[]) {
    if (Date.now() > deadline - 60_000) break;
    const n = await growProjectTopics(admin, p.user_id, p.id, 1).catch(() => 0);
    grown += n;
  }
  return grown;
}

/**
 * Grows a project's topic map in the background right after mining, using the
 * owner's own key. Failures never touch mined data; unsorted facts simply wait
 * for the next run or the creator's button.
 */
export async function growProjectTopics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  projectId: string,
  maxBatches = 3,
): Promise<number> {
  const title = `topics:${projectId}`;
  const [{ data: project }, { data: vaults }] = await Promise.all([
    admin.from("projects").select("title").eq("id", projectId).eq("user_id", userId).maybeSingle(),
    admin.from("mind_vaults").select("id,payload").eq("user_id", userId).eq("project_id", projectId).eq("kind", "mine").order("updated_at", { ascending: true }),
  ]);
  if (!project) return 0;
  const allFacts = ((vaults ?? []) as { id: string; payload: Record<string, unknown> }[]).flatMap((v) => factsOfVault(v.id, v.payload ?? {}));
  const { data: row } = await admin.from("mind_vaults").select("id,payload").eq("user_id", userId).eq("kind", "topics").eq("title", title).maybeSingle();
  let rowId: string | null = row?.id ?? null;
  let map: TopicMap = (row?.payload as TopicMap | null) ?? { version: 1, projectId, updatedAt: new Date().toISOString(), topics: [], filed: [] };
  let total = 0;
  // Backfill source moments for already-filed facts that had none (index only, no AI).
  const tsById = new Map(allFacts.filter((f) => f.ts).map((f) => [f.id, f.ts]));
  let patched = 0;
  for (const t of map.topics) for (const f of t.facts) if (!f.ts && tsById.has(f.id)) { f.ts = tsById.get(f.id)!; patched++; }
  patched += nestNearDuplicates(map);
  if (patched && rowId) await admin.from("mind_vaults").update({ payload: map }).eq("id", rowId).eq("user_id", userId);
  for (let i = 0; i < maxBatches; i++) {
    const r = await fileNextBatch({ userId, map, allFacts, label: `Topics · ${project.title}` });
    if (r.filedNow === 0) break;
    map = r.map;
    total += r.filedNow;
    if (rowId) await admin.from("mind_vaults").update({ payload: map }).eq("id", rowId).eq("user_id", userId);
    else {
      const { data: ins } = await admin.from("mind_vaults").insert({ user_id: userId, kind: "topics", title, payload: map }).select("id").single();
      rowId = ins?.id ?? null;
    }
    if (r.remaining === 0) break;
  }
  return total;
}
