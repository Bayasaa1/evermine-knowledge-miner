/**
 * Hot-wallet sender. Pays creators and sweeps platform fees to the owner's cold wallet.
 * Private keys live only in server secrets (HOT_WALLET_POLYGON_KEY / HOT_WALLET_TRON_KEY).
 * A payout is claimed queued→sending atomically and is never auto-retried after a send
 * attempt fails, so a timeout can never pay someone twice.
 */
import { USDT_CONTRACT, isCryptoNetwork, isUsdtPayoutOrder, isPayoutAddress, toUnits, tronAddressHex, trc20TransferParams, type CryptoNetwork } from "./crypto-pay";

const POLYGON_RPC = "https://polygon-bor-rpc.publicnode.com";

export function coldWalletFor(network: CryptoNetwork): string | null {
  const v = network === "usdt_trc20" ? process.env["COLD_WALLET_TRC20"] : process.env["COLD_WALLET_POLYGON"];
  return v && isPayoutAddress(network, v.trim()) ? v.trim() : null;
}

function hotKey(network: CryptoNetwork): `0x${string}` | null {
  const raw = (network === "usdt_trc20" ? process.env["HOT_WALLET_TRON_KEY"] : process.env["HOT_WALLET_POLYGON_KEY"])?.trim();
  if (!raw) return null;
  const k = raw.replace(/^0x/, "");
  return /^[0-9a-fA-F]{64}$/.test(k) ? (`0x${k}` as `0x${string}`) : null;
}

export function senderReady(network: CryptoNetwork): boolean { return hotKey(network) !== null; }

async function sendPolygon(key: `0x${string}`, to: string, amount: number): Promise<string> {
  const { createWalletClient, http, erc20Abi } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { polygon } = await import("viem/chains");
  const client = createWalletClient({ account: privateKeyToAccount(key), chain: polygon, transport: http(POLYGON_RPC) });
  return client.writeContract({
    address: USDT_CONTRACT.usdt_polygon as `0x${string}`, abi: erc20Abi, functionName: "transfer",
    args: [to as `0x${string}`, toUnits(amount)],
  });
}

async function sendTron(key: `0x${string}`, to: string, amount: number): Promise<string> {
  const { sign, privateKeyToAccount } = await import("viem/accounts");
  const { keccak256 } = await import("viem");
  const toHex = tronAddressHex(to);
  if (!toHex) throw new Error("Invalid TRON address");
  // TRON address = 0x41 + last 20 bytes of keccak(pubkey), base58check; TronGrid accepts hex with visible=false.
  const pub = privateKeyToAccount(key).publicKey;
  const owner = "41" + keccak256(`0x${pub.slice(4)}`).slice(-40);
  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = process.env["TRONGRID_API_KEY"];
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;
  const r = await fetch("https://api.trongrid.io/wallet/triggersmartcontract", {
    method: "POST", headers,
    body: JSON.stringify({
      owner_address: owner, contract_address: "41" + tronAddressHex(USDT_CONTRACT.usdt_trc20)!,
      function_selector: "transfer(address,uint256)", parameter: trc20TransferParams(toHex, toUnits(amount)),
      fee_limit: 40_000_000, call_value: 0, visible: false,
    }),
  });
  const j = (await r.json()) as { result?: { result?: boolean; message?: string }; transaction?: { txID: string; signature?: string[] } };
  if (!j.result?.result || !j.transaction) throw new Error(`TRON build failed: ${j.result?.message ?? r.status}`);
  const sig = await sign({ hash: `0x${j.transaction.txID}`, privateKey: key, to: "hex" });
  j.transaction.signature = [sig.slice(2)];
  const b = await fetch("https://api.trongrid.io/wallet/broadcasttransaction", { method: "POST", headers, body: JSON.stringify(j.transaction) });
  const bj = (await b.json()) as { result?: boolean; message?: string };
  if (!bj.result) throw new Error(`TRON broadcast failed: ${bj.message ?? b.status}`);
  return j.transaction.txID;
}

export async function sendUsdt(network: CryptoNetwork, to: string, amount: number): Promise<string> {
  const key = hotKey(network);
  if (!key) throw new Error("Hot wallet key is not set");
  if (!isPayoutAddress(network, to)) throw new Error("Invalid payout address");
  return network === "usdt_polygon" ? sendPolygon(key, to, amount) : sendTron(key, to, amount);
}

