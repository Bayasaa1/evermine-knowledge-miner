import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Atomic, zero-loss persistence for mined Minds plus full version history.
 * Every write goes through a single database function so a Mind can never be
 * reported as "finished" while only half of it reached the database.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type MindVersion = {
  id: string;
  vaultId: string;
  mindId: string;
  title: string;
  version: string;
  versionNum: number;
  releaseNotes: string;
  payload: Json;
  isActive: boolean;
  createdAt: string;
};

export type SavedMind = { vaultId: string; versionId: string; version: string; versionNum: number };

export const saveMindVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { vaultId?: string | null; title: string; payload: Json; releaseNotes?: string; mindId?: string }) => {
      if (!input || typeof input.title !== "string" || !input.title.trim()) {
        throw new Error("A Mind title is required");
      }
      const payload = input.payload as Record<string, unknown> | null;
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || !payload['result']) {
        throw new Error("The mined JSON payload is empty or invalid");
      }
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<SavedMind> => {
    const { data: rows, error } = await context.supabase.rpc("save_mind_version", {
      _vault_id: (data.vaultId ?? null) as unknown as string,
      _title: data.title.slice(0, 200),
      _payload: data.payload as never,
      _release_notes: (data.releaseNotes ?? "").slice(0, 4000),
      _mind_id: data.mindId ?? "",
    });
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0];
    if (!row) throw new Error("The Mind could not be verified in the database");
    return {
      vaultId: row.vault_id,
      versionId: row.version_id,
      version: row.version,
      versionNum: row.version_num,
    };
  });

export const listMindVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MindVersion[]> => {
    const { data, error } = await context.supabase
      .from("mind_versions")
      .select("id, vault_id, mind_id, title, version, version_num, release_notes, payload, is_active, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      vaultId: r.vault_id,
      mindId: r.mind_id,
      title: r.title,
      version: r.version,
      versionNum: r.version_num,
      releaseNotes: r.release_notes,
      payload: r.payload as Json,
      isActive: r.is_active,
      createdAt: r.created_at,
    }));
  });

export const rollbackMindVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string }) => {
    if (!input?.versionId) throw new Error("A version is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ vaultId: string; version: string }> => {
    const { data: rows, error } = await context.supabase.rpc("rollback_mind_version", {
      _version_id: data.versionId,
    });
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0];
    if (!row) throw new Error("That version could not be restored");
    return { vaultId: row.vault_id, version: row.version };
  });

export const deleteMindVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mind_versions")
      .delete()
      .eq("id", data.versionId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
