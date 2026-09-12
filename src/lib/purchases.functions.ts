import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MINDS } from "@/lib/minds";
import { PLAN_LENGTHS, expiryFor, normalizeTiers, type PlanLength } from "@/lib/subscription";

/**
 * Purchases are granted server-side only. The browser can no longer write to
 * mind_purchases (RLS + grants block it), so a buyer cannot self-issue a
 * purchase row and unlock paid deployment, voice or verified-review rights.
 *
 * The server resolves the price itself — never from the client — and only
 * writes the row when nothing is owed. Anything with a real price requires a
 * payment-processor confirmation before a row is created.
 */

export type PurchaseResult = { ok: boolean; error: string | null; requiresPayment?: boolean };

/** Authoritative price for a catalogue mind, or null when it is not catalogued. */
function catalogPrice(mindId: string): { price: number; currency: string } | null {
  const mind = MINDS.find((m) => m.id === mindId);
  if (!mind) return null;
  return { price: mind.hourly, currency: "USD" };
}

/** Price the creator set for this plan length on their published project. */
async function projectPrice(
  mindId: string,
  plan: PlanLength,
): Promise<{ price: number; currency: string } | null> {
  const projectId = mindId.startsWith("project:") ? mindId.slice("project:".length) : "";
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("projects")
    .select("price,currency,plan_tiers,published")
    .eq("id", projectId)
    .maybeSingle();
  if (!data || !data.published) return null;
  const raw = (data.plan_tiers ?? null) as Record<string, unknown> | null;
  const currency = (raw?.['currency'] as string | undefined) || data.currency || "USD";
  if (raw?.['enabled'] !== true) return { price: 0, currency };
  const tiers = normalizeTiers(raw);
  const tier = tiers[plan];
  // A length the creator does not sell cannot be claimed for free.
  if (!tier?.enabled) return { price: Number(data.price ?? 0) || 1, currency };
  return { price: tier.price, currency };
}

export const claimMind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; category: string; plan?: string }) => {
    if (!input?.mindId || typeof input.mindId !== "string") throw new Error("A mind id is required");
    if (input.mindId.length > 200) throw new Error("Invalid mind id");
    const plan = PLAN_LENGTHS.includes(input.plan as PlanLength) ? (input.plan as PlanLength) : "lifetime";
    return { mindId: input.mindId, category: String(input.category || "knowledge").slice(0, 40), plan };
  })
  .handler(async ({ data, context }): Promise<PurchaseResult> => {
    const { assertNotBanned } = await import("@/lib/api-guard.server");
    await assertNotBanned(context.supabase, context.userId);

    const listed = catalogPrice(data.mindId) ?? (await projectPrice(data.mindId, data.plan));
    const price = listed?.price ?? 0;
    const currency = listed?.currency ?? "USD";

    if (price > 0) {
      return {
        ok: false,
        requiresPayment: true,
        error:
          "This subscription costs money. Checkout is not connected yet, so access cannot be granted — connect a payment provider to enable paid subscriptions.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("mind_purchases").upsert(
      {
        user_id: context.userId,
        mind_id: data.mindId,
        category: data.category,
        price: 0,
        currency,
        // A free unlock never expires; paid lengths get their expiry at checkout.
        plan: "lifetime",
        expires_at: expiryFor("lifetime"),
      },
      { onConflict: "user_id,mind_id" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  });
