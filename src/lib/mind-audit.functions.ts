/**
 * Server side of the Auditor.
 *
 * - `auditWithBuiltIn` runs the Gemini audit on the creator's OWN access —
 *   a key from their device vault or the key saved on their account. There is
 *   no shared platform credit behind it.
 * - `saveAudit` / `chooseAudit` store audits inside the saved mind itself,
 *   owner-scoped, so nothing an auditor said is ever hidden or lost.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const auditWithBuiltIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prompt: string; brief: string; apiKey?: string }) => {
    if (!input?.brief?.trim()) throw new Error("Nothing to audit.");
    return {
      prompt: String(input.prompt).slice(0, 4000),
      brief: String(input.brief).slice(0, 20000),
      apiKey: typeof input.apiKey === "string" ? input.apiKey : undefined,
    };
  })
  .handler(async ({ data, context }): Promise<string> => {
    const { resolveGeminiCredential, geminiGenerate, UserAiError } = await import("@/lib/user-ai.server");
    try {
      const credential = await resolveGeminiCredential(context.userId, data);
      return await geminiGenerate({
        credential,
        model: "gemini-2.5-flash",
        system: data.prompt,
        json: true,
        maxTokens: 8192,
        turns: [{ role: "user", parts: [{ text: data.brief }] }],
      });
    } catch (err) {
      if (err instanceof UserAiError) throw new Error(err.message);
      throw err;
    }
  });

/** Appends one audit to a saved mind's payload (owner-scoped). */
export const saveAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vaultId: string; audit: unknown }) => {
    if (!input?.vaultId) throw new Error("A saved mind is required.");
    if (!input.audit || typeof input.audit !== "object") throw new Error("Invalid audit.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("mind_vaults")
      .select("payload")
      .eq("id", data.vaultId)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    const payload = ((row?.payload ?? {}) as Record<string, unknown>);
    const audits = Array.isArray(payload['audits']) ? (payload['audits'] as unknown[]) : [];
    const next = { ...payload, audits: [data.audit, ...audits].slice(0, 20) };
    const { error: saveError } = await context.supabase
      .from("mind_vaults")
      .update({ payload: next as never })
      .eq("id", data.vaultId)
      .eq("user_id", context.userId);
    if (saveError) throw new Error(saveError.message);
    return { ok: true };
  });

/** Marks which audit's result the creator wants feeding the Core Brain. */
export const chooseAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vaultId: string; auditId: string | null }) => {
    if (!input?.vaultId) throw new Error("A saved mind is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("mind_vaults")
      .select("payload")
      .eq("id", data.vaultId)
      .eq("user_id", context.userId)
      .single();
    if (error) throw new Error(error.message);
    const payload = ((row?.payload ?? {}) as Record<string, unknown>);
    const { error: saveError } = await context.supabase
      .from("mind_vaults")
      .update({ payload: { ...payload, chosenAuditId: data.auditId } as never })
      .eq("id", data.vaultId)
      .eq("user_id", context.userId);
    if (saveError) throw new Error(saveError.message);
    return { ok: true };
  });
