/**
 * Knowledge graph model — scoped to ONE project.
 *
 * A project is the unit of knowledge. Two projects never share a canvas and
 * never merge concepts, because a creator's cooking project and robot project
 * are different brains that happen to have the same owner.
 *
 * At 1000 videos you cannot draw everything, so the graph works like a map
 * with three zoom levels:
 *
 *   project  → topic clusters ("street vlogging (312)")
 *   cluster  → the videos inside one cluster
 *   video    → the concepts, lessons and emotions mined from one video
 *
 * Each level replaces the previous one, so the canvas never exceeds a few
 * hundred nodes no matter how large the library is. Heavy grouping happens
 * server-side (`knowledge-graph.functions.ts`); this file is pure shaping.
 */
import { supabase } from "@/integrations/supabase/client";
import { currentOwnerId, NOT_SIGNED_IN } from "@/lib/owner";
import type { ProjectContent } from "@/lib/projects";
import type { MindPayload } from "@/lib/mind-json";

export type GraphNodeKind = "project" | "cluster" | "content" | "concept";

/** How many nodes may ever be drawn at once, regardless of library size. */
export const MAX_NODES = 300;

export type GraphNode = {
  key: string;
  kind: GraphNodeKind;
  label: string;
  /** Relative weight: drives node size so hubs stand out. */
  weight: number;
  topic: string;
  meta: {
    projectId?: string;
    contentId?: string;
    vaultId?: string;
    youtubeId?: string;
    sourceUrl?: string;
    timestamp?: number;
    concept?: string;
    conceptKind?: ConceptKind;
    count?: number;
    payload?: unknown;
    detail?: string;
    /** Overflow node: the items that did not fit on the canvas. */
    overflow?: Array<{ key: string; label: string }>;
  };
};

export type GraphLink = { source: string; target: string; custom?: boolean; id?: string };

export type GraphModel = { nodes: GraphNode[]; links: GraphLink[] };

export const NODE_RADIUS: Record<GraphNodeKind, number> = {
  project: 22,
  cluster: 13,
  content: 9,
  concept: 6,
};

export type ConceptKind = "topic" | "lesson" | "emotion";

export type ConceptRow = {
  concept: string;
  label: string;
  kind: ConceptKind;
  count: number;
};

export type GraphLevel = "project" | "cluster" | "video";

export type VideoRow = {
  id: string;
  title: string;
  youtubeId: string;
  sourceUrl: string;
  kind: string;
  createdAt: string;
};

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

const conceptNodeKey = (kind: ConceptKind, concept: string) => `concept:${kind}:${concept}`;
const clusterKey = (kind: ConceptKind, concept: string) => `cluster:${kind}:${concept}`;

/**
 * Builds the node/link set for the level currently being viewed. Whatever the
 * project's size, the result is bounded by `MAX_NODES`.
 */
