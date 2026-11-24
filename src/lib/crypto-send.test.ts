import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, checkPayout, isAuthorizedCaller, maxPayout, DEFAULT_MAX_PAYOUT_USDT } from "./crypto-send";

const POLY = "0x" + "a".repeat(40);
const row = (o: Partial<{ network: string; to_address: string; amount: number; status: string }> = {}) =>
  ({ network: "usdt_polygon", to_address: POLY, amount: 10, status: "queued", ...o });

describe("duplicate-send prevention", () => {
  test("sent payouts can never be claimed again", () => {
    assert.equal(canTransition("sent", "sending"), false);
    assert.equal(canTransition("sent", "queued"), false);
  });
  test("failed payouts are never auto-retried", () => {
    assert.equal(canTransition("failed", "queued"), false);
    assert.equal(canTransition("failed", "sending"), false);
  });
  test("only queued rows move to sending", () => {
    assert.equal(canTransition("queued", "sending"), true);
    assert.equal(canTransition("sending", "sending"), false);
    assert.deepEqual(checkPayout(row({ status: "sending" }), 100, 1000), { ok: false, reason: "status" });
  });
});

describe("invalid addresses", () => {
  test("rejects malformed polygon address", () => {
    assert.deepEqual(checkPayout(row({ to_address: "0x123" }), 100, 1000), { ok: false, reason: "address" });
  });
  test("rejects polygon address on tron network", () => {
    assert.deepEqual(checkPayout(row({ network: "usdt_trc20" }), 100, 1000), { ok: false, reason: "address" });
  });
  test("rejects unknown network", () => {
    assert.deepEqual(checkPayout(row({ network: "btc" }), 100, 1000), { ok: false, reason: "network" });
  });
  test("accepts valid TRON address", () => {
    assert.deepEqual(checkPayout(row({ network: "usdt_trc20", to_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }), 100, 1000), { ok: true });
  });
});

describe("amount caps", () => {
  test("blocks payouts above the cap", () => {
    assert.deepEqual(checkPayout(row({ amount: 1500 }), 2000, 1000), { ok: false, reason: "cap" });
  });
  test("blocks payouts larger than the paid order", () => {
    assert.deepEqual(checkPayout(row({ amount: 60 }), 50, 1000), { ok: false, reason: "exceeds_order" });
  });
  test("blocks zero amounts", () => {
    assert.deepEqual(checkPayout(row({ amount: 0 }), 50, 1000), { ok: false, reason: "amount" });
  });
  test("default cap is 1000 USDT", () => {
    assert.equal(maxPayout(undefined), DEFAULT_MAX_PAYOUT_USDT);
    assert.equal(maxPayout("250"), 250);
    assert.equal(maxPayout("-5"), 1000);
  });
});

describe("unauthorized callers", () => {
  test("missing or wrong token is rejected", () => {
    assert.equal(isAuthorizedCaller(null, "secret123"), false);
    assert.equal(isAuthorizedCaller("Bearer nope", "secret123"), false);
    assert.equal(isAuthorizedCaller("secret123", "secret123"), false);
  });
  test("unset secret never authorizes", () => {
    assert.equal(isAuthorizedCaller("Bearer ", undefined), false);
    assert.equal(isAuthorizedCaller("Bearer x", ""), false);
  });
  test("correct bearer is accepted", () => {
    assert.equal(isAuthorizedCaller("Bearer secret123", "secret123"), true);
  });
});
