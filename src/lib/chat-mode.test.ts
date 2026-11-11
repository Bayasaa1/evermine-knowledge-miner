import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { effectiveMode, modeRule } from "./chat-mode";

describe("chat dual mode", () => {
  test("auto-pilot has no daily limit", () => {
    const r = effectiveMode("auto", { day: "2026-11-11", count: 500 }, "2026-11-11");
    assert.equal(r.mode, "auto"); assert.equal(r.capped, false);
  });
  test("mode rule only applies to file/link jobs", () => {
    assert.equal(modeRule("manual", null), "");
    assert.match(modeRule("manual", "table"), /continue/);
    assert.match(modeRule("auto", "table"), /AUTO-PILOT/);
  });
});
