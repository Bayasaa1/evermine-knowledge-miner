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
    const { generateRoleText, UserAiError } = await import("@/lib/user-ai.server");
    try {
      const result = await generateRoleText({
        userId: context.userId,
        role: "core_brain",
        system: data.prompt,
        json: true,
        maxTokens: 8192,
        prompt: data.brief,
        subjectKind: "mind",
        subjectLabel: "Mind audit",
      });
      return result.text;
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

const textArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];

/** User-triggered repair of a saved video's speaking style. Keeps one-step Undo. */
export const refreshPersonality = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vaultId: string }) => {
    if (!input?.vaultId) throw new Error("A saved mind is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("mind_vaults")
      .select("payload,project_id")
      .eq("id", data.vaultId)
      .eq("user_id", context.userId)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Saved mind not found.");
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const result = (payload["result"] ?? {}) as Record<string, unknown>;
    const transcript = Array.isArray(result["transcript"]) ? result["transcript"] : [];
    const { data: project } = row.project_id
      ? await context.supabase.from("projects").select("creator_name").eq("id", row.project_id).eq("user_id", context.userId).maybeSingle()
      : { data: null };
    const person = String(project?.creator_name ?? "the featured person").trim();
    const personKey = person.toLowerCase().replace(/[^a-z0-9\p{L}]/gu, "");
    const ownLines = transcript
      .map((item) => item as Record<string, unknown>)
      .filter((item) => {
        const speaker = String(item["speaker"] ?? "").toLowerCase().replace(/[^a-z0-9\p{L}]/gu, "");
        return personKey.length > 3 && speaker.length > 3 && (speaker.includes(personKey) || personKey.includes(speaker));
      })
      .map((item) => String(item["speech"] ?? "").trim())
      .filter(Boolean)
      .slice(0, 160);
    if (ownLines.length < 5) throw new Error(`Not enough ${person}'s own transcript lines to refresh safely.`);

    const { generateRoleText } = await import("@/lib/user-ai.server");
    const generated = await generateRoleText({
      userId: context.userId,
      role: "core_brain",
      system: `Study only ${person}'s own transcript lines. Return strict JSON with exactly these arrays: expressiveStyle (rhythm, humour, warmth, sentence habits), beliefs, decisionLogic, skills. Add a selfIntro string: a lively factual 1-2 sentence self-introduction using only supported facts. Never copy or attribute the host's words to ${person}.`,
      prompt: ownLines.join("\n").slice(0, 16000),
      json: true,
      maxTokens: 1800,
      subjectKind: "mind",
      subjectId: data.vaultId,
      subjectLabel: `${person} personality refresh`,
    });
    const match = generated.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The selected AI did not return a usable personality record.");
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const refreshed = {
      expressiveStyle: textArray(parsed["expressiveStyle"]).slice(0, 12),
      beliefs: textArray(parsed["beliefs"]).slice(0, 12),
      decisionLogic: textArray(parsed["decisionLogic"]).slice(0, 10),
      skills: textArray(parsed["skills"]).slice(0, 10),
      selfIntro: typeof parsed["selfIntro"] === "string" ? parsed["selfIntro"].trim().slice(0, 600) : "",
      refreshedAt: new Date().toISOString(),
    };
    if (!refreshed.expressiveStyle.length || !refreshed.selfIntro) throw new Error("The personality refresh was incomplete. Nothing was changed.");
    const next = { ...payload, previousPersonaRefresh: payload["personaRefresh"] ?? null, personaRefresh: refreshed };
    const { error: saveError } = await context.supabase.from("mind_vaults").update({ payload: next as never }).eq("id", data.vaultId).eq("user_id", context.userId);
    if (saveError) throw new Error(saveError.message);
    return { ok: true, provider: generated.provider };
  });

export const undoPersonalityRefresh = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vaultId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("mind_vaults").select("payload").eq("id", data.vaultId).eq("user_id", context.userId).single();
    if (error || !row) throw new Error(error?.message ?? "Saved mind not found.");
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const previous = payload["previousPersonaRefresh"];
    const next = { ...payload, personaRefresh: previous ?? null, previousPersonaRefresh: null };
    const { error: saveError } = await context.supabase.from("mind_vaults").update({ payload: next as never }).eq("id", data.vaultId).eq("user_id", context.userId);
    if (saveError) throw new Error(saveError.message);
    return { ok: true };
  });
