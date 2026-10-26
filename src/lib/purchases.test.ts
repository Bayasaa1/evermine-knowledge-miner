import { test } from "node:test";
import assert from "node:assert/strict";
import { canDownloadMind, downloadAccess } from "./purchases";

const paid = { mind_id: "project:x", user_id: "creator", price: 10 };

test("owner downloads their own paid Mind", () => {
  assert.equal(downloadAccess(paid, "creator", []), "owner");
});
test("free Mind downloads for anyone", () => {
  assert.equal(canDownloadMind({ ...paid, price: 0 }, "viewer", []), true);
  assert.equal(canDownloadMind({ ...paid, plan_tier: "free" }, null, []), true);
});
test("paid Mind is locked without a purchase", () => {
  assert.equal(canDownloadMind(paid, "viewer", []), false);
});
test("active purchase unlocks, expired does not", () => {
  assert.equal(downloadAccess(paid, "viewer", [{ mind_id: "project:x", expires_at: null }]), "purchased");
  assert.equal(canDownloadMind(paid, "viewer", [{ mind_id: "project:x", expires_at: "2000-01-01T00:00:00Z" }]), false);
});
