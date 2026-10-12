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
    const stats = map ? await topicStats(context.supabase, context.userId, data.projectId, map) : {};
    return { map, total, pending, stats };
  });

export type TopicStat = { questions: { text: string; count: number }[]; qCount: number; reports: string[]; rCount: number };

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );

/** Matches viewer questions and reports to the topic they talk about most. Read-only. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function topicStats(sb: any, userId: string, projectId: string, map: TopicMap): Promise<Record<string, TopicStat>> {
  const { data: content } = await sb.from("project_content").select("mind_id").eq("project_id", projectId);
  const mindIds = [`project:${projectId}`, ...((content ?? []) as { mind_id: string }[]).map((c) => c.mind_id).filter(Boolean)];
  const [{ data: signals }, { data: chats }] = await Promise.all([
    sb.from("viewer_signals").select("kind,body,topic").eq("creator_user_id", userId).in("mind_id", mindIds).limit(2000),
    sb.from("chat_messages").select("body").eq("user_id", userId).eq("role", "user").in("mind_id", mindIds).limit(2000),
  ]);
  const index = map.topics.map((t) => ({
    id: t.id,
    title: t.title.toLowerCase(),
    w: words(`${t.title} ${t.title} ${t.summary} ${t.facts.slice(0, 30).map((f) => f.text).join(" ")}`),
  }));
  const best = (text: string): string | null => {
    const lower = text.toLowerCase();
    const q = words(text);
    let top: string | null = null;
    let score = 0;
    for (const t of index) {
      let s = lower.includes(t.title) ? 5 : 0;
      for (const w of q) if (t.w.has(w)) s++;
      if (s > score) { score = s; top = t.id; }
    }
    return score >= 2 ? top : null;
  };
  const out: Record<string, TopicStat> = {};
  const get = (id: string) => (out[id] ??= { questions: [], qCount: 0, reports: [], rCount: 0 });
  const ask = (text: string, topic?: string | null) => {
    const id = (topic && map.topics.find((t) => t.title.toLowerCase() === topic.toLowerCase())?.id) || best(text);
    if (!id) return;
    const st = get(id);
    st.qCount++;
    const key = text.trim().slice(0, 200);
    const hit = st.questions.find((x) => x.text.toLowerCase() === key.toLowerCase());
    if (hit) hit.count++;
    else st.questions.push({ text: key, count: 1 });
  };
  for (const s of (signals ?? []) as { kind: string; body: string; topic: string | null }[]) {
    if (s.kind === "report") {
      const id = (s.topic && map.topics.find((t) => t.title.toLowerCase() === s.topic!.toLowerCase())?.id) || best(s.body);
      if (!id) continue;
      const st = get(id);
      st.rCount++;
      if (st.reports.length < 20) st.reports.push(s.body.slice(0, 300));
    } else if (s.kind === "question") ask(s.body, s.topic);
  }
  for (const c of (chats ?? []) as { body: string }[]) if (c.body.trim().length > 6) ask(c.body);
  for (const st of Object.values(out)) st.questions = st.questions.sort((a, b) => b.count - a.count).slice(0, 15);
  return out;
}

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
