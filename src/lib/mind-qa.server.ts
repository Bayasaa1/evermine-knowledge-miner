/**
 * Creator-written extras for a project mind: official stances (Q&A), bio,
 * tags and greeting. Read with the service client, but only for PUBLISHED
 * projects, and only creator-authored fields are returned.
 */
export type CreatorExtras = {
  personaName: string;
  bio: string;
  greeting: string;
  tags: string[];
  qa: { question: string; answer: string; suggest: boolean }[];
  topics: string[];
  /** Real questions asked in the mined videos. */
  minedQuestions: string[];
  /** Root-map sub-branches per topic, so chat can dig deeper inside one branch. */
  branches: Record<string, string[]>;
};

type MapTopic = { id: string; title: string; summary?: string; group?: string; parentId?: string; facts?: unknown[] };
const words = (s: string) => new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2));

/** Read-only: maps each chat topic to the Root-map branches it covers. */
export function branchesFor(topics: string[], mapTopics: MapTopic[]): Record<string, string[]> {
  const size = (t: MapTopic) => t.facts?.length ?? 0;
  const sorted = [...mapTopics].filter((t) => t.title).sort((a, b) => size(b) - size(a));
  const out: Record<string, string[]> = {};
  for (const topic of Array.from(new Set([...topics, ...sorted.map((t) => t.title)]))) {
    const w = words(topic);
    const exact = sorted.find((t) => t.title.toLowerCase() === topic.toLowerCase());
    let subs = exact ? sorted.filter((t) => t.parentId === exact.id) : [];
    if (!exact && !subs.length) {
      subs = sorted.filter((t) => {
        const tw = words(`${t.title} ${t.group ?? ""} ${t.summary ?? ""}`);
        return [...w].some((x) => tw.has(x) || [...tw].some((y) => y.startsWith(x.slice(0, 5)) && x.length >= 5));
      });
    }
    out[topic] = Array.from(new Set(subs.map((t) => t.title)));
  }
  return out;
}

export async function loadCreatorExtras(mindId: string): Promise<CreatorExtras | null> {
  if (!mindId.startsWith("project:")) return null;
  const projectId = mindId.slice(8);
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, persona_id, creator_name, published")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || !project.published) return null;
  const [persona, qa, concepts, map] = await Promise.all([
    project.persona_id
      ? supabaseAdmin.from("creator_personas").select("name, bio, greeting, tags").eq("id", project.persona_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from("mind_qa").select("question, answer, suggest").eq("project_id", projectId).order("sort").limit(50),
    supabaseAdmin.from("project_concepts").select("label, count").eq("project_id", projectId).order("count", { ascending: false }).limit(8),
    supabaseAdmin.from("mind_vaults").select("payload").eq("kind", "topics").eq("title", `topics:${projectId}`).limit(1).maybeSingle(),
  ]);
  const mapTopics = ((map.data?.payload as { topics?: MapTopic[] } | null)?.topics ?? []);
  // Real Root-map topics (richest first) lead; generic concept labels fill in after.
  const rootTopics = mapTopics.filter((t) => t.title && !t.parentId)
    .sort((a, b) => (b.facts?.length ?? 0) - (a.facts?.length ?? 0)).map((t) => t.title);
  const topics = Array.from(new Set(rootTopics.length ? rootTopics : (concepts.data ?? []).map((c) => c.label).filter(Boolean)));
  const p = persona.data as { name: string; bio: string; greeting: string; tags: string[] } | null;
  const personaName = p?.name ?? project.creator_name ?? "";
  return {
    personaName,
    bio: p?.bio ?? "",
    greeting: p?.greeting ?? "",
    tags: p?.tags ?? [],
    qa: (qa.data ?? []).filter((r) => r.question.trim()),
    topics,
    branches: branchesFor(topics, mapTopics),
    minedQuestions: await loadMinedQuestions(supabaseAdmin, projectId, personaName),
  };
}

type Line = { who?: string; kind?: string; text?: string; speaker?: string; speech?: string };

/**
 * Real questions people asked the persona inside the project's videos
 * (interviewer/host lines ending in "?"). Read-only, deterministic, no AI.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadMinedQuestions(admin: any, projectId: string, personaName: string): Promise<string[]> {
  try {
    const { data } = await admin
      .from("mind_vaults")
      .select("qa:payload->result->qaPairs, journal:payload->result->journal")
      .eq("project_id", projectId)
      .eq("kind", "mine")
      .order("created_at", { ascending: false })
      .limit(12);
    const owner = personaName.trim().toLowerCase();
    const perVideo: string[][] = [];
    for (const row of (data ?? []) as { qa: unknown; journal: unknown }[]) {
      const found: string[] = [];
      for (const q of Array.isArray(row.qa) ? (row.qa as { question?: string }[]) : []) {
        if (q?.question) found.push(q.question.replace(/^Guest context:\s*/i, "").trim());
      }
      for (const l of Array.isArray(row.journal) ? (row.journal as Line[]) : []) {
        if ((l?.kind ?? "speech") !== "speech") continue;
        const who = String(l.who ?? l.speaker ?? "").trim();
        const lw = who.toLowerCase();
        if (!who || lw.startsWith("video:") || lw === "chat" || lw === "donation") continue;
        if (owner && (lw === owner || lw.startsWith(owner))) continue;
        const text = String(l.text ?? l.speech ?? "").trim();
        if (!text.endsWith("?") || text.length < 25 || text.length > 160) continue;
        if (text.split(/\s+/).length < 5) continue;
        found.push(text);
      }
      if (found.length) perVideo.push(found);
    }
    // Round-robin across videos, evenly spaced inside each, so chips stay varied.
    const picks: string[] = [];
    const seen = new Set<string>();
    for (let round = 0; round < 4 && picks.length < 12; round++) {
      for (const list of perVideo) {
        const idx = Math.floor(((round * 2 + 1) * list.length) / 8);
        const q = list[Math.min(idx, list.length - 1)];
        if (!q) continue;
        const key = q.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        picks.push(q);
        if (picks.length >= 12) break;
      }
    }
    return picks;
  } catch {
    return [];
  }
}
