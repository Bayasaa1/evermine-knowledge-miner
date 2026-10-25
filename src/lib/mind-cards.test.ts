import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCardPatches, listCards, moveCard, removeCard, setCardField } from "./mind-json";

const base = {
  source: "https://www.youtube.com/watch?v=abcdefghijk",
  result: {
    knowledgeNodes: [{ concept_title: "Grip", detailed_explanation: "Hold it", confidence_score: 0.5, timestamp_start: "01:25" }],
    screenItems: [
      { timestamp: "0:10", steps: [], embodied: { precondition: "a", action_primitive: "grab", target_object: "cup", postcondition: "held", hazard_or_recovery: "" } },
      { timestamp: "0:20", steps: [], embodied: { precondition: "b", action_primitive: "lift", target_object: "cup", postcondition: "up", hazard_or_recovery: "slow" } },
    ],
    gaming: { decisions: [{ situation: "low hp", action: "retreat", why: "" }] },
  },
};

test("hints flag low confidence and missing recovery", () => {
  const cards = listCards(base);
  assert.deepEqual(cards.find((c) => c.id === "claim:0")?.hints, ["lowConfidence"]);
  assert.deepEqual(cards.find((c) => c.id === "step:0")?.hints, ["noRecovery"]);
  assert.deepEqual(cards.find((c) => c.id === "rule:0")?.hints, ["noWhy"]);
});

test("moving a step swaps content but keeps each video time", () => {
  const moved = moveCard(base, "step:0", 1);
  const items = (moved.result as any).screenItems;
  assert.equal(items[0].embodied.action_primitive, "lift");
  assert.equal(items[0].timestamp, "0:10");
});

test("AI patches only touch real cards and fields", () => {
  const { payload, applied } = applyCardPatches(base, [
    { id: "step:0", field: "hazard_or_recovery", value: "regrip at 45 degrees" },
    { id: "step:9", field: "precondition", value: "x" },
    { id: "claim:0", field: "confidence_score", value: "1" },
  ]);
  assert.equal(applied, 1);
  assert.equal((payload.result as any).screenItems[0].embodied.hazard_or_recovery, "regrip at 45 degrees");
});

test("edit and delete leave other data untouched", () => {
  const edited = setCardField(base, "claim:0", "title", "Firm grip");
  assert.equal((edited.result as any).knowledgeNodes[0].concept_title, "Firm grip");
  assert.equal((edited.result as any).screenItems, base.result.screenItems);
  const removed = removeCard(base, "rule:0");
  assert.equal((removed.result as any).gaming.decisions.length, 0);
});
