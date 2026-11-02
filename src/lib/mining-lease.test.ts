import { test } from "node:test";
import assert from "node:assert/strict";
import { miningLeaseState, MINING_POLL_MS } from "./mining-jobs";

const now = Date.parse("2026-10-28T09:00:00Z");
const ago = (s: number) => new Date(now - s * 1000).toISOString();

test("running job updated under 90s ago is held", () => {
  assert.equal(miningLeaseState("running", ago(60), now), "held");
});
test("running job silent over 2 minutes is stale", () => {
  assert.equal(miningLeaseState("running", ago(121), now), "stale");
});
test("a two-minute running lease is still held", () => {
  assert.equal(miningLeaseState("running", ago(120), now), "held");
});
test("open app polling interval is eight seconds", () => {
  assert.equal(MINING_POLL_MS, 8000);
});
test("queued job is free", () => {
  assert.equal(miningLeaseState("queued", ago(10), now), "free");
});
