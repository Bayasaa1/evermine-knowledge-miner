/**
 * Purchase / subscription ownership for Minds. Deployment, voice calls and
 * verified reviews are all gated on an active row existing here.
 */
import { supabase } from "@/integrations/supabase/client";
import { claimMind } from "./purchases.functions";
import type { CreationCategory } from "./creation-category";
import type { PlanLength } from "./subscription";

export type Purchase = {
  mind_id: string;
  category: string;
  price: number;
  currency: string;
  plan: string;
  expires_at: string | null;
  created_at: string;
};

/** Subscriptions that are still active: lifetime rows never expire. */
export async function listPurchases(): Promise<Purchase[]> {
  const { data } = await supabase
    .from("mind_purchases")
    .select("mind_id,category,price,currency,plan,expires_at,created_at");
  const rows = (data as Purchase[] | null) ?? [];
  const now = Date.now();
  return rows.filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);
}

/**
 * Subscribes to a mind for the chosen length. The server verifies the price and
 * only grants free access; paid lengths need a confirmed payment. The browser
 * can no longer write purchase rows itself.
 */
export async function purchaseMind(input: {
  mindId: string;
  category: CreationCategory;
  plan?: PlanLength;
}): Promise<{ error: string | null }> {
  try {
    const res = await claimMind({
      data: { mindId: input.mindId, category: input.category, plan: input.plan ?? "lifetime" },
    });
    return { error: res.ok ? null : (res.error ?? "Subscription failed") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Subscription failed" };
  }
}
