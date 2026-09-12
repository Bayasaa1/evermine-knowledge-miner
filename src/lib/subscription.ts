/**
 * Direct creator subscription model (OnlyFans style): the creator offers one or
 * more plan lengths (1 month, 3 months, 1 year, lifetime), each with its own
 * price. The platform keeps a flat 20% commission and the rest is paid out to
 * the creator.
 */
import { supabase } from "@/integrations/supabase/client";
import { idbGet, idbSet, STORES } from "./store";

export const PLATFORM_COMMISSION = 0.2;

/**
 * No price caps: creators type any price they want. 0 means free access.
 * These are purely optional one-tap hints, never a limit.
 */
export const PRICE_HINTS = [0, 5, 25, 100] as const;

/** Subscription lengths a creator can offer. */
export type PlanLength = "month" | "quarter" | "year" | "lifetime";

export const PLAN_LENGTHS: readonly PlanLength[] = ["month", "quarter", "year", "lifetime"] as const;

/** How many months each length lasts. `null` = never expires. */
export const PLAN_MONTHS: Record<PlanLength, number | null> = {
  month: 1,
  quarter: 3,
  year: 12,
  lifetime: null,
};

export type PlanTier = { enabled: boolean; price: number };
export type PlanTiers = Record<PlanLength, PlanTier>;

export type SubscriptionPlan = {
  /** Whether access is sold at all. false = the mind is free for everyone. */
  enabled: boolean;
  /** Price per offered length. */
  tiers: PlanTiers;
  currency: string;
  /** Short pitch shown on the subscribe button / paywall. */
  perks: string;
  /** Stripe Connect account status for payouts. */
  connect: { status: "not_connected" | "pending" | "connected"; accountId: string; email: string };
};

export function createTiers(monthly = 15): PlanTiers {
  return {
    month: { enabled: true, price: monthly },
    quarter: { enabled: false, price: 0 },
    year: { enabled: false, price: 0 },
    lifetime: { enabled: false, price: 0 },
  };
}

export function createPlan(): SubscriptionPlan {
  return {
    enabled: false,
    tiers: createTiers(),
    currency: "USD",
    perks: "Unlimited chat, voice and video calls with my AI clone, plus every new memory I mine.",
    connect: { status: "not_connected", accountId: "", email: "" },
  };
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

/** Accepts both the new tier shape and older single-price plans. */
export function normalizeTiers(raw: unknown, legacyMonthly?: unknown): PlanTiers {
  const base = createTiers(num(legacyMonthly, 15));
  if (typeof raw !== "object" || raw === null) return base;
  const v = raw as Record<string, unknown>;
  const out = { ...base };
  for (const key of PLAN_LENGTHS) {
    const tier = v[key];
    if (typeof tier !== "object" || tier === null) continue;
    const t = tier as Record<string, unknown>;
    out[key] = { enabled: t['enabled'] === true, price: num(t['price'], 0) };
  }
  return out;
}

export function normalizePlan(raw: unknown): SubscriptionPlan {
  const base = createPlan();
  if (typeof raw !== "object" || raw === null) return base;
  const v = raw as Record<string, unknown>;
  const c = (v['connect'] ?? {}) as Record<string, unknown>;
  const status = c['status'];
  return {
    enabled: v['enabled'] === true,
    tiers: normalizeTiers(v['tiers'], v['monthlyPrice']),
    currency: typeof v['currency'] === "string" && v['currency'] ? v['currency'] : base.currency,
    perks: typeof v['perks'] === "string" && v['perks'] ? v['perks'] : base.perks,
    connect: {
      status: status === "connected" || status === "pending" ? status : "not_connected",
      accountId: typeof c['accountId'] === "string" ? c['accountId'] : "",
      email: typeof c['email'] === "string" ? c['email'] : "",
    },
  };
}

/** Lengths this plan actually sells, in display order. */
export function offeredTiers(tiers: PlanTiers): Array<{ length: PlanLength; price: number }> {
  return PLAN_LENGTHS.filter((l) => tiers[l]?.enabled).map((l) => ({ length: l, price: tiers[l].price }));
}

/** When a plan bought now runs out. `null` = lifetime / never expires. */
export function expiryFor(length: PlanLength, from = new Date()): string | null {
  const months = PLAN_MONTHS[length];
  if (months == null) return null;
  const end = new Date(from);
  end.setMonth(end.getMonth() + months);
  return end.toISOString();
}

export type Split = { gross: number; commission: number; net: number };

/** Splits a charge into the 20% platform commission and the creator payout. */
export function splitRevenue(price: number, subscribers = 1): Split {
  const gross = Math.max(0, price) * Math.max(0, subscribers);
  const commission = round2(gross * PLATFORM_COMMISSION);
  return { gross: round2(gross), commission, net: round2(gross - commission) };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const PLAN_KEY = "subscription-plan";

export async function loadPlan(): Promise<SubscriptionPlan> {
  return normalizePlan(await idbGet<unknown>(STORES.SETTINGS, PLAN_KEY));
}

export async function savePlan(plan: SubscriptionPlan): Promise<void> {
  await idbSet(STORES.SETTINGS, PLAN_KEY, plan);
  await publishPlanToProjects(plan);
}

/**
 * Monetization is a creator-wide setting, so the offered lengths are mirrored
 * onto every project the creator owns. Viewers read them from the feed.
 */
async function publishPlanToProjects(plan: SubscriptionPlan): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const tiers = plan.enabled ? plan.tiers : createTiers(0);
    await supabase
      .from("projects")
      .update({ plan_tiers: { enabled: plan.enabled, currency: plan.currency, ...tiers } })
      .eq("user_id", auth.user.id);
  } catch {
    // Offline or signed out: the local copy is still saved.
  }
}

/** Local Stripe Connect onboarding stub — flips the account to "connected" on this device. */
export function connectStripeAccount(email: string): SubscriptionPlan["connect"] {
  return {
    status: "connected",
    accountId: `acct_${Math.random().toString(36).slice(2, 12)}`,
    email: email.trim(),
  };
}
