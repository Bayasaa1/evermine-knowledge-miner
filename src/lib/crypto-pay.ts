/** Pure rules for automatic USDT payments (TRC-20 & Polygon). No network calls here. */
export type CryptoNetwork = "usdt_trc20" | "usdt_polygon";
export const CRYPTO_NETWORKS: CryptoNetwork[] = ["usdt_trc20", "usdt_polygon"];
export const USDT_CONTRACT: Record<CryptoNetwork, string> = {
  usdt_trc20: "TR7NHqjeKQxGTCi8q8ZY4pPg7VQEHnTMDt",
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
