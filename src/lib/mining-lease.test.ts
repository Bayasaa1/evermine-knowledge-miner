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
import { test as t2, expect as e2 } from "bun:test";
t2("busy Gemini parts retry within 20 seconds", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  for (const m of ["503 high demand", "429 RESOURCE_EXHAUSTED", "Too many requests in one minute"]) {
    e2(Date.parse(qra(m, now)) - now.getTime()).toBe(20_000);
  }
});
t2("daily quota still waits for the reset", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  e2(Date.parse(qra("Your free Gemini daily quota is used up", now)) - now.getTime()).toBeGreaterThan(60_000);
});
t2("cascade order after a congested model", () => {
  e2(geminiCascadeAfter("gemini-2.5-flash")).toEqual(["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"]);
  e2(isGeminiCongestionError(503)).toBe(true);
  e2(isGeminiCongestionError(400, "bad request")).toBe(false);
});
