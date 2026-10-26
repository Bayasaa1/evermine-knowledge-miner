import { expect, test } from "bun:test";
import { canDownloadMind, downloadAccess } from "./purchases";

const paid = { mind_id: "project:x", user_id: "creator", price: 10 };

test("owner downloads their own paid Mind", () => {
  expect(downloadAccess(paid, "creator", [])).toBe("owner");
});
test("free Mind downloads for anyone", () => {
  expect(canDownloadMind({ ...paid, price: 0 }, "viewer", [])).toBe(true);
  expect(canDownloadMind({ ...paid, plan_tier: "free" }, null, [])).toBe(true);
});
test("paid Mind is locked without a purchase", () => {
  expect(canDownloadMind(paid, "viewer", [])).toBe(false);
});
test("active purchase unlocks, expired does not", () => {
  expect(downloadAccess(paid, "viewer", [{ mind_id: "project:x", expires_at: null }])).toBe("purchased");
  expect(canDownloadMind(paid, "viewer", [{ mind_id: "project:x", expires_at: "2000-01-01T00:00:00Z" }])).toBe(false);
});
