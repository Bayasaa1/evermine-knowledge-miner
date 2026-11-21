import { sha256 as viemSha256 } from "viem";
const sha256 = (b: Uint8Array) => viemSha256(b, "bytes");
/** Pure rules for automatic USDT payments (TRC-20 & Polygon). No network calls here. */
export type CryptoNetwork = "usdt_trc20" | "usdt_polygon";
export const CRYPTO_NETWORKS: CryptoNetwork[] = ["usdt_trc20", "usdt_polygon"];
export const USDT_CONTRACT: Record<CryptoNetwork, string> = {
  usdt_trc20: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  usdt_polygon: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
};
export const USDT_DECIMALS = 6;
/** A transfer older than this before the order was opened cannot pay it. */
export const MAX_EARLY_MS = 10 * 60 * 1000;

export function isCryptoNetwork(v: unknown): v is CryptoNetwork {
  return v === "usdt_trc20" || v === "usdt_polygon";
}

export function normalizeTxHash(network: CryptoNetwork, raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(s)) return null;
  return network === "usdt_polygon" ? `0x${s}` : s;
}

export type OnchainTransfer = {
  token: string; to: string; amountUnits: bigint; success: boolean; timestampMs: number; confirmed: boolean;
};

export type CheckInput = {
  network: CryptoNetwork; wallet: string; orderAmountUsd: number; orderCreatedMs: number; nowMs: number;
};

/** Returns null when the transfer pays the order, else the reason it does not. */
export function checkTransfer(t: OnchainTransfer, c: CheckInput): string | null {
  const same = (a: string, b: string) =>
    c.network === "usdt_polygon" ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!same(t.token, USDT_CONTRACT[c.network])) return "Not a USDT transfer.";
  if (!same(t.to, c.wallet)) return "The transfer did not go to the Evermind wallet.";
  if (!t.success) return "The transfer failed on-chain.";
  if (!t.confirmed) return "The transfer is not confirmed yet. Try again in a minute.";
  const need = BigInt(Math.round(c.orderAmountUsd * 10 ** USDT_DECIMALS));
  if (t.amountUnits < need) return "The amount sent is less than the price.";
  if (t.timestampMs < c.orderCreatedMs - MAX_EARLY_MS) return "This transfer was made before the order was opened.";
  if (t.timestampMs > c.nowMs + MAX_EARLY_MS) return "Invalid transfer time.";
  return null;
}

/** Platform fee and creator net, rounded to cents. */
export function splitPayment(amount: number, commission: number): { fee: number; net: number } {
  const fee = Math.round(amount * commission * 100) / 100;
  return { fee, net: Math.round((amount - fee) * 100) / 100 };
}

/** Decodes the first ERC-20 Transfer log for a contract from a Polygon receipt. */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export function parsePolygonTransfer(
  logs: { address: string; topics: string[]; data: string }[], wallet: string,
): { token: string; to: string; amountUnits: bigint } | null {
  for (const l of logs) {
    if (l.address.toLowerCase() !== USDT_CONTRACT.usdt_polygon) continue;
    if ((l.topics[0] || "").toLowerCase() !== TRANSFER_TOPIC || l.topics.length < 3) continue;
    const to = `0x${l.topics[2]!.slice(-40)}`.toLowerCase();
    if (to !== wallet.toLowerCase()) continue;
    return { token: l.address, to, amountUnits: BigInt(l.data) };
  }
  return null;
}

/* ───────────── Agreement + payout addresses ───────────── */
/** Bump when the purchase agreement text changes; orders store the version the buyer accepted. */
export const TERMS_VERSION = "2026-11-21";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Decode(s: string): Uint8Array | null {
  let n = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) return null; n = n * 58n + BigInt(i); }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c === "1") bytes.unshift(0); else break; }
  return new Uint8Array(bytes);
}

/** 20-byte hex (no 0x) of a TRON base58 address, or null when it is not a TRON address. */
export function tronAddressHex(addr: string): string | null {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return null;
  const b = base58Decode(addr);
  if (!b || b.length !== 25 || b[0] !== 0x41) return null;
  const check = sha256(sha256(b.slice(0, 21)));
  for (let i = 0; i < 4; i++) if (check[i] !== b[21 + i]) return null;
  return Array.from(b.slice(1, 21), (x) => x.toString(16).padStart(2, "0")).join("");
}

export function isPayoutAddress(network: CryptoNetwork, addr: string): boolean {
  const v = addr.trim();
  return network === "usdt_polygon" ? /^0x[0-9a-fA-F]{40}$/.test(v) : tronAddressHex(v) !== null;
}

/** ABI-encoded transfer(address,uint256) arguments for TRC-20 (hex, no selector). */
export function trc20TransferParams(toHex20: string, units: bigint): string {
  return toHex20.padStart(64, "0") + units.toString(16).padStart(64, "0");
}

export function toUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 10 ** USDT_DECIMALS));
}
