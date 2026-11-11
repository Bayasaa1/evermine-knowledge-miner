import { test } from "node:test";
import { strict as assert } from "node:assert";
import { automaticDirective, operatorIntent, strongestModel, sourceVideoUrl, missingPostResult, OPERATOR_SKILLS } from "./architect-operator";
import type { MindDirective } from "./architect-types";
const directive = (tool: MindDirective["suggestedTool"]): MindDirective => ({ id: tool, mindId: "project:x", mindName: "Mind", mindAvatar: null, severity: "warning", issueSummary: "issue", directiveForChatbot: "repair", suggestedTool: tool, targetProjectId: "x" });
test("autopilot excludes brain mutations and failed-job retries", () => {
  assert.equal(automaticDirective([directive("deepen_legacy_vaults"), directive("clear_failed_jobs")]), undefined);
  assert.equal(automaticDirective([directive("deepen_legacy_vaults"), directive("repair_timings")]), undefined);
  assert.equal(automaticDirective([directive("repair_timings"), directive("resume_mining")])?.suggestedTool, "resume_mining");
});
test("four operator skills and chat intent produce proposals", () => {
  assert.equal(OPERATOR_SKILLS.length, 5);
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
test("missing post evidence produces an informational result without an executable draft", () => {
  const result = missingPostResult("mn");
  assert.deepEqual(result.actions_taken, []);
  assert.equal(result.operator, undefined);
  assert.deepEqual(result.interactive_cards, []);
});import { autopilotAllowance, toneGuard, teamBriefing, AUTOPILOT_DAILY_CAP } from "./architect-operator";
test("auto-pilot has no daily repair limit", () => {
  assert.equal(autopilotAllowance({ day: "2026-11-10", count: 500 }, "2026-11-10").allowed, true);
});
test("tone guard masks profanity before public posts", () => {
  assert.equal(toneGuard("This steak is fucking raw").flagged, 1);
  assert.equal(toneGuard("This steak is perfectly seared").flagged, 0);
  assert.equal(toneGuard("Ямар новш вэ").flagged, 1);
});
test("team briefing groups issues by Mind", () => {
  const text = teamBriefing([{ mindName: "Ramsay", severity: "warning", issueSummary: "stalled" }, { mindName: "Ramsay", severity: "enhance", issueSummary: "shallow" }], "en");
  assert.ok(text.includes("• Ramsay") && text.includes("stalled") && text.includes("shallow"));
});
