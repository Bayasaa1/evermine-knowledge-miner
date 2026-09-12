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

async function verifyGeminiKey(apiKey: string): Promise<void> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Say OK." }] }],
        generationConfig: { maxOutputTokens: 4 },
      }),
    },
  );
  if (res.status === 429) {
    throw new Error("That key works, but its free quota is used up for today. Try it again after the daily reset.");
  }
  if (!res.ok) {
    throw new Error("Gemini rejected that key. Copy it again from Google AI Studio — it is free and takes a minute.");
  }
}

export const saveUserAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ provider: z.literal("gemini"), apiKey: z.string().min(8).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const apiKey = data.apiKey.trim();
    if (!KEY_RE.test(apiKey)) throw new Error("That does not look like an API key.");
    await verifyGeminiKey(apiKey);
    const { error } = await context.supabase
      .from("user_ai_keys")
      .upsert(
        { user_id: context.userId, provider: data.provider, api_key: apiKey },
        { onConflict: "user_id,provider" },
      );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getUserAiKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("user_ai_keys").select("provider, api_key, updated_at");
    return ((data ?? []) as { provider: string; api_key: string; updated_at: string }[]).map((row) => ({
      provider: row.provider,
      tail: row.api_key.slice(-4),
      updatedAt: row.updated_at,
    }));
  });

export const deleteUserAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ provider: z.literal("gemini") }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_ai_keys")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
