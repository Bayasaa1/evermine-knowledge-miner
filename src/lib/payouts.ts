/**
 * Creator payout channels. Payout details are intentionally NOT collected during
 * onboarding: earnings accumulate as "unclaimed" and the creator only connects a
 * channel at the moment they withdraw.
 */
import { idbGet, idbSet, STORES } from "./store";
import { scopedKey } from "./user-scope";

export type PayoutChannel = "stripe" | "paypal" | "crypto" | "bank";

export type PayoutMethod = {
  channel: PayoutChannel;
  /** Stripe/PayPal account email, wallet address, or bank account reference. */
  destination: string;
  /** Crypto network (TRC20 / ERC20) or local bank/gateway name. */
  network: string;
  /** Account holder / beneficiary name where a channel needs it. */
  holder: string;
  connectedAt: number;
};

export type PayoutSettings = {
  /** null until the creator connects a channel at withdrawal time. */
  method: PayoutMethod | null;
};

export const PAYOUT_CHANNELS: PayoutChannel[] = ["stripe", "paypal", "crypto", "bank"];

export const CRYPTO_NETWORKS = ["TRC20", "ERC20", "BEP20", "Solana"] as const;

export function emptyPayoutSettings(): PayoutSettings {
  return { method: null };
}

export function normalizePayoutSettings(raw: unknown): PayoutSettings {
  if (typeof raw !== "object" || raw === null) return emptyPayoutSettings();
  const m = (raw as Record<string, unknown>)['method'];
  if (typeof m !== "object" || m === null) return emptyPayoutSettings();
  const o = m as Record<string, unknown>;
  const channel = PAYOUT_CHANNELS.includes(o['channel'] as PayoutChannel)
    ? (o['channel'] as PayoutChannel)
    : "stripe";
  const destination = typeof o['destination'] === "string" ? o['destination'] : "";
  if (!destination.trim()) return emptyPayoutSettings();
  return {
    method: {
      channel,
      destination,
      network: typeof o['network'] === "string" ? o['network'] : "",
      holder: typeof o['holder'] === "string" ? o['holder'] : "",
      connectedAt: typeof o['connectedAt'] === "number" ? o['connectedAt'] : Date.now(),
    },
  };
}

/** Channel-aware validation of the destination the creator typed. */
export function validateDestination(channel: PayoutChannel, destination: string): string | null {
  const v = destination.trim();
  if (!v) return "required";
  if (channel === "stripe" || channel === "paypal") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "email";
  }
  if (channel === "crypto") {
    return /^[A-Za-z0-9]{20,80}$/.test(v) ? null : "wallet";
  }
  return v.length >= 6 ? null : "bank";
}

/** Short masked label for display, never showing the full destination. */
export function maskDestination(destination: string): string {
  const v = destination.trim();
  if (v.length <= 8) return v;
  return `${v.slice(0, 4)}••••${v.slice(-4)}`;
}

const KEY = () => scopedKey("payout-settings");

export async function loadPayoutSettings(): Promise<PayoutSettings> {
  return normalizePayoutSettings(await idbGet<unknown>(STORES.SETTINGS, KEY()));
}

export async function savePayoutSettings(s: PayoutSettings): Promise<void> {
  await idbSet(STORES.SETTINGS, KEY(), s);
}

export async function connectPayoutMethod(
  method: Omit<PayoutMethod, "connectedAt">,
): Promise<PayoutSettings> {
  const next: PayoutSettings = { method: { ...method, connectedAt: Date.now() } };
  await savePayoutSettings(next);
  return next;
}

export async function disconnectPayoutMethod(): Promise<PayoutSettings> {
  const next = emptyPayoutSettings();
  await savePayoutSettings(next);
  return next;
}

/* ───────────── Receiving account (shared with buyers at checkout) ───────────── */
import { supabase } from "@/integrations/supabase/client";
import type { PlanLength } from "./subscription";

export const LOCAL_BANKS = ["Khan Bank", "Golomt Bank", "TDB", "State Bank", "XacBank", "Capitron", "Bogd Bank", "IBAN / Other"] as const;

export type ReceivingAccount = {
  bank_name: string;
  account_number: string;
  account_holder: string;
  qr_url: string;
  stripe_links: Partial<Record<PlanLength, string>>;
};

export function emptyReceivingAccount(): ReceivingAccount {
  return { bank_name: LOCAL_BANKS[0], account_number: "", account_holder: "", qr_url: "", stripe_links: {} };
}

/** Only https links are accepted for QR images and Stripe Payment Links. */
export function isSafeHttpsUrl(v: string): boolean {
  if (!v) return true;
  try { return new URL(v).protocol === "https:"; } catch { return false; }
}

export async function loadReceivingAccount(userId: string): Promise<ReceivingAccount> {
  const { data } = await supabase.from("creator_payout_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return emptyReceivingAccount();
  return {
    bank_name: data.bank_name, account_number: data.account_number, account_holder: data.account_holder,
    qr_url: data.qr_url, stripe_links: (data.stripe_links ?? {}) as ReceivingAccount["stripe_links"],
  };
}

export async function saveReceivingAccount(userId: string, a: ReceivingAccount): Promise<string | null> {
  const { error } = await supabase.from("creator_payout_accounts").upsert({ user_id: userId, ...a }, { onConflict: "user_id" });
  return error?.message ?? null;
}

/** Revenue summary from the creator's orders: only approved orders count as earned. */
export function summarizeSales(rows: Array<{ amount: number; status: string }>, commission = 0.2) {
  const gross = rows.filter((r) => r.status === "approved").reduce((s, r) => s + r.amount, 0);
  const pending = rows.filter((r) => r.status === "submitted").reduce((s, r) => s + r.amount, 0);
  return { gross, net: Math.round(gross * (1 - commission) * 100) / 100, pending };
}
