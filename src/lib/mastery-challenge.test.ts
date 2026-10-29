import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseChallenge, parseEvaluation, unlockedLevel, toLevel, parseVideoRef, sanitizeChallenge } from "./mastery-challenge";

describe("mastery challenge", () => {
  it("parses a generated challenge wrapped in prose", () => {
    const c = parseChallenge('Here: {"title":"Drift","scenario":"Arm drifts","task_steps":["a","b"],"pass_criteria":["x"],"source_video_ref":"[[yt:abcdefghijk@02:34]]"}', 2);
    assert.equal(c?.level, 2);
    assert.deepEqual(c?.task_steps, ["a", "b"]);
  });
  it("rejects a challenge with no steps", () => {
    assert.equal(parseChallenge('{"title":"t","scenario":"s","task_steps":[]}', 1), null);
  });
  it("downgrades a PASS scored below 80", () => {
    const e = parseEvaluation('{"verdict":"PASS","score":65,"mechanism_critique":"ok","missing_elements":[]}');
    assert.equal(e?.verdict, "REVISE");
  });
  it("derives verdict from score when missing and clamps score", () => {
    assert.equal(parseEvaluation('{"score":20,"mechanism_critique":"no"}')?.verdict, "FAIL");
    assert.equal(parseEvaluation('{"verdict":"PASS","score":140,"mechanism_critique":"y"}')?.score, 100);
  });
  it("rejects evaluation without critique", () => {
    assert.equal(parseEvaluation('{"verdict":"PASS","score":90}'), null);
  });
  it("unlocks the next level only after a pass", () => {
    assert.equal(unlockedLevel([]), 1);
    assert.equal(unlockedLevel([1]), 2);
    assert.equal(unlockedLevel([1, 2]), 3);
    assert.equal(toLevel(7), 1);
  });
  it("reads video stamps", () => {
    assert.deepEqual(parseVideoRef("[[yt:abcdefghijk@12:05]]"), { id: "abcdefghijk", start: 725 });
    assert.deepEqual(parseVideoRef("at 03:10"), { start: 190 });
  });
  it("sanitizes a client challenge", () => {
    assert.equal(sanitizeChallenge({ title: "", scenario: "s" }), null);
  });
});
