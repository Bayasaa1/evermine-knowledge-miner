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
      .select("role, provider, key_tail")
      .eq("user_id", context.userId);
    return ((data ?? []) as { role: string; provider: string; key_tail: string | null }[])
      .filter((r) => (AI_ROLES as string[]).includes(r.role))
      .map((r) => ({ role: r.role as AiRole, provider: r.provider, keyTail: r.key_tail }));
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
    const { error } = await context.supabase.from("user_ai_roles").upsert(
      {
        user_id: context.userId,
        role: data.role,
        provider,
        key_tail: (data.keyTail ?? "").trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,role" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
