import { test } from "node:test";
import assert from "node:assert/strict";
import { makePaymentReference } from "./purchases.functions";
import { summarizeSales, isSafeHttpsUrl } from "./payouts";

test("payment reference is EVM- plus 5 unambiguous characters", () => {
  for (let i = 0; i < 50; i++) assert.match(makePaymentReference(), /^EVM-[A-HJ-NP-Z2-9]{5}$/);
});

test("only approved orders count as earned; submitted is pending", () => {
  const s = summarizeSales([{ amount: 100, status: "approved" }, { amount: 50, status: "submitted" }, { amount: 30, status: "revoked" }]);
  assert.equal(s.gross, 100);
  assert.equal(s.net, 80);
  assert.equal(s.pending, 50);
});

test("QR and Stripe links must be https", () => {
  assert.equal(isSafeHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpsUrl("http://x.com"), false);
  assert.equal(isSafeHttpsUrl("https://buy.stripe.com/abc"), true);
});
