import { test } from "node:test";
import assert from "node:assert/strict";
import { groundedOutline, sourceStrings, partitionPayload } from "./project-outline-backfill";

test("partitioning sends every character of a complete saved JSON without omissions", () => {
  const json = JSON.stringify({ first: "A".repeat(900000), last: "last evidence" });
  const parts = partitionPayload(json);
  assert.equal(parts.length, 3);
  assert.equal(parts.join(""), json);
});

test("one-project backfill reads strings through the end of every nested branch", () => {
  const payload = { first: "a".repeat(500000), last: [{ nested: "final correction at end" }] };
  assert.ok(sourceStrings(payload).endsWith("final correction at end"));
});
test("author errors require verbatim evidence for both the mistake and correction", () => {
  const raw = {
    summary: "An evidenced video", readMeFirst: "Start here", keywords: ["webhook"], chapters: [],
    prerequisites: [], guidelines: [], architecturalDecisions: [], mentalModels: [], troubleshooting: [], milestones: [],
    gotchas: [], recommendations: [], capabilities: [], limits: [],
    mistakes: [
      { timestamp: "", mistake: "wrong signature", cause: "", fix: "read raw bytes", mistakeQuote: "the signature failed", fixQuote: "read the raw body bytes" },
      { timestamp: "", mistake: "invented", cause: "", fix: "invented correction", mistakeQuote: "the signature failed", fixQuote: "unmentioned correction" },
    ],
  };
  const result = groundedOutline(raw, { journal: ["the signature failed", "read the raw body bytes"] }, "Video");
  assert.deepEqual(result.mistakes.map((m) => m.fix), ["read raw bytes"]);
});