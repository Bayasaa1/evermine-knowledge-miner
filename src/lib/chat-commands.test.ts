import { test } from "node:test";
import assert from "node:assert/strict";
import { detectChatCommand, redactKeys, smartSplitPlan } from "./chat-commands";

const gem = "AIza" + "B".repeat(35);
test("detects a Gemini key and masks it", () => {
  assert.equal(detectChatCommand(`my key ${gem}`)?.kind, "api_key");
  assert.ok(!redactKeys(`k ${gem}`).includes(gem));
});
test("detects YouTube links", () => {
  assert.deepEqual(detectChatCommand("mine https://youtu.be/abcdefghijk please"), { kind: "youtube", urls: ["https://youtu.be/abcdefghijk"] });
});
test("detects remine all in Mongolian", () => {
  assert.equal(detectChatCommand("Бүх бичлэгээ дахин олборло")?.kind, "remine_all");
});
test("reads creator mining rules", () => {
  assert.deepEqual(detectChatCommand("mining rules: focus on formulas"), { kind: "mining_rules", rules: "focus on formulas" });
});
test("smart split keeps background jobs off live keys", () => {
  const plan = new Map(smartSplitPlan(["a", "b", "c", "d", "e"]));
  assert.deepEqual(plan.get("chat"), ["a"]);
  assert.deepEqual(plan.get("mine"), ["d", "e"]);
  assert.equal(smartSplitPlan(["a"]), null);
});
