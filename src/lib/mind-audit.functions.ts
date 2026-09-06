/**
 * Server side of the Auditor.
 *
 * - `auditWithBuiltIn` lets the built-in Evermind engine audit for free,
 *   so a creator without any personal API key can still get a second opinion.
 * - `saveAudit` / `chooseAudit` store audits inside the saved mind itself,
 *   owner-scoped, so nothing an auditor said is ever hidden or lost.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const auditWithBuiltIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prompt: string; brief: string }) => {
    if (!input?.brief?.trim()) throw new Error("Nothing to audit.");
    return { prompt: String(input.prompt).slice(0, 4000), brief: String(input.brief).slice(0, 20000) };
  })
  .handler(async ({ data }): Promise<string> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("The built-in AI is not configured.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: data.prompt },
          { role: "user", content: data.brief },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const raw = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 429) throw new Error("The built-in auditor is rate limited — try again shortly.");
      if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
      throw new Error(raw || `The audit failed (${res.status}).`);
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return body.choices?.[0]?.message?.content ?? "";
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