export function buildProjectGraph(input: {
  project: { id: string; title: string };
  level: GraphLevel;
  /** Topic clusters of the project (level "project"). */
  clusters: ConceptRow[];
  /** Videos of the open cluster, or the project's newest (level "cluster"). */
  videos: VideoRow[];
  /** Concepts of the open video (level "video"). */
  concepts: ConceptRow[];
  openCluster: ConceptRow | null;
  openVideo: VideoRow | null;
  totals: { videos: number; concepts: number };
}): GraphModel {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  const root: GraphNode = {
    key: `project:${input.project.id}`,
    kind: "project",
    label: input.project.title,
    weight: 1,
    topic: "project",
    meta: {
      projectId: input.project.id,
      detail: `${input.totals.videos} videos · ${input.totals.concepts} concepts`,
    },
  };
  nodes.push(root);

  const budget = MAX_NODES - 1;

  const overflowNode = (items: Array<{ key: string; label: string }>, label: string): GraphNode => ({
    key: `overflow:${label}`,
    kind: "concept",
    label: `+${items.length} more`,
    weight: 1,
    topic: "overflow",
    meta: { detail: "overflow", overflow: items },
  });

  if (input.level === "project") {
    const shown = input.clusters.slice(0, budget);
    const rest = input.clusters.slice(budget);
    const max = Math.max(1, ...shown.map((c) => c.count));
    for (const c of shown) {
      const key = clusterKey(c.kind, c.concept);
      nodes.push({
        key,
        kind: "cluster",
        label: `${c.label} (${c.count})`,
        weight: 0.5 + c.count / max,
        topic: c.kind,
        meta: { concept: c.concept, conceptKind: c.kind, count: c.count, detail: c.kind },
      });
      links.push({ source: root.key, target: key });
    }
    if (rest.length > 0) {
      const node = overflowNode(
        rest.map((c) => ({ key: clusterKey(c.kind, c.concept), label: `${c.label} (${c.count})` })),
        "clusters",
      );
      nodes.push(node);
      links.push({ source: root.key, target: node.key });
    }
    return { nodes, links };
  }

  if (input.level === "cluster" && input.openCluster) {
    const c = input.openCluster;
    const hub: GraphNode = {
      key: clusterKey(c.kind, c.concept),
      kind: "cluster",
      label: `${c.label} (${c.count})`,
      weight: 1.5,
      topic: c.kind,
      meta: { concept: c.concept, conceptKind: c.kind, count: c.count, detail: c.kind },
    };
    nodes.push(hub);
    links.push({ source: root.key, target: hub.key });
    pushVideos(input.videos, hub.key, budget - 1);
    return { nodes, links };
  }

  if (input.level === "video" && input.openVideo) {
    const v = input.openVideo;
    const hub: GraphNode = {
      key: `content:${v.id}`,
      kind: "content",
      label: v.title,
      weight: 1.5,
      topic: v.kind,
      meta: {
        contentId: v.id,
        projectId: input.project.id,
        youtubeId: v.youtubeId,
        sourceUrl: v.sourceUrl,
        detail: v.kind === "TRAINING_ONLY" ? "training only" : "feed video",
      },
    };
    nodes.push(hub);
    links.push({ source: root.key, target: hub.key });

    const shown = input.concepts.slice(0, budget - 1);
    const rest = input.concepts.slice(budget - 1);
    for (const c of shown) {
      const key = conceptNodeKey(c.kind, `${c.concept}:${v.id}`);
      nodes.push({
        key,
        kind: "concept",
        label: c.label,
        weight: 0.8,
        topic: c.kind,
        meta: { concept: c.concept, conceptKind: c.kind, detail: c.kind, contentId: v.id, youtubeId: v.youtubeId, sourceUrl: v.sourceUrl },
      });
      links.push({ source: hub.key, target: key });
    }
    if (rest.length > 0) {
      const node = overflowNode(
        rest.map((c) => ({ key: conceptNodeKey(c.kind, c.concept), label: c.label })),
        "concepts",
      );
      nodes.push(node);
      links.push({ source: hub.key, target: node.key });
    }
    return { nodes, links };
  }

  // Fallback: the project with its newest videos.
  pushVideos(input.videos, root.key, budget);
  return { nodes, links };

  function pushVideos(videos: VideoRow[], parent: string, room: number) {
    const shown = videos.slice(0, room);
    const rest = videos.slice(room);
    for (const v of shown) {
      const key = `content:${v.id}`;
      nodes.push({
        key,
        kind: "content",
        label: v.title,
        weight: 1,
        topic: v.kind,
        meta: {
          contentId: v.id,
          projectId: input.project.id,
          youtubeId: v.youtubeId,
          sourceUrl: v.sourceUrl,
          detail: v.kind === "TRAINING_ONLY" ? "training only" : "feed video",
        },
      });
      links.push({ source: parent, target: key });
    }
    if (rest.length > 0) {
      const node = overflowNode(rest.map((v) => ({ key: `content:${v.id}`, label: v.title })), "videos");
      nodes.push(node);
      links.push({ source: parent, target: node.key });
    }
  }
}

export type CustomLink = {
  id: string;
  personaId: string | null;
  sourceKey: string;
  targetKey: string;
  label: string;
};

export async function listCustomLinks(userId: string, personaId: string | null): Promise<CustomLink[]> {
  let query = supabase.from("graph_links").select("id,persona_id,source_key,target_key,label").eq("user_id", userId);
  query = personaId ? query.eq("persona_id", personaId) : query.is("persona_id", null);
  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: r.id,
    personaId: r.persona_id,
    sourceKey: r.source_key,
    targetKey: r.target_key,
    label: r.label,
  }));
}

export async function createCustomLink(
  userId: string,
  personaId: string | null,
  sourceKey: string,
  targetKey: string,
): Promise<string | null> {
  const { error } = await supabase
    .from("graph_links")
    .insert({ user_id: userId, persona_id: personaId, source_key: sourceKey, target_key: targetKey });
  return error?.message ?? null;
}

export async function deleteCustomLink(id: string): Promise<string | null> {
  const owner = await currentOwnerId();
  if (!owner) return NOT_SIGNED_IN;
  const { error } = await supabase.from("graph_links").delete().eq("id", id).eq("user_id", owner);
  return error?.message ?? null;
}

/** Concepts of one already-loaded content row, for instant local expansion. */
export function conceptsOf(row: ProjectContent): ConceptRow[] {
  return extractConcepts(row).map((c) => ({ ...c, count: 1 }));
}
