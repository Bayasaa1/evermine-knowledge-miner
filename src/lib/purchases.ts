/**
 * Purchase / subscription ownership for Minds. Deployment, voice calls and
 * verified reviews are all gated on an active row existing here.
 */
import { supabase } from "@/integrations/supabase/client";
import { claimMind, releaseMind } from "./purchases.functions";
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

/** Cancels a subscription. The viewer keeps nothing but their own history. */
export async function cancelMind(mindId: string): Promise<{ error: string | null }> {
  try {
    const res = await releaseMind({ data: { mindId } });
    return { error: res.ok ? null : (res.error ?? "Cancel failed") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Cancel failed" };
  }
}

/** What the download guard needs to know about a Mind or project. */
export type DownloadTarget = {
  /** Id used for purchases (feed mindKey, e.g. "project:<uuid>"). */
  mind_id?: string | null;
  /** Creator/owner account id. */
  user_id?: string | null;
  /** "free" when nothing is sold. */
  plan_tier?: string | null;
  /** Price hint; 0 or missing = free. */
  price?: number | null;
};

export type DownloadAccess = "owner" | "free" | "purchased" | "locked";

/** Reason a viewer may (or may not) download a Mind's .json / runner / add-on. */
export function downloadAccess(
  target: DownloadTarget,
  currentUserId: string | null | undefined,
  activePurchases: Array<Pick<Purchase, "mind_id" | "expires_at">>,
  now = Date.now(),
): DownloadAccess {
  if (currentUserId && target.user_id && target.user_id === currentUserId) return "owner";
  if (target.plan_tier === "free" || !(Number(target.price ?? 0) > 0)) return "free";
  const id = target.mind_id ?? "";
  const bought = activePurchases.some(
    (p) => p.mind_id === id && (!p.expires_at || new Date(p.expires_at).getTime() > now),
  );
  return bought ? "purchased" : "locked";
}

/** True only for the owner, a free Mind, or an active buyer. */
export function canDownloadMind(
  target: DownloadTarget,
  currentUserId: string | null | undefined,
  activePurchases: Array<Pick<Purchase, "mind_id" | "expires_at">>,
): boolean {
  return downloadAccess(target, currentUserId, activePurchases) !== "locked";
}
