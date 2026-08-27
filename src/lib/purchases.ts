/**
 * Purchase / subscription ownership for Minds. Deployment, voice calls and
 * verified reviews are all gated on a row existing here.
 */
import { supabase } from "@/integrations/supabase/client";
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

export async function purchaseMind(input: {
  userId: string;
  mindId: string;
  category: CreationCategory;
  price: number;
  currency: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("mind_purchases").upsert(
    {
      user_id: input.userId,
      mind_id: input.mindId,
      category: input.category,
      price: input.price,
      currency: input.currency,
    },
    { onConflict: "user_id,mind_id" },
  );
  return { error: error?.message ?? null };
}
