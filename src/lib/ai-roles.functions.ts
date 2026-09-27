/**
 * Reading and writing the user's "who runs what" choices. Owner-scoped: the
 * table is RLS-locked to the signed-in account and every write carries their id.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AI_ROLES, ROLE_PROVIDERS, type AiRole, type RoleChoice } from "@/lib/ai-roles";

const ROLE = z.enum(AI_ROLES as [AiRole, ...AiRole[]]);

export const listAiRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RoleChoice[]> => {
    const { data } = await context.supabase
      .from("user_ai_roles")
      .select("role, provider, key_tail, key_id, auto_fallback, team_key_ids, exclusive")
      .eq("user_id", context.userId);
    return ((data ?? []) as { role: string; provider: string; key_tail: string | null; key_id: string | null; auto_fallback: boolean; team_key_ids: string[] | null; exclusive: boolean }[])
      .filter((r) => (AI_ROLES as string[]).includes(r.role))
      .map((r) => ({ role: r.role as AiRole, provider: r.provider, keyTail: r.key_tail, keyId: r.key_id, autoFallback: r.auto_fallback, teamKeyIds: r.team_key_ids ?? [], exclusive: !!r.exclusive }));
  });

export const setAiRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        role: ROLE,
        /** null / empty clears the choice back to "pick automatically". */
        provider: z.string().max(32).nullable().optional(),
        keyTail: z.string().max(8).nullable().optional(),
        keyId: z.string().uuid().nullable().optional(),
        autoFallback: z.boolean().optional(),
        /** Ordered team for this job: #1 runs it, the rest take over in order. */
        teamKeyIds: z.array(z.string().uuid()).max(50).optional(),
        /** Only this job may use the team's keys. */
        exclusive: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const provider = (data.provider ?? "").trim();
    if (!provider) {
      const { error } = await context.supabase
        .from("user_ai_roles")
        .delete()
        .eq("user_id", context.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
      return { ok: true as const };
    }
    if (!ROLE_PROVIDERS[data.role].includes(provider)) {
      throw new Error("That engine cannot do this job.");
    }
    const { data: ownedKey } = await context.supabase
      .from("user_ai_keys")
      .select("id, provider, api_key")
      .eq("user_id", context.userId)
      .eq("id", data.keyId ?? "00000000-0000-0000-0000-000000000000")
      .maybeSingle();
    if (data.keyId && (!ownedKey || ownedKey.provider !== provider)) throw new Error("That key does not belong to this account.");
    const team = [...new Set(data.teamKeyIds ?? (data.keyId ? [data.keyId] : []))];
    if (team.length) {
      const { data: owned } = await context.supabase
        .from("user_ai_keys")
        .select("id, provider")
        .eq("user_id", context.userId)
        .in("id", team);
      const ok = (owned ?? []).filter((k) => ROLE_PROVIDERS[data.role].includes(k.provider));
      if (ok.length !== team.length) throw new Error("A key in this team cannot do this job or does not belong to this account.");
    }
    const { error } = await context.supabase.from("user_ai_roles").upsert(
      {
        user_id: context.userId,
        role: data.role,
        provider,
        key_tail: (data.keyTail ?? "").trim() || null,
        key_id: data.keyId ?? null,
        auto_fallback: data.autoFallback ?? true,
        team_key_ids: team,
        exclusive: data.exclusive ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,role" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** For each job: which key is assigned, which one would really run it. */
export const describeAiRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { roleKeyReport } = await import("@/lib/user-ai.server");
    const rows = await Promise.all(
      AI_ROLES.map(async (role) => ({
        role,
        ...(await roleKeyReport(context.userId, role, ROLE_PROVIDERS[role][0]!)),
      })),
    );
    return rows;
  });

/** One tiny live call with the key a job would use. */
export const testAiRoleKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ role: ROLE }).parse(input))
  .handler(async ({ data, context }) => {
    const { testRoleKey } = await import("@/lib/user-ai.server");
    return testRoleKey(context.userId, data.role, ROLE_PROVIDERS[data.role][0]!);
  });

export const testAllAiRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { testRoleKey } = await import("@/lib/user-ai.server");
    // One job without a key (most people have no voice-clone key) must never
    // wipe out the results for every other job.
    const rows = await Promise.allSettled(
      AI_ROLES.map(async (role) => ({ role, ...(await testRoleKey(context.userId, role, ROLE_PROVIDERS[role][0]!)) })),
    );
    return rows.map((row, i) =>
      row.status === "fulfilled"
        ? row.value
        : {
            role: AI_ROLES[i]!,
            ok: false,
            message: row.reason instanceof Error ? row.reason.message : "No key saved for this job yet.",
            tail: null as string | null,
          },
    );
  });
