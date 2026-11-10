import { test } from "node:test";
import assert from "node:assert/strict";
import { generateMindDirectives, normalizeMindRoster, stalledJob, updateMindRoster } from "./mind-directives";
const id = "project:12345678-1234-1234-1234-123456789abc";
const health = { mindId: id, mindName: "Teacher", mindAvatar: null, projectId: "12345678-1234-1234-1234-123456789abc", stalled: 0, failed: 0, shallow: 0, timing: 0, missing: 0 };
test("Mind roster attaches without duplicates and removes only selected Mind", () => {
  assert.deepEqual(updateMindRoster([id], id, true), [id]);
  assert.deepEqual(updateMindRoster([id, "persona:x"], id, false), ["persona:x"]);
});
test("roster rejects malformed IDs before owner resolution", () => {
  assert.deepEqual(normalizeMindRoster([id, id, "project:other", 5]), [id]);
});
test("stalled mining creates a critical project-targeted resume directive", () => {
  const d = generateMindDirectives({ ...health, stalled: 1 })[0];
  assert.equal(d?.suggestedTool, "resume_mining"); assert.equal(d?.severity, "critical"); assert.equal(d?.targetProjectId, health.projectId);
});
test("shallow vault creates enhance directive without requiring AI", () => {
  assert.equal(generateMindDirectives({ ...health, shallow: 1 })[0]?.suggestedTool, "deepen_legacy_vaults");
});
test("failed jobs are requeued rather than deleted; timing and missing chunks request repair", () => {
  assert.deepEqual(generateMindDirectives({ ...health, failed: 2, timing: 1, missing: 1 }).map((d) => d.suggestedTool), ["clear_failed_jobs", "repair_timings", "repair_timings"]);
});
test("healthy Mind produces no directive", () => assert.deepEqual(generateMindDirectives(health), []));
test("slow mining is not stalled until existing six-minute lease expires", () => {
  const now = Date.parse("2026-11-10T05:45:00Z");
  assert.equal(stalledJob("running", new Date(now - 300_000).toISOString(), now), false);
  assert.equal(stalledJob("running", new Date(now - 361_000).toISOString(), now), true);
});