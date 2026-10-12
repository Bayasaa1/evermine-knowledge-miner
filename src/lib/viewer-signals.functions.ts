/**
 * Viewer signals: questions, reactions, requests sent to creators.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SignalKind = "question" | "reaction" | "request" | "report";

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

/** A viewer flags one Mind reply as wrong; the creator sees it on the matching root. */
export const reportMindReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; question: string; answer: string }) => ({
    mindId: String(input.mindId).slice(0, 200),
    question: String(input.question ?? "").slice(0, 500),
    answer: String(input.answer ?? "").slice(0, 800),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let creator: string | null = null;
    const pid = data.mindId.startsWith("project:") ? data.mindId.slice(8) : null;
    if (pid) {
      const { data: p } = await supabaseAdmin.from("projects").select("user_id").eq("id", pid).maybeSingle();
      creator = p?.user_id ?? null;
    } else {
      const { data: c } = await supabaseAdmin.from("project_content").select("user_id").eq("mind_id", data.mindId).limit(1).maybeSingle();
      creator = c?.user_id ?? null;
    }
    if (!creator) throw new Error("Mind not found");
    const { error } = await context.supabase.from("viewer_signals").insert({
      user_id: context.userId,
      creator_user_id: creator,
      mind_id: data.mindId,
      kind: "report",
      body: `Q: ${data.question}\nA: ${data.answer}`,
      status: "open",
    });
    if (error) throw error;
    return { ok: true };
  });
