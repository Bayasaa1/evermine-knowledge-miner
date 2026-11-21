import { describe, test } from "node:test";
import assert from "node:assert/strict";
const expect = (v: unknown) => ({ toBeNull: () => assert.equal(v, null), toBe: (x: unknown) => assert.equal(v, x), toEqual: (x: unknown) => assert.deepEqual(v, x), not: { toBeNull: () => assert.notEqual(v, null) } });
import { checkTransfer, normalizeTxHash, parsePolygonTransfer, splitPayment, TRANSFER_TOPIC, USDT_CONTRACT } from "./crypto-pay";

const W = "TWalletXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const base = { token: USDT_CONTRACT.usdt_trc20, to: W, amountUnits: 10_000_000n, success: true, confirmed: true, timestampMs: 1_000_000_000 };
const c = { network: "usdt_trc20" as const, wallet: W, orderAmountUsd: 10, orderCreatedMs: 1_000_000_000, nowMs: 1_000_100_000 };

describe("crypto payment rules", () => {
  test("exact USDT to our wallet pays the order", () => expect(checkTransfer(base, c)).toBeNull());
  test("less than the price is rejected", () => expect(checkTransfer({ ...base, amountUnits: 9_990_000n }, c)).not.toBeNull());
  test("other wallet is rejected", () => expect(checkTransfer({ ...base, to: "TOther" }, c)).not.toBeNull());
  test("other token is rejected", () => expect(checkTransfer({ ...base, token: "TFake" }, c)).not.toBeNull());
  test("failed or unconfirmed is rejected", () => {
    expect(checkTransfer({ ...base, success: false }, c)).not.toBeNull();
    expect(checkTransfer({ ...base, confirmed: false }, c)).not.toBeNull();
  });
  test("old transfer before the order is rejected", () =>
    expect(checkTransfer({ ...base, timestampMs: c.orderCreatedMs - 11 * 60_000 }, c)).not.toBeNull());
  test("20% platform fee, 80% creator", () => expect(splitPayment(10, 0.2)).toEqual({ fee: 2, net: 8 }));
  test("tx hash normalization", () => {
    expect(normalizeTxHash("usdt_polygon", "0x" + "A".repeat(64))).toBe("0x" + "a".repeat(64));
    expect(normalizeTxHash("usdt_trc20", "abc")).toBeNull();
  });
  test("polygon log decode", () => {
    const wallet = "0x" + "1".repeat(40);
    const t = parsePolygonTransfer([{ address: USDT_CONTRACT.usdt_polygon, topics: [TRANSFER_TOPIC, "0x" + "0".repeat(64), "0x" + "0".repeat(24) + "1".repeat(40)], data: "0x989680" }], wallet);
    expect(t?.amountUnits).toBe(10_000_000n);
  });
});

import { isPayoutAddress, tronAddressHex, trc20TransferParams, toUnits } from "./crypto-pay";
describe("payout addresses", () => {
  test("decodes the USDT TRC-20 contract to its known hex", () => {
    expect(tronAddressHex("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe("a614f803b6fd780986a42c78ec9c7f77e6ded13c");
  });
  test("rejects a TRON address with a bad checksum length or charset", () => {
    expect(isPayoutAddress("usdt_trc20", "T0000")).toBe(false);
    expect(isPayoutAddress("usdt_polygon", "0x123")).toBe(false);
    expect(isPayoutAddress("usdt_polygon", "0xc2132d05d31c914a87c6611c10748aeb04b58e8f")).toBe(true);
  });
  test("encodes 12.5 USDT transfer params", () => {
    expect(toUnits(12.5)).toBe(12_500_000n);
    expect(trc20TransferParams("ab".repeat(20), 12_500_000n).length).toBe(128);
  });
});
