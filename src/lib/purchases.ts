/**
 * Purchase / subscription ownership for Minds. Deployment, voice calls and
 * verified reviews are all gated on a row existing here.
 */
import { supabase } from "@/integrations/supabase/client";
import { claimMind } from "./purchases.functions";
import type { CreationCategory } from "./creation-category";

export type Purchase = {
  mind_id: string;
  category: string;
  price: number;
  currency: string;
  created_at: string;
};

export async function listPurchases(): Promise<Purchase[]> {
  const { data } = await supabase
    .from("mind_purchases")
    .select("mind_id,category,price,currency,created_at");
  return (data as Purchase[] | null) ?? [];
}

/**
 * Requests access to a mind. The server verifies the catalogue price and only
 * grants free minds; paid unlocks need a confirmed payment. The browser can no
 * longer write purchase rows itself.
 */
export async function purchaseMind(input: {
  mindId: string;
  category: CreationCategory;
}): Promise<{ error: string | null }> {
  try {
    const res = await claimMind({ data: { mindId: input.mindId, category: input.category } });
    return { error: res.ok ? null : (res.error ?? "Purchase failed") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Purchase failed" };
  }
}
