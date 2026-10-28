import { test } from "node:test";
import assert from "node:assert/strict";
import { miningLeaseState } from "./mining-jobs";

const now = Date.parse("2026-10-28T09:00:00Z");
const ago = (s: number) => new Date(now - s * 1000).toISOString();

test("running job updated under 90s ago is held", () => {
  assert.equal(miningLeaseState("running", ago(60), now), "held");
});
test("running job silent over 3 minutes is stale", () => {
  assert.equal(miningLeaseState("running", ago(181), now), "stale");
});
test("queued job is free", () => {
  assert.equal(miningLeaseState("queued", ago(10), now), "free");
});
