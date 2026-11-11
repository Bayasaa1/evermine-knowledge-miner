import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { activitySteps, plannedSteps } from "./chat-activity";

describe("chat activity steps", () => {
  test("lists files, link host, vault, deliverable and provider in order", () => {
    const s = activitySteps({ files: [{ name: "bal.xlsx", kind: "excel" }], links: ["https://etax.mta.mn/x"], deliverable: "table", provider: "Gemini" }, "en");
    assert.deepEqual(s, ["Read file: bal.xlsx", "Opened link: etax.mta.mn", "Checked the Mind's mined knowledge", "Calculated figures into a table", "Answered with: Gemini"]);
  });
  test("plain chat still shows the vault step and ends with writing", () => {
    assert.deepEqual(plannedSteps({ files: [], links: [], deliverable: null }, "mn"), ["Хүсэлтийг боловсруулж байна"]);
  });
});
