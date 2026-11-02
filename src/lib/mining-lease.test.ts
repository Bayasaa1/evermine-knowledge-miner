import { test } from "node:test";
import assert from "node:assert/strict";
import { miningLeaseState, MINING_POLL_MS } from "./mining-jobs";

const now = Date.parse("2026-10-28T09:00:00Z");
const ago = (s: number) => new Date(now - s * 1000).toISOString();

test("running job updated under 90s ago is held", () => {
  assert.equal(miningLeaseState("running", ago(60), now), "held");
});
test("running job silent over 75 seconds is stale", () => {
  assert.equal(miningLeaseState("running", ago(76), now), "stale");
});
test("a 75-second running lease is still held", () => {
  assert.equal(miningLeaseState("running", ago(75), now), "held");
});
test("open app polling interval is eight seconds", () => {
  assert.equal(MINING_POLL_MS, 8000);
});
test("queued job is free", () => {
  assert.equal(miningLeaseState("queued", ago(10), now), "free");
});

import { quotaRetryAfter as qra } from "./mining-jobs";
import { geminiCascadeAfter, isGeminiCongestionError } from "./gemini-models";
test("busy Gemini parts retry within 20 seconds", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  for (const m of ["503 high demand", "429 RESOURCE_EXHAUSTED", "Too many requests in one minute"]) {
    assert.equal(Date.parse(qra(m, now)) - now.getTime(), 20_000);
  }
});
test("daily quota still waits for the reset", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.ok(Date.parse(qra("Your free Gemini daily quota is used up", now)) - now.getTime() > 60_000);
});
test("cascade order after a congested model", () => {
  assert.deepEqual(geminiCascadeAfter("gemini-2.5-flash"), ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"]);
  assert.equal(isGeminiCongestionError(503), true);
  assert.equal(isGeminiCongestionError(400, "bad request"), false);
});
