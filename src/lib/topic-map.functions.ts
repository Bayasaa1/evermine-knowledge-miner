import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TopicMap } from "@/lib/topic-map.server";

/** The topic map lives in a private vault row (kind "topics", title "topics:<projectId>", no project link). */
const titleOf = (projectId: string) => `topics:${projectId}`;

const input = z.object({ projectId: z.string().uuid() });

export const getTopicMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { factsOfVault } = await import("@/lib/topic-map.server");
    const [{ data: row }, { data: vaults }] = await Promise.all([
      context.supabase
        .from("mind_vaults")
        .select("payload")
        .eq("user_id", context.userId)
        .eq("kind", "topics")
        .eq("title", titleOf(data.projectId))
        .maybeSingle(),
      context.supabase
        .from("mind_vaults")
        .select("id,payload")
        .eq("user_id", context.userId)
        .eq("project_id", data.projectId)
        .eq("kind", "mine"),
    ]);
    const map = (row?.payload ?? null) as TopicMap | null;
    const total = (vaults ?? []).reduce(
      (n, v) => n + factsOfVault(v.id as string, (v.payload ?? {}) as Record<string, unknown>).length,
      0,
    );
    const filed = new Set(map?.filed ?? []);
    const pending = (vaults ?? []).reduce(
      (n, v) =>
        n + factsOfVault(v.id as string, (v.payload ?? {}) as Record<string, unknown>).filter((f) => !filed.has(f.id)).length,
      0,
    );
    return { map, total, pending };
  });

/** Files one batch of new facts. The client calls it again until `remaining` is 0. */
export const growTopicMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { factsOfVault, fileNextBatch } = await import("@/lib/topic-map.server");
    const { data: project } = await context.supabase
      .from("projects")
      .select("id,title")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!project) throw new Error("Project not found");

    const { data: vaults } = await context.supabase
      .from("mind_vaults")
      .select("id,payload,updated_at")
      .eq("user_id", context.userId)
      .eq("project_id", data.projectId)
      .eq("kind", "mine")
      .order("updated_at", { ascending: true });
    const allFacts = (vaults ?? []).flatMap((v) => factsOfVault(v.id as string, (v.payload ?? {}) as Record<string, unknown>));

    const { data: row } = await context.supabase
      .from("mind_vaults")
      .select("id,payload")
      .eq("user_id", context.userId)
      .eq("kind", "topics")
      .eq("title", titleOf(data.projectId))
      .maybeSingle();
    const current: TopicMap =
      (row?.payload as TopicMap | null) ?? {
        version: 1,
        projectId: data.projectId,
        updatedAt: new Date().toISOString(),
        topics: [],
        filed: [],
      };

    const { map, remaining, filedNow } = await fileNextBatch({
      userId: context.userId,
      map: current,
      allFacts,
      label: `Topics · ${project.title}`,
    });
    if (filedNow > 0) {
      const { error } = row
        ? await context.supabase.from("mind_vaults").update({ payload: map as never }).eq("id", row.id).eq("user_id", context.userId)
        : await context.supabase
            .from("mind_vaults")
            .insert({ user_id: context.userId, kind: "topics", title: titleOf(data.projectId), payload: map as never });
      if (error) throw new Error(error.message);
    }
    return { map, remaining, filedNow };
  });
