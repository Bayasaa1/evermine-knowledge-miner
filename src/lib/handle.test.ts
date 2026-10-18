import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanHandle, isBrokenHandle, looksLikeSummaryTitle } from "./handle";

describe("handles", () => {
  it("never exceeds 24 chars and drops punctuation", () => {
    const h = cleanHandle("Европт сурахад racism || монголчууд");
    assert.ok(h.length <= 25);
    assert.doesNotMatch(h, /[|,\s]/);
  });
  it("flags title-made handles", () => {
    assert.equal(isBrokenHandle("@thecreatorintroduceshisfirstvlogseries,explaininghis"), true);
    assert.equal(isBrokenHandle("@gremix"), false);
  });
  it("flags summary titles but not real titles", () => {
    assert.equal(looksLikeSummaryTitle("The creator recounts an eventful and clumsy day trying to vl"), true);
    assert.equal(looksLikeSummaryTitle("Joe Rogan Experience #1470 - Elon Musk"), false);
  });
});
