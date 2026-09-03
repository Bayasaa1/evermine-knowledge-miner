/**
 * Obsidian-style knowledge graph model for one Persona.
 *
 * The graph is derived (never duplicated) from data that already exists:
 *   Persona  → Projects/Vaults → Mined content (.json.md) → Concepts
 * plus user-defined links stored in `graph_links`.
 *
 * Everything here is pure data shaping; rendering lives in
 * `src/components/knowledge-graph.tsx`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Project, ProjectContent } from "@/lib/projects";
import type { VaultRow } from "@/lib/cloud-vault.functions";
import type { MindPayload } from "@/lib/mind-json";

export type GraphNodeKind = "persona" | "project" | "content" | "concept";

export type GraphNode = {
  key: string;
  kind: GraphNodeKind;
  label: string;
  /** Topic bucket used by the "Filter by topic" control. */
  topic: string;
  meta: {
    projectId?: string;
    contentId?: string;
    vaultId?: string;
    youtubeId?: string;
    sourceUrl?: string;
    timestamp?: number;
    payload?: unknown;
    detail?: string;
  };
};

export type GraphLink = { source: string; target: string; custom?: boolean; id?: string };

export type GraphModel = { nodes: GraphNode[]; links: GraphLink[]; topics: string[] };

export const NODE_RADIUS: Record<GraphNodeKind, number> = {
  persona: 22,
  project: 14,
  content: 9,
  concept: 5.5,
};

const clean = (s: unknown): string => (typeof s === "string" ? s.trim() : "");

const conceptKey = (name: string) => `concept:${name.toLowerCase().slice(0, 60)}`;

/** Builds the full node/link graph for the active persona scope. */
export function buildGraph(input: {
  personaKey: string;
  personaName: string;
  projects: Project[];
  content: ProjectContent[];
  vaults: VaultRow[];
  customLinks: CustomLink[];
}): GraphModel {
  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const topics = new Set<string>();

  const push = (node: GraphNode) => {
    if (!nodes.has(node.key)) nodes.set(node.key, node);
    return node.key;
  };
  const link = (source: string, target: string) => {
    if (source !== target && nodes.has(source) && nodes.has(target)) links.push({ source, target });
  };

  const root = push({
    key: "persona",
    kind: "persona",
    label: input.personaName,
    topic: "persona",
    meta: { detail: `${input.projects.length} projects · ${input.content.length} mined items` },
  });

  for (const p of input.projects) {
    const key = `project:${p.id}`;
    push({
      key,
      kind: "project",
      label: p.title,
      topic: "project",
      meta: { projectId: p.id, detail: p.description || "" },
    });
    link(root, key);
  }

  for (const item of input.content) {
    const key = `content:${item.id}`;
    push({
      key,
      kind: "content",
      label: item.title || item.youtube_id || "Untitled",
      topic: item.kind === "TRAINING_ONLY" ? "training" : "visual",
      meta: {
        contentId: item.id,
        projectId: item.project_id,
        youtubeId: item.youtube_id,
        sourceUrl: item.source_url,
        detail: item.description || "",
      },
    });
    link(`project:${item.project_id}`, key);

    for (const tag of item.tags ?? []) {
      const name = clean(tag);
      if (!name) continue;
      topics.add(name);
      const ck = push({ key: conceptKey(name), kind: "concept", label: name, topic: name, meta: { detail: "tag" } });
      link(key, ck);
    }

    for (const mark of (item.timeline ?? []).slice(0, 12)) {
      const name = clean(mark.label);
      if (!name) continue;
      const ck = push({
        key: `${conceptKey(name)}:${item.id}`,
        kind: "concept",
        label: name,
        topic: "lesson",
        meta: { youtubeId: item.youtube_id, sourceUrl: item.source_url, timestamp: mark.t, detail: "lesson" },
      });
      link(key, ck);
    }

    for (const mark of (item.emotion_timeline ?? []).slice(0, 10)) {
      const name = clean(mark.emotion ?? mark.label);
      if (!name) continue;
      const ck = push({
        key: `emotion:${name.toLowerCase()}`,
        kind: "concept",
        label: name,
        topic: "emotion",
        meta: { detail: "emotion" },
      });
      link(key, ck);
    }
  }

  for (const vault of input.vaults) {
    const key = `vault:${vault.id}`;
    const payload = (vault.payload ?? {}) as MindPayload;
    push({
      key,
      kind: "content",
      label: vault.title,
      topic: "json",
      meta: { vaultId: vault.id, projectId: vault.projectId ?? undefined, payload, detail: ".json.md core brain" },
    });
    link(vault.projectId ? `project:${vault.projectId}` : root, key);

    const result = (payload.result ?? {}) as Record<string, unknown>;
    const knowledge = Array.isArray(result['knowledgeNodes']) ? (result['knowledgeNodes'] as Record<string, unknown>[]) : [];
    for (const node of knowledge.slice(0, 40)) {
      const name = clean(node['concept_title'] ?? node['title'] ?? node['concept']);
      if (!name) continue;
      topics.add(name);
      const ck = push({
        key: conceptKey(name),
        kind: "concept",
        label: name,
        topic: name,
        meta: { payload: node, detail: clean(node['summary'] ?? node['description']) },
      });
      link(key, ck);
    }
  }

  for (const cl of input.customLinks) {
    if (nodes.has(cl.sourceKey) && nodes.has(cl.targetKey)) {
      links.push({ source: cl.sourceKey, target: cl.targetKey, custom: true, id: cl.id });
    }
  }

  return { nodes: [...nodes.values()], links, topics: [...topics].sort().slice(0, 60) };
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
  const { error } = await supabase.from("graph_links").delete().eq("id", id);
  return error?.message ?? null;
}
