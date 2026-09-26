import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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
  personaId: string | null;
  projectId: string | null;
  updatedAt: string;
};

// Ids must be real UUIDs: personaId is interpolated into a raw PostgREST
// .or() filter string, so an unvalidated value would be parsed as filter
// syntax instead of a literal id.
const listInput = z.object({
  personaId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  scoped: z.boolean().optional(),
});

export const listVaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<VaultRow[]> => {
    // Strict isolation: a saved mind only shows inside the persona / project it
    // belongs to, never in a single shared dump of everything the user mined.
    let query = context.supabase
      .from("mind_vaults")
      .select("id, title, kind, payload, persona_id, project_id, updated_at")
      .eq("user_id", context.userId);
    if (data.scoped) {
      // A persona sees its own minds plus anything not filed under a persona
      // yet — a saved video must never disappear just because it was mined
      // before a persona was picked. The UI labels those rows "Not filed".
      query = data.personaId
        ? query.or(`persona_id.eq.${data.personaId},persona_id.is.null`)
        : query.is("persona_id", null);
      if (data.projectId) query = query.eq("project_id", data.projectId);
    }

    const { data: rows, error } = await query.order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      payload: r.payload as Json,
      personaId: r.persona_id ?? null,
      projectId: r.project_id ?? null,
      updatedAt: r.updated_at,
    }));
  });

/** Renames a saved mind and/or re-assigns it to another persona / project. */
export const updateVault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().max(200).optional(),
        personaId: z.string().uuid().nullable().optional(),
        projectId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (typeof data.title === "string" && data.title.trim()) patch['title'] = data.title.trim().slice(0, 200);
    if (data.personaId !== undefined) patch['persona_id'] = data.personaId;
    if (data.projectId !== undefined) patch['project_id'] = data.projectId;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("mind_vaults")
      .update(patch as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
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
    // Cascade: the vault's version history goes with it.
    await context.supabase.from("mind_versions").delete().eq("vault_id", data.id).eq("user_id", context.userId);
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
    if (data.messages.length === 0) return { ok: true, ids: [] as string[] };
    const { data: saved, error } = await context.supabase.from("chat_messages").insert(
      data.messages.map((m) => ({
        user_id: context.userId,
        mind_id: data.mindId,
        role: m.role,
        body: m.body.slice(0, 8000),
        lang: data.lang ?? "en",
      })),
    ).select("id, created_at").order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { ok: true, ids: (saved ?? []).map((r) => r.id) };
  });

/** Deletes specific chat messages (only the caller's own). */
export const deleteChatMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chat_messages")
      .delete()
      .in("id", data.ids)
      .eq("user_id", context.userId);
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
