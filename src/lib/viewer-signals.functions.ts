/**
 * Viewer signals: questions, reactions, requests sent to creators.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SignalKind = "question" | "reaction" | "request";

export const sendSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      mindId: string;
      creatorUserId: string;
      kind: SignalKind;
      body: string;
      topic?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("viewer_signals").insert({
      user_id: userId,
      creator_user_id: data.creatorUserId,
      mind_id: data.mindId,
      kind: data.kind,
      body: data.body,
      topic: data.topic ?? null,
      status: "open",
    });
    if (error) throw error;
    return { ok: true };
  });

export const listMySignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("viewer_signals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const listCreatorSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("viewer_signals")
      .select("*")
      .eq("creator_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const replyToSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { signalId: string; reply: string; status?: "open" | "closed" }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("viewer_signals")
      .update({ creator_reply: data.reply, status: data.status ?? "closed" })
      .eq("id", data.signalId)
      .eq("creator_user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const markSignalRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { signalId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("viewer_signals")
      .update({ read_by_creator: true })
      .eq("id", data.signalId)
      .eq("creator_user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const closeSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { signalId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("viewer_signals")
      .update({ status: "closed" })
      .eq("id", data.signalId)
      .eq("creator_user_id", userId);
    if (error) throw error;
    return { ok: true };
  });
