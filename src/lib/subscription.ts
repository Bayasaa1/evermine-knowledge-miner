/**
 * Direct creator subscription model (OnlyFans style): the creator sets a monthly
 * price for full access to their AI Clone, the platform keeps a flat 20% commission
 * and the rest is paid out to the creator's connected Stripe account.
 */
import { idbGet, idbSet, STORES } from "./store";

export const PLATFORM_COMMISSION = 0.2;

/**
 * No price caps: creators type any monthly price they want. 0 means free access.
 * These are purely optional one-tap hints, never a limit.
 */
export const PRICE_HINTS = [0, 5, 25, 100] as const;

export type SubscriptionPlan = {
  /** Whether the mind is offered as a monthly subscription. */
  enabled: boolean;
  /** Monthly price charged to each subscriber, in `currency`. */
  monthlyPrice: number;
  currency: string;
  /** Short pitch shown on the subscribe button / paywall. */
  perks: string;
  /** Stripe Connect account status for payouts. */
  connect: { status: "not_connected" | "pending" | "connected"; accountId: string; email: string };
};

export function createPlan(): SubscriptionPlan {
  return {
    enabled: false,
    monthlyPrice: 15,
    currency: "USD",
    perks: "Unlimited chat, voice and video calls with my AI clone, plus every new memory I mine.",
    connect: { status: "not_connected", accountId: "", email: "" },
  };
}

export function normalizePlan(raw: unknown): SubscriptionPlan {
  const base = createPlan();
  if (typeof raw !== "object" || raw === null) return base;
  const v = raw as Record<string, unknown>;
  const c = (v['connect'] ?? {}) as Record<string, unknown>;
  const status = c['status'];
  return {
    enabled: v['enabled'] === true,
    monthlyPrice:
      typeof v['monthlyPrice'] === "number" && Number.isFinite(v['monthlyPrice'])
        ? Math.max(0, v['monthlyPrice'])
        : base.monthlyPrice,
    currency: typeof v['currency'] === "string" && v['currency'] ? v['currency'] : base.currency,
    perks: typeof v['perks'] === "string" && v['perks'] ? v['perks'] : base.perks,
    connect: {
      status: status === "connected" || status === "pending" ? status : "not_connected",
      accountId: typeof c['accountId'] === "string" ? c['accountId'] : "",
      email: typeof c['email'] === "string" ? c['email'] : "",
    },
  };
}

export type Split = { gross: number; commission: number; net: number };

/** Splits a monthly charge into the 20% platform commission and the creator payout. */
export function splitRevenue(monthlyPrice: number, subscribers = 1): Split {
  const gross = Math.max(0, monthlyPrice) * Math.max(0, subscribers);
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
}

/** Local Stripe Connect onboarding stub — flips the account to "connected" on this device. */
export function connectStripeAccount(email: string): SubscriptionPlan["connect"] {
  return {
    status: "connected",
    accountId: `acct_${Math.random().toString(36).slice(2, 12)}`,
    email: email.trim(),
  };
}
