/**
 * Viewer Core Brain server functions.
 */
import { createServerFn } from "@tanstack/react-start";
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

function toBrain(row: unknown): ViewerBrain {
  const r = row as Record<string, unknown>;
  const payload = ensurePayload(r.payload);
  return {
    id: String(r.id),
    userId: String(r.user_id),
    mindId: String(r.mind_id),
    projectId: r.project_id ? String(r.project_id) : null,
    creatorUserId: r.creator_user_id ? String(r.creator_user_id) : null,
    sharedWithCreator: Boolean(r.shared_with_creator),
    payload,
    stats: {
      sessions: Number(r.sessions ?? 0),
      talkSeconds: Number(r.talk_seconds ?? 0),
      lastSeenAt: r.last_seen_at ? String(r.last_seen_at) : null,
      stage: stageFromTalks(Number(r.sessions ?? 0)),
    },
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export const loadViewerBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string }) => input)
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
      // Resolve creator_user_id from project/mind when possible.
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
      return toBrain(inserted);
    }
    return toBrain(row);
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
    return (data ?? []).map(toBrain);
  });

export const mergeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      mindId: string;
      startedAt: string;
      endedAt: string;
      mode: "chat" | "voice" | "video";
      turns: { role: "user" | "agent"; text: string }[];
      seconds: number;
      lang: string;
      latestUpdateTitle?: string;
    }) => input,
  )
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
      brain = toBrain(inserted);
    } else {
      brain = toBrain(existing);
    }

    const next = mergeSessionIntoBrain(brain, data);
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

export const updateBrainPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; payload: ViewerBrainPayload }) => input)
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
    const next: ViewerBrainPayload = {
      ...merged,
      aboutMe: data.payload.aboutMe?.map((f) => ({ ...f, editedByUser: true })) ?? merged.aboutMe,
      topics: data.payload.topics ?? merged.topics,
      blockedTopics: data.payload.blockedTopics ?? merged.blockedTopics,
      goals: data.payload.goals ?? merged.goals,
      level: data.payload.level ?? merged.level,
      summary: data.payload.summary ?? merged.summary,
    };
    const { error } = await supabase
      .from("viewer_brains")
      .update({ payload: sanitizePayload(next) })
      .eq("user_id", userId)
      .eq("mind_id", data.mindId);
    if (error) throw error;
    return { ok: true };
  });

export const editFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; factId: string; key: string; value: string }) => input)
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

export const deleteFact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; factId: string }) => input)
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

export const editMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; momentId: string; title: string; note?: string }) => input)
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
    const moments: BrainMoment[] = (p.moments ?? []).map((m) =>
      m.id === data.momentId ? { ...m, title: data.title, note: data.note ?? m.note, pinnedByUser: true } : m,
    );
    if (!moments.some((m) => m.id === data.momentId)) {
      moments.push({
        id: data.momentId,
        date: new Date().toISOString(),
        title: data.title,
        note: data.note,
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

export const deleteMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; momentId: string }) => input)
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

export const editThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; threadId: string; topic: string; status: "open" | "closed" }) => input)
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

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; threadId: string }) => input)
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

export const setBrainSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; shared: boolean }) => input)
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

export const eraseBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string }) => input)
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

export const eraseSince = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; since: string }) => input)
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
