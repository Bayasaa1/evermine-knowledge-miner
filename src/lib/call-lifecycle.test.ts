import { it } from "node:test";
import assert from "node:assert/strict";
import { createCallLifecycle } from "./call-lifecycle";

it("stops every late permission track when the call ended", () => {
  const lifecycle = createCallLifecycle();
  const token = lifecycle.begin();
  lifecycle.invalidate();
  let stopped = 0;
  assert.equal(lifecycle.accept(token, { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] }), false);
  assert.equal(stopped, 2);
});
it("rejects late permission results after unmount and does not revive them on remount", () => {
  const lifecycle = createCallLifecycle();
  const token = lifecycle.begin();
  lifecycle.unmount();
  lifecycle.mount();
  let stopped = false;
  assert.equal(lifecycle.accept(token, { getTracks: () => [{ stop: () => { stopped = true; } }] }), false);
  assert.equal(stopped, true);
  assert.equal(lifecycle.current(lifecycle.begin()), true);
});