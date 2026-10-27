import { expect, test } from "bun:test";
import { makePaymentReference } from "./purchases.functions";
import { summarizeSales, isSafeHttpsUrl } from "./payouts";

test("payment reference is EVM- plus 5 unambiguous characters", () => {
  for (let i = 0; i < 50; i++) expect(makePaymentReference()).toMatch(/^EVM-[A-HJ-NP-Z2-9]{5}$/);
});

test("only approved orders count as earned; submitted is pending", () => {
  const s = summarizeSales([{ amount: 100, status: "approved" }, { amount: 50, status: "submitted" }, { amount: 30, status: "revoked" }]);
  expect(s.gross).toBe(100);
  expect(s.net).toBe(80);
  expect(s.pending).toBe(50);
});

test("QR and Stripe links must be https", () => {
  expect(isSafeHttpsUrl("javascript:alert(1)")).toBe(false);
  expect(isSafeHttpsUrl("http://x.com")).toBe(false);
  expect(isSafeHttpsUrl("https://buy.stripe.com/abc")).toBe(true);
});
