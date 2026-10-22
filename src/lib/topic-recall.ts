/** Read-only subtree recall. Never changes saved knowledge. */
import { MAX_TOPIC_CHUNKS } from "./chat-context-budget";
export type RecallTopic = { id: string; title: string; group: string; summary: string; parentId?: string; facts: { text: string; ts: string; videoId: string }[] };
const STOP = new Set("the a an and or is are to of in on for with it this that you your what how why tell about more detail company companies technology development future please".split(" "));
const tokens = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 2 && !STOP.has(w));
const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function recallBranch(topics: RecallTopic[], query: string, bridged: string[], focusId?: string | null, maxFacts = 30, focusTitle?: string) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const focus = (focusId ? byId.get(focusId) : undefined) ?? topics.find((t) => focusTitle && key(t.title) === key(focusTitle));
  const q = new Set([...tokens(query), ...bridged.flatMap(tokens)]);
  const entities = ["grok", "xai"].filter((e) => ` ${key(query)} `.includes(` ${e} `) || (e === "grok" && /грок|\bgroq\b/iu.test(query)) || (e === "xai" && /\bx\s+ai\b/i.test(query)));
  const score = (text: string) => tokens(text).filter((w) => q.has(w) || [...q].some((k) => k.length > 4 && w.startsWith(k.slice(0, 5)))).length;
  const ranked = topics.map((t) => ({ t, head: score(t.title), entity: entities.some((e) => tokens(t.title).includes(e) || t.facts.some((f) => tokens(f.text).includes(e))), score: score(t.title) * 5 + Math.min(score(t.summary), 3) + Math.min(t.facts.reduce((n, f) => n + score(f.text), 0), 5) }))
    .filter((x) => x.head > 0 || x.entity).sort((a, b) => Number(b.entity) - Number(a.entity) || b.score - a.score);
  const roots = focus ? [focus] : ranked.filter((x) => !entities.length || x.entity).slice(0, 1).map((x) => x.t);
  const selected: RecallTopic[] = []; const seen = new Set<string>(); const queue = [...roots];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]; if (!t || seen.has(t.id)) continue;
    seen.add(t.id); selected.push(t); queue.push(...topics.filter((c) => c.parentId === t.id));
  }
  // Rank across all depths before limiting chunks; a large parent cannot hide a relevant child.
  const chunks = selected.map((t, order) => ({ t, order, score: score(t.title) * 5 + score(t.summary) + Math.max(0, ...t.facts.map((f) => score(f.text))) }))
    .filter(({ t }) => t.facts.length > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, MAX_TOPIC_CHUNKS);
  const buckets = chunks.map(({ t }) => t.facts.map((f) => ({ f, score: score(f.text) })).sort((a, b) => b.score - a.score));
  const picked: RecallTopic["facts"] = []; const used = new Set<string>();
  const add = (f: RecallTopic["facts"][number]) => { const id = `${f.videoId}|${f.ts}|${f.text}`; if (!used.has(id) && picked.length < maxFacts) { used.add(id); picked.push(f); } };
  // Query hits across all depths first, then round-robin every branch.
  buckets.flat().filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.ceil(maxFacts / 2)).forEach((x) => add(x.f));
  for (let round = 0; picked.length < maxFacts && buckets.some((b) => round < b.length); round++) for (const b of buckets) { const x = b[round]; if (x) add(x.f); }
  const titles = roots.map((r) => {
    const path = [r.title]; const visited = new Set([r.id]); let p = r.parentId ? byId.get(r.parentId) : undefined;
    while (p && !visited.has(p.id)) { visited.add(p.id); path.unshift(p.title); p = p.parentId ? byId.get(p.parentId) : undefined; }
    return [r.group, ...path].filter(Boolean).join(" › ");
  });
  return { titles, facts: picked.map((f) => `${f.ts ? `[${f.ts}] ` : ""}${f.text.slice(0, 360)}${f.ts && /^[\w-]{11}$/.test(f.videoId) ? ` (src=${f.videoId}@${f.ts})` : ""}`) };
}