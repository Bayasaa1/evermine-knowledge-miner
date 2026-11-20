import { USDT_CONTRACT, parsePolygonTransfer, type CryptoNetwork, type OnchainTransfer } from "./crypto-pay";

const POLYGON_RPC = "https://polygon-bor-rpc.publicnode.com";
const POLYGON_CONFIRMATIONS = 20n;

export function walletFor(network: CryptoNetwork): string | null {
  const v = network === "usdt_trc20" ? process.env["USDT_TRC20_WALLET"] : process.env["USDT_POLYGON_WALLET"];
  return v && v.trim() ? v.trim() : null;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(POLYGON_RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await r.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}

/** Looks up one transfer to our wallet. Returns null when the hash is unknown/not a USDT transfer to us. */
export async function fetchTransfer(network: CryptoNetwork, hash: string, wallet: string): Promise<OnchainTransfer | null> {
  if (network === "usdt_polygon") {
    const rc = await rpc<{ status: string; blockNumber: string; logs: { address: string; topics: string[]; data: string }[] } | null>(
      "eth_getTransactionReceipt", [hash]);
    if (!rc) return null;
    const t = parsePolygonTransfer(rc.logs, wallet);
    if (!t) return null;
    const [head, block] = await Promise.all([
      rpc<string>("eth_blockNumber", []),
      rpc<{ timestamp: string }>("eth_getBlockByNumber", [rc.blockNumber, false]),
    ]);
    return {
      ...t, success: rc.status === "0x1", timestampMs: Number(BigInt(block.timestamp)) * 1000,
      confirmed: BigInt(head) - BigInt(rc.blockNumber) >= POLYGON_CONFIRMATIONS,
    };
  }
  const url = `https://api.trongrid.io/v1/accounts/${wallet}/transactions/trc20?only_to=true&only_confirmed=true&limit=200&contract_address=${USDT_CONTRACT.usdt_trc20}`;
  const headers: Record<string, string> = {};
  const key = process.env["TRONGRID_API_KEY"];
  if (key) headers["TRON-PRO-API-KEY"] = key;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`TronGrid ${r.status}`);
  const j = (await r.json()) as { data?: { transaction_id: string; to: string; value: string; block_timestamp: number; token_info?: { address?: string } }[] };
  const row = (j.data ?? []).find((d) => d.transaction_id.toLowerCase() === hash);
  if (!row) return null;
  return {
    token: row.token_info?.address ?? "", to: row.to, amountUnits: BigInt(row.value),
    success: true, confirmed: true, timestampMs: row.block_timestamp,
  };
}
