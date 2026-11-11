import { test } from "node:test";
import assert from "node:assert/strict";
import { architectStateKey, mergeArchitectState, normalizeArchitectState } from "./architect-state";
const mind = "project:12345678-1234-1234-1234-123456789abc";
test("selection and roster share state without overwriting one another", () => {
  const initial = normalizeArchitectState({ operatorId: "elon-musk", rosterIds: [mind] });
  assert.deepEqual(mergeArchitectState(initial, { operatorId: "gordon-ramsay" }), { operatorId: "builtin:ramsay", rosterIds: [mind] });
  assert.deepEqual(mergeArchitectState(initial, { rosterIds: [] }), { operatorId: "builtin:musk", rosterIds: [] });
});
test("shared storage remains account scoped", () => {
  assert.notEqual(architectStateKey("owner-a"), architectStateKey("owner-b"));
});
test("rosters have no app-imposed ten-Mind cap", () => {
  const rosterIds = Array.from({ length: 25 }, (_, i) => `project:${String(i).padStart(8, "0")}-1234-1234-1234-123456789abc`);
  assert.equal(normalizeArchitectState({ rosterIds }).rosterIds.length, 25);
});