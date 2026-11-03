import { test } from "node:test";
import assert from "node:assert/strict";
import { fuseVisualAndTranscriptBrain, synthesizeCoreBrain } from "./project-mind.server";

test("fusion preserves all 12 embodied primitives and screen items", () => {
  const result = { transcript: [{ speech: "Let the pan do the work.", timestamp: "00:37" }], screenItems: Array.from({ length: 12 }, (_, i) => ({ title: `Step ${i}`, timestamp: "00:37", embodied: { precondition: "Hot pan", action_primitive: `Sear ${i}`, postcondition: "Brown crust" } })) };
  const before = structuredClone(result);
  const layer = fuseVisualAndTranscriptBrain(result);
  assert.deepEqual(result, before);
  const brain = synthesizeCoreBrain([{ deep: layer }]);
  assert.equal(brain.decision_playbooks.length, 12);
  assert.equal(brain.signature_quotes_and_stories[0]?.quote, "Let the pan do the work.");
});
test("fusion does not fabricate mental models from absent evidence", () => {
  assert.equal(fuseVisualAndTranscriptBrain({}), null);
  const layer = fuseVisualAndTranscriptBrain({ transcript: [{ speech: "This is the exact saved sentence." }] });
  assert.deepEqual(layer?.["mentalModels"], []);
});