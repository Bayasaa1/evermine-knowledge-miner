import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, type Analytics } from "./analytics";

test("a 30,000 MNT payout is never deducted from USD earnings", () => {
  const data: Analytics = {
    sessions: [{ id: "chat", kind: "chat", mindId: "mind", startedAt: 0, endedAt: 60_000, queries: 10 }],
    growth: [],
    payouts: [{ at: 0, amount: 30_000, currency: "MNT" }, { at: 0, amount: 2, currency: " usd " }],
  };
  const before = JSON.stringify(data.payouts);
  const usd = summarize(data, { rate: 1, rateUnit: "query", currency: "USD" }, 60_000);
  assert.equal(usd.gross, 10);
  assert.equal(usd.paidOut, 2);
  assert.equal(usd.available, 8);
  assert.equal(JSON.stringify(data.payouts), before);
  const mnt = summarize(data, { rate: 3_000, rateUnit: "query", currency: "MNT" }, 60_000);
  assert.equal(mnt.paidOut, 30_000);
  assert.equal(mnt.available, 0);
});