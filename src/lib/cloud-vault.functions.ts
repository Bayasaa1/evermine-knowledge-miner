import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-user cloud storage for Mind Vaults, Core Brains and chat history.
 * Every function runs as the signed-in user, so row-level security keeps
 * one account's data completely invisible to any other account.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type VaultKind = "mine" | "brain" | "user-vault";

export type VaultRow = {
  id: string;
  title: string;
  kind: string;
  payload: Json;
  updatedAt: string;
};

export const listVaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VaultRow[]> => {
    const { data, error } = await context.supabase
      .from("mind_vaults")
      .select("id, title, kind, payload, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      payload: r.payload as Json,
      updatedAt: r.updated_at,
    }));
  });

export const upsertVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id?: string; title: string; kind: VaultKind; payload: Json }) => {
    if (!input || typeof input.title !== "string" || !input.title.trim()) {
      throw new Error("A vault title is required");
    }
    return input;
  })
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const row = {
      user_id: context.userId,
      title: data.title.slice(0, 200),
      kind: data.kind,
      payload: data.payload as never,
      ...(data.id ? { id: data.id } : {}),
    };
    const { data: saved, error } = await context.supabase
      .from("mind_vaults")
      .upsert(row, { onConflict: "id" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: saved.id };
  });

export const deleteVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mind_vaults")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ChatRow = { id: string; mindId: string; role: string; body: string; createdAt: string };

export const listChatHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string }) => input)
  .handler(async ({ data, context }): Promise<ChatRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("chat_messages")
      .select("id, mind_id, role, body, created_at")
      .eq("user_id", context.userId)
      .eq("mind_id", data.mindId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      mindId: r.mind_id,
      role: r.role,
      body: r.body,
      createdAt: r.created_at,
    }));
  });

export const appendChatMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { mindId: string; lang?: string; messages: { role: "user" | "agent"; body: string }[] }) => {
      if (!input?.mindId || !Array.isArray(input.messages)) throw new Error("Invalid chat payload");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    if (data.messages.length === 0) return { ok: true };
    const { error } = await context.supabase.from("chat_messages").insert(
      data.messages.map((m) => ({
        user_id: context.userId,
        mind_id: data.mindId,
        role: m.role,
        body: m.body.slice(0, 8000),
        lang: data.lang ?? "en",
      })),
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearChatHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    let query = context.supabase.from("chat_messages").delete().eq("user_id", context.userId);
    if (data.mindId) query = query.eq("mind_id", data.mindId);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });
