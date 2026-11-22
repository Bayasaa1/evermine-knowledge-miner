import { test } from "node:test";
import assert from "node:assert/strict";
import { makePaymentReference } from "./purchases.functions";
import { summarizeSales, summarizeSalesByCurrency, isSafeHttpsUrl } from "./payouts";

test("payment reference is EVM- plus 5 unambiguous characters", () => {
  for (let i = 0; i < 50; i++) assert.match(makePaymentReference(), /^EVM-[A-HJ-NP-Z2-9]{5}$/);
});

test("only approved orders count as earned; submitted is pending", () => {
  const s = summarizeSales([{ amount: 100, status: "approved" }, { amount: 50, status: "submitted" }, { amount: 30, status: "revoked" }]);
  assert.equal(s.gross, 100);
  assert.equal(s.net, 80);
  assert.equal(s.pending, 50);
});

test("30,000 MNT and 10 USD stay separate in earned and pending totals", () => {
  assert.deepEqual(summarizeSalesByCurrency([
    { amount: 30_000, currency: "MNT", status: "approved" },
    { amount: 10, currency: "USD", status: "approved" },
    { amount: 5, currency: "usd", status: "submitted" },
    { amount: 2, currency: "USDT", status: "approved" },
  ]), [
    { currency: "MNT", gross: 30_000, net: 24_000, pending: 0 },
    { currency: "USD", gross: 10, net: 8, pending: 5 },
    { currency: "USDT", gross: 2, net: 1.6, pending: 0 },
  ]);
});

test("QR and Stripe links must be https", () => {
  assert.equal(isSafeHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpsUrl("http://x.com"), false);
  assert.equal(isSafeHttpsUrl("https://buy.stripe.com/abc"), true);
});
