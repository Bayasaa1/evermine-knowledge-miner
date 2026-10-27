/**
 * Viewer Core Brain server functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ensurePayload,
  mergeSessionIntoBrain,
  sanitizePayload,
  stageFromTalks,
  type ViewerBrain,
  type ViewerBrainPayload,
  type BrainFact,
  type BrainMoment,
  type BrainThread,
} from "@/lib/viewer-brain";

type BrainRow = {
  id: string;
  user_id: string;
  mind_id: string;
  project_id: string | null;
  creator_user_id: string | null;
  shared_with_creator: boolean;
  payload: unknown;
  sessions: number;
  talk_seconds: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

function toBrain(row: BrainRow): ViewerBrain {
  const payload = ensurePayload(row.payload);
  return {
    id: row.id,
    userId: row.user_id,
    mindId: row.mind_id,
    projectId: row.project_id,
    creatorUserId: row.creator_user_id,
    sharedWithCreator: row.shared_with_creator,
    payload,
    stats: {
      sessions: row.sessions,
      talkSeconds: row.talk_seconds,
      lastSeenAt: row.last_seen_at,
      stage: stageFromTalks(row.sessions),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MindIdInput = z.object({ mindId: z.string() });

export const loadViewerBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MindIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("viewer_brains")
      .select("*")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      const { data: project } = await supabase
        .from("projects")
        .select("id, user_id")
        .eq("id", data.mindId.replace("project:", ""))
        .maybeSingle();
      const creatorId = project?.user_id ?? null;
      const { data: inserted, error: insertErr } = await supabase
        .from("viewer_brains")
        .insert({
          user_id: userId,
          mind_id: data.mindId,
          project_id: project?.id ?? null,
          creator_user_id: creatorId,
          payload: {},
        })
        .select("*")
        .single();
      if (insertErr) throw insertErr;
      return toBrain(inserted as BrainRow);
    }
    return toBrain(row as BrainRow);
  });

export const listViewerBrains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("viewer_brains")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const brains = (data ?? []).map((r) => toBrain(r as BrainRow));
    const ids = brains
      .map((b) => (b.mindId.startsWith("project:") ? b.mindId.slice(8) : b.projectId))
      .filter((v): v is string => !!v && /^[0-9a-f-]{36}$/i.test(v));
    const names = new Map<string, { title: string; creator: string }>();
    if (ids.length) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id,title,creator_name")
        .in("id", ids);
      for (const p of projects ?? []) names.set(p.id, { title: p.title, creator: p.creator_name });
    }
    return brains.map((b) => {
      const pid = b.mindId.startsWith("project:") ? b.mindId.slice(8) : b.projectId;
      const n = pid ? names.get(pid) : undefined;
      return { ...b, projectTitle: n?.title ?? null, creatorName: n?.creator ?? null };
    });
  });

const MergeSessionInput = z.object({
  mindId: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  mode: z.enum(["chat", "voice", "video"]),
  turns: z.array(z.object({ role: z.enum(["user", "agent"]), text: z.string() })),
  seconds: z.number(),
  lang: z.string(),
  latestUpdateTitle: z.string().optional(),
});

export const mergeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MergeSessionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("*")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .maybeSingle();

    let brain: ViewerBrain;
    if (!existing) {
      const { data: project } = await supabase
        .from("projects")
        .select("id, user_id")
        .eq("id", data.mindId.replace("project:", ""))
        .maybeSingle();
      const { data: inserted, error } = await supabase
        .from("viewer_brains")
        .insert({
          user_id: userId,
          mind_id: data.mindId,
          project_id: project?.id ?? null,
          creator_user_id: project?.user_id ?? null,
          payload: {},
        })
        .select("*")
        .single();
      if (error) throw error;
      brain = toBrain(inserted as BrainRow);
    } else {
      brain = toBrain(existing as BrainRow);
    }

    const next = mergeSessionIntoBrain(brain, {
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      mode: data.mode,
      turns: data.turns,
      seconds: data.seconds,
      lang: data.lang,
      latestUpdateTitle: data.latestUpdateTitle,
    });
    const { error } = await supabase
      .from("viewer_brains")
      .update({
        payload: sanitizePayload(next.payload),
        sessions: next.stats.sessions,
        talk_seconds: next.stats.talkSeconds,
        last_seen_at: next.stats.lastSeenAt,
      })
      .eq("id", next.id)
      .eq("user_id", userId);
    if (error) throw error;
    return next;
  });

const BrainPayloadInput = z.object({ mindId: z.string(), payload: z.custom<Partial<ViewerBrainPayload>>() });

export const updateBrainPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BrainPayloadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("payload")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .single();
    if (!existing) throw new Error("Brain not found");
    const merged = ensurePayload(existing.payload);
    const patch = data.payload;
    const aboutMe: BrainFact[] =
      patch.aboutMe?.map((f) => ({ ...f, editedByUser: true })) ?? merged.aboutMe;
    const next: ViewerBrainPayload = {
      aboutMe,
      topics: patch.topics ?? merged.topics,
      blockedTopics: patch.blockedTopics ?? merged.blockedTopics,
      moments: merged.moments,
      achievements: merged.achievements,
      threads: merged.threads,
      summary: patch.summary ?? merged.summary,
      earliestSummary: merged.earliestSummary,
      languages: merged.languages,
      level: patch.level ?? merged.level,
      goals: patch.goals ?? merged.goals,
    };
    const { error } = await supabase
      .from("viewer_brains")
      .update({ payload: sanitizePayload(next) })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

const EditFactInput = z.object({ mindId: z.string(), factId: z.string(), key: z.string(), value: z.string() });

export const editFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EditFactInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("payload")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .single();
    if (!existing) throw new Error("Brain not found");
    const p = ensurePayload(existing.payload);
    const facts: BrainFact[] = (p.aboutMe ?? []).map((f) =>
      f.id === data.factId ? { ...f, key: data.key, value: data.value, editedByUser: true } : f,
    );
    if (!facts.some((f) => f.id === data.factId)) {
      facts.push({ id: data.factId, key: data.key, value: data.value, editedByUser: true, createdAt: new Date().toISOString() });
    }
    const { error } = await supabase
      .from("viewer_brains")
      .update({ payload: sanitizePayload({ ...p, aboutMe: facts }) })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

const FactIdInput = z.object({ mindId: z.string(), factId: z.string() });

export const deleteFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FactIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("payload")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .single();
    if (!existing) throw new Error("Brain not found");
    const p = ensurePayload(existing.payload);
    const { error } = await supabase
      .from("viewer_brains")
      .update({ payload: sanitizePayload({ ...p, aboutMe: p.aboutMe?.filter((f) => f.id !== data.factId) ?? [] }) })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

const EditMomentInput = z.object({ mindId: z.string(), momentId: z.string(), title: z.string(), note: z.string().optional() });

export const editMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EditMomentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("payload")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .single();
    if (!existing) throw new Error("Brain not found");
    const p = ensurePayload(existing.payload);
    const note = data.note ?? "";
    const moments: BrainMoment[] = (p.moments ?? []).map((m) =>
      m.id === data.momentId ? { ...m, title: data.title, note, pinnedByUser: true } : m,
    );
    if (!moments.some((m) => m.id === data.momentId)) {
      moments.push({
        id: data.momentId,
        date: new Date().toISOString(),
        title: data.title,
        note,
        pinnedByUser: true,
        source: "manual",
        createdAt: new Date().toISOString(),
      });
    }
    const { error } = await supabase
      .from("viewer_brains")
      .update({ payload: sanitizePayload({ ...p, moments }) })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

const MomentIdInput = z.object({ mindId: z.string(), momentId: z.string() });

export const deleteMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MomentIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("payload")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .single();
    if (!existing) throw new Error("Brain not found");
    const p = ensurePayload(existing.payload);
    const { error } = await supabase
      .from("viewer_brains")
      .update({ payload: sanitizePayload({ ...p, moments: p.moments?.filter((m) => m.id !== data.momentId) ?? [] }) })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

const EditThreadInput = z.object({ mindId: z.string(), threadId: z.string(), topic: z.string(), status: z.enum(["open", "closed"]) });

export const editThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EditThreadInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("payload")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .single();
    if (!existing) throw new Error("Brain not found");
    const p = ensurePayload(existing.payload);
    const threads: BrainThread[] = (p.threads ?? []).map((t) =>
      t.id === data.threadId ? { ...t, topic: data.topic, status: data.status } : t,
    );
    if (!threads.some((t) => t.id === data.threadId)) {
      threads.push({ id: data.threadId, topic: data.topic, status: data.status, createdAt: new Date().toISOString() });
    }
    const { error } = await supabase
      .from("viewer_brains")
      .update({ payload: sanitizePayload({ ...p, threads }) })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

const ThreadIdInput = z.object({ mindId: z.string(), threadId: z.string() });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ThreadIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("payload")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .single();
    if (!existing) throw new Error("Brain not found");
    const p = ensurePayload(existing.payload);
    const { error } = await supabase
      .from("viewer_brains")
      .update({ payload: sanitizePayload({ ...p, threads: p.threads?.filter((t) => t.id !== data.threadId) ?? [] }) })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

const SharingInput = z.object({ mindId: z.string(), shared: z.boolean() });

export const setBrainSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SharingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("viewer_brains")
      .update({ shared_with_creator: data.shared })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

const EraseBrainInput = z.object({ mindId: z.string() });

export const eraseBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EraseBrainInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("viewer_brains")
      .delete()
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

const EraseSinceInput = z.object({ mindId: z.string(), since: z.string() });

export const eraseSince = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => EraseSinceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("payload")
      .eq("user_id", userId)
      .eq("mind_id", data.mindId)
      .single();
    if (!existing) throw new Error("Brain not found");
    const p = ensurePayload(existing.payload);
    const since = new Date(data.since).toISOString();
    const { error } = await supabase
      .from("viewer_brains")
      .update({
        payload: sanitizePayload({
          ...p,
          moments: p.moments?.filter((m) => m.date >= since) ?? [],
        }),
      })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

// ---- Feed interests (TikTok-style onboarding), stored as a dedicated row ----
const FEED_INTERESTS_MIND = "global_interests";

export const loadFeedInterests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("viewer_brains")
      .select("payload")
      .eq("user_id", userId)
      .eq("mind_id", FEED_INTERESTS_MIND)
      .maybeSingle();
    const { sanitizeInterests } = await import("@/lib/feed-interests");
    return sanitizeInterests((data?.payload as { interests?: unknown } | null)?.interests ?? null);
  });

export const saveFeedInterests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ tags: z.array(z.string().max(40)).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { sanitizeInterests } = await import("@/lib/feed-interests");
    const interests = sanitizeInterests({ tags: data.tags, updatedAt: new Date().toISOString() });
    if (!interests) throw new Error("Pick at least one interest");
    const { data: existing } = await supabase
      .from("viewer_brains")
      .select("id")
      .eq("user_id", userId)
      .eq("mind_id", FEED_INTERESTS_MIND)
      .maybeSingle();
    const payload = { interests } as never;
    const res = existing
      ? await supabase.from("viewer_brains").update({ payload }).eq("id", existing.id)
      : await supabase.from("viewer_brains").insert({ user_id: userId, mind_id: FEED_INTERESTS_MIND, payload });
    if (res.error) throw res.error;
    return interests;
  });
