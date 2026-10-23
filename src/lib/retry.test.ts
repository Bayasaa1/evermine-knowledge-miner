import { test } from "node:test";
import assert from "node:assert/strict";
import { httpStatusOf, isServerBusyStatus, withBackoff } from "./retry";

test("5xx counts as busy; 400/404/429 do not", () => {
  for (const s of [500, 502, 503, 504]) assert.equal(isServerBusyStatus(s), true);
  for (const s of [400, 404, 429]) assert.equal(isServerBusyStatus(s), false);
});

test("status is read from message", () => {
  assert.equal(httpStatusOf(new Error("HTTP 503 — busy")), 503);
});

test("retries the same call on 503, not on 404", async () => {
  let n = 0;
  const ok = await withBackoff(async () => { if (++n < 3) throw new Error("HTTP 503"); return "ok"; }, (e) => isServerBusyStatus(httpStatusOf(e)), { baseMs: 1 });
  assert.equal(ok, "ok"); assert.equal(n, 3);
  let m = 0;
  await assert.rejects(withBackoff(async () => { m++; throw new Error("HTTP 404"); }, (e) => isServerBusyStatus(httpStatusOf(e)), { baseMs: 1 }));
  assert.equal(m, 1);
});
