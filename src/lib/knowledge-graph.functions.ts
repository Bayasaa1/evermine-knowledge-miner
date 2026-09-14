/**
 * Server side of the project knowledge graph.
 *
 * A creator may hold a thousand videos in one project. The browser must never
 * download all of them, so all grouping and counting happens here and the
 * client receives a few hundred summarised rows.
 *
 * `project_concepts` is a cache, not a second source of truth: it can always be
 * rebuilt from `project_content` and `mind_vaults`, which is exactly what
 * happens for Core Brains mined before this index existed.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractConcepts, extractVaultConcepts, type ConceptKind } from "@/lib/knowledge-graph";

const projectInput = z.object({ projectId: z.string().uuid() });

export type ProjectOverview = {
  projectId: string;
  title: string;
  published: boolean;
  videos: number;
  concepts: number;
  updatedAt: string;
};

/** Per-project counts for the persona-level overview. No mega-canvas. */
export const listProjectOverviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ personaId: z.string().uuid().nullable() }).parse(input))
  .handler(async ({ data, context }): Promise<ProjectOverview[]> => {
    let q = context.supabase
      .from("projects")
      .select("id,title,published,updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    q = data.personaId ? q.eq("persona_id", data.personaId) : q.is("persona_id", null);
    const { data: projects, error } = await q;
    if (error) throw new Error(error.message);
    const rows = projects ?? [];
    if (rows.length === 0) return [];

    const ids = rows.map((p) => p.id);
    const { data: contents } = await context.supabase
      .from("project_content")
      .select("project_id")
      .eq("user_id", context.userId)
      .in("project_id", ids);
    const { data: concepts } = await context.supabase
      .from("project_concepts")
      .select("project_id")
      .eq("user_id", context.userId)
      .in("project_id", ids);

    const videoCount = new Map<string, number>();
    for (const c of contents ?? []) videoCount.set(c.project_id, (videoCount.get(c.project_id) ?? 0) + 1);
    const conceptCount = new Map<string, number>();
    for (const c of concepts ?? []) conceptCount.set(c.project_id, (conceptCount.get(c.project_id) ?? 0) + 1);

    return rows.map((p) => ({
      projectId: p.id,
      title: p.title,
      published: p.published,
      videos: videoCount.get(p.id) ?? 0,
      concepts: conceptCount.get(p.id) ?? 0,
      updatedAt: p.updated_at,
    }));
  });

export type ClusterRow = { concept: string; label: string; kind: ConceptKind; count: number };

/** Topic clusters + totals for one project — the graph's first zoom level. */
export const projectGraphSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => projectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { count: videos } = await context.supabase
      .from("project_content")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId);

    const { data: rows, error } = await context.supabase
      .from("project_concepts")
      .select("concept,label,kind,count")
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .order("count", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);

    const clusters = (rows ?? []).map((r) => ({
      concept: r.concept,
      label: r.label || r.concept,
      kind: r.kind as ConceptKind,
      count: r.count,
    }));

    return {
      videos: videos ?? 0,
      concepts: clusters.length,
      clusters,
      /** An old project that was never indexed still has videos but no rows. */
      needsRebuild: clusters.length === 0 && (videos ?? 0) > 0,
    };
  });

const listInput = z.object({
  projectId: z.string().uuid(),
  concept: z.string().max(120).optional(),
  conceptKind: z.enum(["topic", "lesson", "emotion"]).optional(),
  search: z.string().max(120).optional(),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(200).default(60),
});

/** Paged videos of one project, optionally narrowed to a single cluster. */
export const listProjectVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listInput.parse(input))
  .handler(async ({ data, context }) => {
    let ids: string[] | null = null;
    if (data.concept) {
      const { data: row } = await context.supabase
        .from("project_concepts")
        .select("content_ids")
        .eq("user_id", context.userId)
        .eq("project_id", data.projectId)
        .eq("kind", data.conceptKind ?? "topic")
        .eq("concept", data.concept)
        .maybeSingle();
      ids = (row?.content_ids as string[] | null) ?? [];
      if (ids.length === 0) return { rows: [], total: 0 };
    }

    let q = context.supabase
      .from("project_content")
      .select("id,title,youtube_id,source_url,kind,created_at,tags,view_count", { count: "exact" })
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId);
    if (ids) q = q.in("id", ids.slice(0, 1000));
    if (data.search) q = q.ilike("title", `%${data.search}%`);

    const { data: rows, count, error } = await q
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);

    return {
      total: count ?? 0,
      rows: (rows ?? []).map((r) => ({
        id: r.id,
        title: r.title || r.youtube_id || "Untitled",
        youtubeId: r.youtube_id,
        sourceUrl: r.source_url,
        kind: r.kind,
        createdAt: r.created_at,
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        views: r.view_count,
      })),
    };
  });

/** Concepts mined from one video — loaded only when that video is opened. */
export const videoConcepts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ contentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("project_content")
      .select("tags,timeline,emotion_timeline")
      .eq("user_id", context.userId)
      .eq("id", data.contentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return [];
    return extractConcepts(row).map((c) => ({ ...c, count: 1 }));
  });

/**
 * Rebuilds the concept index for one project from the data already mined.
 * Existing Core Brains need no re-mining: this reads what they already stored.
 */
export const rebuildProjectConcepts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => projectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase
      .from("projects")
      .select("id")
      .eq("user_id", context.userId)
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("Project not found");

    const buckets = new Map<string, { concept: string; label: string; kind: ConceptKind; ids: Set<string> }>();
    const add = (c: { concept: string; label: string; kind: ConceptKind }, contentId: string | null) => {
      const key = `${c.kind}:${c.concept}`;
      const existing = buckets.get(key) ?? { ...c, ids: new Set<string>() };
      if (contentId) existing.ids.add(contentId);
      buckets.set(key, existing);
    };

    // Page through the content so a thousand-video project never loads at once.
    const PAGE = 500;
    for (let offset = 0; ; offset += PAGE) {
      const { data: rows, error } = await context.supabase
        .from("project_content")
        .select("id,tags,timeline,emotion_timeline")
        .eq("user_id", context.userId)
        .eq("project_id", data.projectId)
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(error.message);
      for (const row of rows ?? []) for (const c of extractConcepts(row)) add(c, row.id);
      if (!rows || rows.length < PAGE) break;
    }

    const { data: vaults } = await context.supabase
      .from("mind_vaults")
      .select("payload")
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .limit(200);
    for (const vault of vaults ?? []) for (const c of extractVaultConcepts(vault.payload)) add(c, null);

    await context.supabase
      .from("project_concepts")
      .delete()
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId);

    const payload = [...buckets.values()]
      .map((b) => ({
        project_id: data.projectId,
        user_id: context.userId,
        concept: b.concept,
        label: b.label,
        kind: b.kind,
        count: b.ids.size,
        content_ids: [...b.ids].slice(0, 1000),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 2000);

    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await context.supabase.from("project_concepts").insert(payload.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }

    return { concepts: payload.length };
  });
