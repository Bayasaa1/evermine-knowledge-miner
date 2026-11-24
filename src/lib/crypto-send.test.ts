import { describe, expect, test } from "bun:test";
import { canTransition, checkPayout, isAuthorizedCaller, maxPayout, DEFAULT_MAX_PAYOUT_USDT } from "./crypto-send";

const POLY = "0x" + "a".repeat(40);
const row = (o: Partial<{ network: string; to_address: string; amount: number; status: string }> = {}) =>
  ({ network: "usdt_polygon", to_address: POLY, amount: 10, status: "queued", ...o });

describe("duplicate-send prevention", () => {
  test("sent payouts can never be claimed again", () => {
    expect(canTransition("sent", "sending")).toBe(false);
    expect(canTransition("sent", "queued")).toBe(false);
  });
  test("failed payouts are never auto-retried", () => {
    expect(canTransition("failed", "queued")).toBe(false);
    expect(canTransition("failed", "sending")).toBe(false);
  });
  test("only queued rows move to sending", () => {
    expect(canTransition("queued", "sending")).toBe(true);
    expect(canTransition("sending", "sending")).toBe(false);
    expect(checkPayout(row({ status: "sending" }), 100, 1000)).toEqual({ ok: false, reason: "status" });
  });
});

describe("invalid addresses", () => {
  test("rejects malformed polygon address", () => {
    expect(checkPayout(row({ to_address: "0x123" }), 100, 1000)).toEqual({ ok: false, reason: "address" });
  });
  test("rejects polygon address on tron network", () => {
    expect(checkPayout(row({ network: "usdt_trc20" }), 100, 1000)).toEqual({ ok: false, reason: "address" });
  });
  test("rejects unknown network", () => {
    expect(checkPayout(row({ network: "btc" }), 100, 1000)).toEqual({ ok: false, reason: "network" });
  });
  test("accepts valid TRON address", () => {
    expect(checkPayout(row({ network: "usdt_trc20", to_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" }), 100, 1000)).toEqual({ ok: true });
  });
});

describe("amount caps", () => {
  test("blocks payouts above the cap", () => {
    expect(checkPayout(row({ amount: 1500 }), 2000, 1000)).toEqual({ ok: false, reason: "cap" });
  });
  test("blocks payouts larger than the paid order", () => {
    expect(checkPayout(row({ amount: 60 }), 50, 1000)).toEqual({ ok: false, reason: "exceeds_order" });
  });
  test("blocks zero amounts", () => {
    expect(checkPayout(row({ amount: 0 }), 50, 1000)).toEqual({ ok: false, reason: "amount" });
  });
  test("default cap is 1000 USDT", () => {
    expect(maxPayout(undefined)).toBe(DEFAULT_MAX_PAYOUT_USDT);
    expect(maxPayout("250")).toBe(250);
    expect(maxPayout("-5")).toBe(1000);
  });
});

describe("unauthorized callers", () => {
  test("missing or wrong token is rejected", () => {
    expect(isAuthorizedCaller(null, "secret123")).toBe(false);
    expect(isAuthorizedCaller("Bearer nope", "secret123")).toBe(false);
    expect(isAuthorizedCaller("secret123", "secret123")).toBe(false);
  });
  test("unset secret never authorizes", () => {
    expect(isAuthorizedCaller("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCaller("Bearer x", "")).toBe(false);
  });
  test("correct bearer is accepted", () => {
    expect(isAuthorizedCaller("Bearer secret123", "secret123")).toBe(true);
  });
});
