/**
 * Creator updates and read receipts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      projectId: string;
      mindId: string;
      title: string;
      body: string;
      kind?: "content" | "mind_version" | "announcement";
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("creator_updates").insert({
      creator_user_id: userId,
      project_id: data.projectId,
      mind_id: data.mindId,
      title: data.title,
      body: data.body,
      kind: data.kind ?? "announcement",
    });
    if (error) throw error;
    return { ok: true };
  });

export const listCreatorUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { creatorUserId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("creator_updates")
      .select("*")
      .eq("creator_user_id", data.creatorUserId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const listProjectUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("creator_updates")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const listUnreadUpdates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: subs, error: subErr } = await supabase
      .from("mind_purchases")
      .select("mind_id")
      .eq("user_id", userId);
    if (subErr) throw subErr;
    const mindIds = [...new Set((subs ?? []).map((s) => s.mind_id))];
    if (mindIds.length === 0) return [];
    const { data: rows, error } = await supabase
      .from("creator_updates")
      .select("*")
      .in("mind_id", mindIds)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const updateIds = (rows ?? []).map((r) => r.id);
    const { data: reads } = await supabase
      .from("update_reads")
      .select("update_id")
      .eq("user_id", userId)
      .in("update_id", updateIds);
    const readSet = new Set((reads ?? []).map((r) => r.update_id));
    return (rows ?? []).filter((r) => !readSet.has(r.id));
  });

export const markUpdateRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { updateId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("update_reads").upsert(
      { user_id: userId, update_id: data.updateId },
      { onConflict: "user_id,update_id" },
    );
    if (error) throw error;
    return { ok: true };
  });
