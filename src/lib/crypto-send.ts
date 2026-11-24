/** Pure payout guards shared by the hot-wallet sender and its tests. */
import { isCryptoNetwork, isPayoutAddress } from "./crypto-pay";

/** Hard ceiling for one automatic payout; HOT_WALLET_MAX_PAYOUT may lower or raise it. */
export const DEFAULT_MAX_PAYOUT_USDT = 1000;

export function maxPayout(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_PAYOUT_USDT;
}

/** Allowed status moves. sent and failed are terminal so a payout is never sent twice. */
const NEXT: Record<string, readonly string[]> = {
  waiting_address: ["queued"],
  queued: ["sending"],
  sending: ["sent", "failed"],
  sent: [],
  failed: [],
};
export function canTransition(from: string, to: string): boolean {
  return (NEXT[from] ?? []).includes(to);
}

export type PayoutCheck = { ok: true } | { ok: false; reason: "network" | "address" | "amount" | "cap" | "exceeds_order" | "status" };

/** Validates one payout row against its paid order before any key is used. */
export function checkPayout(
  row: { network: string; to_address: string; amount: number | string; status: string },
  orderAmount: number,
  cap: number,
): PayoutCheck {
  if (row.status !== "queued") return { ok: false, reason: "status" };
  if (!isCryptoNetwork(row.network)) return { ok: false, reason: "network" };
  if (!isPayoutAddress(row.network, row.to_address)) return { ok: false, reason: "address" };
  const amt = Number(row.amount);
  if (!(amt > 0) || !Number.isFinite(amt)) return { ok: false, reason: "amount" };
  if (amt > cap) return { ok: false, reason: "cap" };
  if (amt > orderAmount + 1e-9) return { ok: false, reason: "exceeds_order" };
  return { ok: true };
}

/** Constant-time bearer check for the payout trigger; empty secrets never authorize. */
export function isAuthorizedCaller(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const token = /^Bearer ([^\s,]+)$/.exec(authHeader ?? "")?.[1];
  if (!token || token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
