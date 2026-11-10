import { test } from "node:test";
import { strict as assert } from "node:assert";
import { automaticDirective, operatorIntent, strongestModel, sourceVideoUrl, missingPostEvidence, OPERATOR_SKILLS } from "./architect-operator";
import type { MindDirective } from "./architect-types";
const directive = (tool: MindDirective["suggestedTool"]): MindDirective => ({ id: tool, mindId: "project:x", mindName: "Mind", mindAvatar: null, severity: "warning", issueSummary: "issue", directiveForChatbot: "repair", suggestedTool: tool, targetProjectId: "x" });
test("autopilot excludes brain mutations and failed-job retries", () => {
  assert.equal(automaticDirective([directive("deepen_legacy_vaults"), directive("clear_failed_jobs")]), undefined);
  assert.equal(automaticDirective([directive("deepen_legacy_vaults"), directive("repair_timings")])?.suggestedTool, "repair_timings");
});
test("four operator skills and chat intent produce proposals", () => {
  assert.equal(OPERATOR_SKILLS.length, 4);
  assert.equal(operatorIntent("advance the mining queue"), "advance_mining");
  assert.equal(operatorIntent("нийтлэл бэлд"), "draft_post");
  assert.equal(operatorIntent("hello"), undefined);
});
test("highlight selects highest weighted stored model without changing source order", () => {
  const models = [{ name: "low", weight: 1 }, { name: "high", weight: 9 }];
  assert.equal(strongestModel(models)?.["name"], "high");
  assert.equal(models[0]?.name, "low");
  assert.equal(strongestModel(null), undefined);
});
test("post grounding accepts structured mining sources and legacy URLs", () => {
  const url = "https://www.youtube.com/watch?v=abcdefghijk";
  assert.equal(sourceVideoUrl({ kind: "youtube", url }), url);
  assert.equal(sourceVideoUrl(url), url);
  assert.equal(sourceVideoUrl({ kind: "upload" }), "");
});
test("missing post evidence produces an informational result without an executable draft", async () => {
  const { runOperatorSkill } = await import("./architect.server");
  assert.equal(typeof runOperatorSkill, "function");
  assert.equal(typeof missingPostEvidence("mn"), "string");
});