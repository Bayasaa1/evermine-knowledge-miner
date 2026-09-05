import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MINDS } from "@/lib/minds";

/**
 * Purchases are granted server-side only. The browser can no longer write to
 * mind_purchases (RLS + grants block it), so a buyer cannot self-issue a
 * purchase row and unlock paid deployment, voice or verified-review rights.
 *
 * The server resolves the price from the catalogue on file — never from the
 * client — and only writes the row when nothing is owed. Anything with a real
 * price requires a payment-processor confirmation before a row is created.
 */

export type PurchaseResult = { ok: boolean; error: string | null; requiresPayment?: boolean };

/** Authoritative price for a mind, or null when the mind is unknown. */
function catalogPrice(mindId: string): { price: number; currency: string } | null {
  const mind = MINDS.find((m) => m.id === mindId);
  if (!mind) return null;
  return { price: mind.hourly, currency: "USD" };
}

export const claimMind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; category: string }) => {
    if (!input?.mindId || typeof input.mindId !== "string") throw new Error("A mind id is required");
    if (input.mindId.length > 200) throw new Error("Invalid mind id");
    return { mindId: input.mindId, category: String(input.category || "knowledge").slice(0, 40) };
  })
  .handler(async ({ data, context }): Promise<PurchaseResult> => {
    const { assertNotBanned } = await import("@/lib/api-guard.server");
    await assertNotBanned(context.supabase, context.userId);
    const listed = catalogPrice(data.mindId);
    // Creator-published minds that are not in the paid catalogue are free previews.
    const price = listed?.price ?? 0;
    const currency = listed?.currency ?? "USD";

    if (price > 0) {
      return {
        ok: false,
        requiresPayment: true,
        error:
          "This mind costs money. Checkout is not connected yet, so access cannot be granted — connect a payment provider to enable paid unlocks.",
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
      },
      { onConflict: "user_id,mind_id" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  });
