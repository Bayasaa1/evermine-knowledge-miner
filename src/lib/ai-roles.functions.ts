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
      .select("role, provider, key_tail, key_id, auto_fallback")
      .eq("user_id", context.userId);
    return ((data ?? []) as { role: string; provider: string; key_tail: string | null; key_id: string | null; auto_fallback: boolean }[])
      .filter((r) => (AI_ROLES as string[]).includes(r.role))
      .map((r) => ({ role: r.role as AiRole, provider: r.provider, keyTail: r.key_tail, keyId: r.key_id, autoFallback: r.auto_fallback }));
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
    const { error } = await context.supabase.from("user_ai_roles").upsert(
      {
        user_id: context.userId,
        role: data.role,
        provider,
        key_tail: (data.keyTail ?? "").trim() || null,
        key_id: data.keyId ?? null,
        auto_fallback: data.autoFallback ?? true,
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
