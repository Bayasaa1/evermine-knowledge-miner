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

const emptyRaw = {
  summary: "Evidenced summary", readMeFirst: "", keywords: [], chapters: [], mistakes: [],
  prerequisites: [], guidelines: [], architecturalDecisions: [], mentalModels: [], troubleshooting: [], milestones: [],
  gotchas: [], recommendations: [], capabilities: [], limits: [],
};

test("typography and whitespace differences retain evidence without changing source quotes", () => {
  const quote = "Use 'raw bytes' before parsing.";
  const result = groundedOutline({ ...emptyRaw, gotchas: [{ text: "Preserve raw bytes", quote }] },
    { journal: ["Use ‘raw bytes’\n before parsing."] }, "Video");
  assert.equal(result.gotchas.length, 1);
  assert.equal(result.evidence.gotchas[0]?.quote, quote);
});

test("paraphrases and quotes spanning unrelated source values are rejected and counted", () => {
  const result = groundedOutline({ ...emptyRaw, gotchas: [
    { text: "Invented inference", quote: "Always read original bytes" },
    { text: "Joined unrelated entries", quote: "first evidence second evidence" },
  ] }, { journal: ["Read the raw body bytes", "first evidence", "second evidence"] }, "Video");
  assert.equal(result.gotchas.length, 0);
  assert.equal(result.validation.evidenceAudit["gotchas"]?.rejected, 2);
});

test("absent categories stay empty and input traversal is not semantic completeness", () => {
  const result = groundedOutline(emptyRaw, { journal: ["No explicit errors reported"] }, "Video");
  assert.deepEqual(result.mistakes, []);
  assert.deepEqual(result.gotchas, []);
  assert.equal(result.validation.semanticCompletenessVerified, false);
  assert.equal(result.validation.sourceStringCount, 1);
});