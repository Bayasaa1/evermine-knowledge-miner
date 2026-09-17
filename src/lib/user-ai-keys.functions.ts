/**
 * Account-level AI keys. Saving a key here lets the app's background worker
 * keep mining while the creator's tab is closed — the job runs on the
 * creator's own free Gemini quota, never on shared platform credit. Keys are
 * only ever readable by their owner (RLS) and the background worker.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const KEY_RE = /^[A-Za-z0-9_\-:.]{8,200}$/;

const PROVIDER = z.enum([
  "gemini",
  "groq",
  "mistral",
  "cerebras",
  "together",
  "github",
  "openai",
  "anthropic",
  "moonshot",
  "openrouter",
  "deepseek",
  "xai",
  "perplexity",
  "cohere",
  // Voice cloning engine. Optional: without it minds speak with the free
  // device voice instead.
  "elevenlabs",
  "custom",
]);

async function verifyGeminiKey(apiKey: string): Promise<void> {
  // Which models a Google account can call varies, so confirm the key by asking
  // the account for its own model list before trying one of them.
  const list = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: { "x-goog-api-key": apiKey },
  });
  if (list.status === 429) {
    throw new Error("That key works, but its free quota is used up for today. Try it again after the daily reset.");
  }
  if (list.ok) {
    const body = (await list.json().catch(() => ({}))) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const usable = (body.models ?? []).some((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"));
    if (usable) return;
    throw new Error(
      "That key is valid, but this Google account has no text models enabled yet. Create the key in Google AI Studio and try again.",
    );
  }
  throw new Error("Gemini rejected that key. Copy it again from Google AI Studio — it is free and takes a minute.");
}


export const saveUserAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      provider: PROVIDER,
      apiKey: z.string().min(8).max(200),
      label: z.string().max(80).optional(),
      rank: z.number().int().min(0).max(10000).optional(),
      enabled: z.boolean().optional(),
      model: z.string().max(160).optional(),
      endpoint: z.string().url().max(500).optional(),
      costKind: z.enum(["free-tier", "free-model", "paid"]).optional(),
      monthlyLimitUsd: z.number().min(0).max(10000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = data.apiKey.trim();
    if (!KEY_RE.test(apiKey)) throw new Error("That does not look like an API key.");
    // Only Gemini runs unattended background jobs, so only it is verified here.
    if (data.provider === "gemini") await verifyGeminiKey(apiKey);
    const { error } = await context.supabase
      .from("user_ai_keys")
      .upsert(
        {
          user_id: context.userId,
          provider: data.provider,
          api_key: apiKey,
          label: data.label ?? "",
          rank: data.rank ?? 9000,
          enabled: data.enabled ?? true,
          model: data.model ?? null,
          endpoint: data.endpoint ?? null,
          cost_kind: data.costKind ?? "free-tier",
          monthly_limit_usd: data.monthlyLimitUsd ?? 0,
        },
        { onConflict: "user_id,provider,api_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getUserAiKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_ai_keys")
      .select("id, provider, api_key, label, rank, enabled, model, endpoint, cost_kind, monthly_limit_usd, spend_usd, status, cooldown_until, created_at, updated_at")
      .order("rank", { ascending: true })
      .order("updated_at", { ascending: false });
    return (data ?? []).map((row) => ({
      id: row.id,
      provider: row.provider,
      tail: row.api_key.slice(-4),
      label: row.label,
      rank: row.rank,
      enabled: row.enabled,
      model: row.model,
      endpoint: row.endpoint,
      costKind: row.cost_kind,
      monthlyLimitUsd: Number(row.monthly_limit_usd),
      spendUsd: Number(row.spend_usd),
      status: row.status,
      cooldownUntil: row.cooldown_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  });

export const deleteUserAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ provider: PROVIDER, tail: z.string().min(2).max(8).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // A creator can keep several keys for one provider. Removing one must not
    // wipe the spares, so when the caller names the key's last characters only
    // that row goes.
    if (data.tail) {
      const { data: rows } = await context.supabase
        .from("user_ai_keys")
        .select("id, api_key")
        .eq("user_id", context.userId)
        .eq("provider", data.provider);
      const match = (rows ?? []).find((r) => (r.api_key ?? "").endsWith(data.tail!));
      if (match) {
        const { error } = await context.supabase.from("user_ai_keys").delete().eq("id", match.id);
        if (error) throw new Error(error.message);
        return { ok: true as const };
      }
      return { ok: true as const };
    }
    const { error } = await context.supabase
      .from("user_ai_keys")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
