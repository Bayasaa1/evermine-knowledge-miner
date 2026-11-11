import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { effectiveMode, modeRule } from "./chat-mode";

describe("chat dual mode", () => {
  test("auto-pilot falls back to manual after 20 runs today", () => {
    assert.equal(effectiveMode("auto", { day: "2026-11-11", count: 19 }, "2026-11-11").mode, "auto");
    const r = effectiveMode("auto", { day: "2026-11-11", count: 20 }, "2026-11-11");
    assert.equal(r.mode, "manual"); assert.equal(r.capped, true);
  });
  test("new day resets the cap", () => {
    assert.equal(effectiveMode("auto", { day: "2026-11-10", count: 20 }, "2026-11-11").mode, "auto");
  });
  test("mode rule only applies to file/link jobs", () => {
    assert.equal(modeRule("manual", null), "");
    assert.match(modeRule("manual", "table"), /continue/);
    assert.match(modeRule("auto", "table"), /AUTO-PILOT/);
  });
});