/** Revalidate the source denomination without rewriting paid orders or sent payouts. */
async function hasUsdtSettlement(orderId: string, network: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin.from("mind_payment_orders")
    .select("currency,method,status").eq("id", orderId).maybeSingle();
  return isUsdtPayoutOrder(order, network);
}

/** Creates the creator payout + platform sweep rows for one paid order (idempotent). */
export async function enqueuePayouts(order: { id: string; creator_user_id: string; method: string; creator_net: number; platform_fee: number }): Promise<void> {
  if (!isCryptoNetwork(order.method) || !await hasUsdtSettlement(order.id, order.method)) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const network = order.method;
  const { data: acct } = await supabaseAdmin.from("creator_payout_accounts")
    .select("usdt_trc20_address,usdt_polygon_address").eq("user_id", order.creator_user_id).maybeSingle();
  const creatorAddr = (network === "usdt_trc20" ? acct?.usdt_trc20_address : acct?.usdt_polygon_address) ?? "";
  const cold = coldWalletFor(network) ?? "";
  await supabaseAdmin.from("crypto_payouts").upsert([
    { order_id: order.id, kind: "creator", recipient_user_id: order.creator_user_id, network, to_address: creatorAddr,
      amount: order.creator_net, status: isPayoutAddress(network, creatorAddr) ? "queued" : "waiting_address" },
    { order_id: order.id, kind: "platform", recipient_user_id: null, network, to_address: cold,
      amount: order.platform_fee, status: cold ? "queued" : "waiting_address" },
  ], { onConflict: "order_id,kind", ignoreDuplicates: true });
}

/** Sends up to `limit` queued payouts. Returns how many were sent. */
export async function processPayouts(limit = 5): Promise<{ sent: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Rows that were waiting for an address get it filled in once the creator / owner sets one.
  const { data: waiting } = await supabaseAdmin.from("crypto_payouts").select("id,order_id,kind,network,recipient_user_id")
    .eq("status", "waiting_address").limit(50);
  for (const w of waiting ?? []) {
    if (!isCryptoNetwork(w.network) || !await hasUsdtSettlement(w.order_id, w.network)) continue;
    const net = w.network;
    let addr = "";
    if (w.kind === "platform") addr = coldWalletFor(net) ?? "";
    else if (w.recipient_user_id) {
      const { data: a } = await supabaseAdmin.from("creator_payout_accounts").select("usdt_trc20_address,usdt_polygon_address")
        .eq("user_id", w.recipient_user_id).maybeSingle();
      addr = (net === "usdt_trc20" ? a?.usdt_trc20_address : a?.usdt_polygon_address) ?? "";
    }
    if (isPayoutAddress(net, addr)) {
      await supabaseAdmin.from("crypto_payouts").update({ to_address: addr, status: "queued", updated_at: new Date().toISOString() })
        .eq("id", w.id).eq("status", "waiting_address");
    }
  }
  const { data: rows } = await supabaseAdmin.from("crypto_payouts").select("*").eq("status", "queued")
    .order("created_at").limit(limit);
  let sent = 0, failed = 0;
  for (const row of rows ?? []) {
    if (!isCryptoNetwork(row.network) || !await hasUsdtSettlement(row.order_id, row.network)) continue;
    const net = row.network;
    if (!senderReady(net) || !(Number(row.amount) > 0)) continue;
    const { data: claimed } = await supabaseAdmin.from("crypto_payouts")
      .update({ status: "sending", attempts: row.attempts + 1, updated_at: new Date().toISOString() })
      .eq("id", row.id).eq("status", "queued").select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const hash = await sendUsdt(net, row.to_address, Number(row.amount));
      await supabaseAdmin.from("crypto_payouts").update({ status: "sent", tx_hash: hash, error: "", updated_at: new Date().toISOString() }).eq("id", row.id);
      sent++;
    } catch (e) {
      console.error("payout send", row.id, e);
      await supabaseAdmin.from("crypto_payouts").update({ status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 300), updated_at: new Date().toISOString() }).eq("id", row.id);
      failed++;
    }
  }
  return { sent, failed };
}
