import { it } from "node:test";
import assert from "node:assert/strict";
import { budgetSections, SYSTEM_CONTEXT_CHARS } from "./chat-context-budget";
it("bounds the system prompt while retaining prioritized rules and focused facts", () => {
  const prompt = budgetSections(["Language rules", "Focused child facts", "x".repeat(50000)]);
  assert.equal(prompt.length, SYSTEM_CONTEXT_CHARS);
  assert.ok(prompt.includes("Language rules"));
  assert.ok(prompt.includes("Focused child facts"));
});