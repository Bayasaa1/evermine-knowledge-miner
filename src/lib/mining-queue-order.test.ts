import { test } from "node:test";
import assert from "node:assert/strict";
import { MINING_ACTIVE_WINDOW, isQuotaMessage, orderMiningQueue } from "./mining-jobs";

const j = (id: string, queuePosition: number, nextIndex: number, createdAt: string) => ({ id, queuePosition, nextIndex, createdAt, updatedAt: createdAt });

test("promoted video comes first, then started ones, then oldest", () => {
  const out = orderMiningQueue([j("new", 0, 0, "2026-01-01"), j("started", 0, 3, "2026-01-05"), j("promoted", -1, 0, "2026-01-09")]).map((x) => x.id);
  assert.deepEqual(out, ["promoted", "started", "new"]);
});
test("active window is small, never the whole queue", () => {
  assert.equal(MINING_ACTIVE_WINDOW, 6);
});
test("Cloudflare 524 timeout is a temporary wait, not a dead error", () => {
  assert.equal(isQuotaMessage("error code: 524"), true);
});
