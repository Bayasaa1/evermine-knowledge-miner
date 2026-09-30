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
  /** The version this one grew out of; null for the root of the tree. */
  parentVersionId: string | null;
  /** Which line of the tree this copy belongs to, e.g. "main" or "Gemini re-mine". */
  branchName: string;
  /** Which engine or person produced it, so branches can be told apart. */
  createdByEngine: string;
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
      .select(
        "id, vault_id, mind_id, title, version, version_num, release_notes, payload, is_active, created_at, parent_version_id, branch_name, created_by_engine",
      )
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
      parentVersionId: r.parent_version_id ?? null,
      branchName: r.branch_name ?? "main",
      createdByEngine: r.created_by_engine ?? "",
    }));
  });

/**
 * Grows a NEW branch off an existing version.
 *
 * The Mind currently in use is left completely untouched — re-mining with a
 * different engine, or hand-fixing a copy, adds a root alongside the old one
 * and the creator alone decides which becomes the living Mind.
 */
export const saveMindBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      vaultId: string;
      title: string;
      payload: Json;
      parentVersionId?: string | null;
      branchName?: string;
      engine?: string;
      releaseNotes?: string;
      mindId?: string;
    }) => {
      if (!input?.vaultId) throw new Error("A Mind is required");
      const payload = input.payload as Record<string, unknown> | null;
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || !payload['result']) {
        throw new Error("The mined JSON payload is empty or invalid");
      }
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ versionId: string; version: string; versionNum: number }> => {
    const { data: rows, error } = await context.supabase.rpc("save_mind_branch", {
      _vault_id: data.vaultId,
      _title: (data.title || "Untitled Mind").slice(0, 200),
      _payload: data.payload as never,
      _parent_version_id: (data.parentVersionId ?? null) as unknown as string,
      _branch_name: (data.branchName ?? "branch").slice(0, 80),
      _engine: (data.engine ?? "").slice(0, 80),
      _release_notes: (data.releaseNotes ?? "").slice(0, 4000),
      _mind_id: data.mindId ?? "",
    });
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0];
    if (!row) throw new Error("The branch could not be verified in the database");
    return { versionId: row.version_id, version: row.version, versionNum: row.version_num };
  });

/** Renames one branch. Names are always the creator's choice, never automatic. */
export const renameMindBranch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string; branchName: string }) => {
    if (!input?.versionId || !input?.branchName?.trim()) throw new Error("A branch name is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("rename_mind_branch", {
      _version_id: data.versionId,
      _branch_name: data.branchName.trim().slice(0, 80),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
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

/**
 * Scrubs one source video out of the Core Brain.
 *
 * Every active version tied to `mindId` gets a new version whose mined records
 * no longer reference the deleted video, so the AI stops answering from it
 * while the full history stays intact.
 */
export const scrubMindSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId?: string; youtubeId?: string; sourceUrl?: string }) => {
    if (!input?.youtubeId && !input?.sourceUrl) throw new Error("A source video is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<{ scrubbed: number }> => {
    const { stripSource } = await import("@/lib/mind-json");

    let query = context.supabase
      .from("mind_versions")
      .select("id, vault_id, mind_id, title, payload")
      .eq("user_id", context.userId)
      .eq("is_active", true);
    if (data.mindId) query = query.eq("mind_id", data.mindId);

    const { data: rows, error } = await query.limit(50);
    if (error) throw new Error(error.message);

    let scrubbed = 0;
    for (const row of rows ?? []) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      if (!payload['result']) continue;
      const next = stripSource(payload as never, {
        ...(data.youtubeId ? { youtubeId: data.youtubeId } : {}),
        ...(data.sourceUrl ? { sourceUrl: data.sourceUrl } : {}),
      });
      if (JSON.stringify(next) === JSON.stringify(payload)) continue;
      const { error: saveError } = await context.supabase.rpc("save_mind_version", {
        _vault_id: row.vault_id,
        _title: row.title,
        _payload: next as never,
        _release_notes: `Removed source video ${data.youtubeId ?? data.sourceUrl ?? ""}`.slice(0, 4000),
        _mind_id: row.mind_id ?? "",
      });
      if (saveError) throw new Error(saveError.message);
      scrubbed += 1;
    }
    return { scrubbed };
  });
