import { test } from "bun:test";
import assert from "node:assert/strict";
import { splitIntoChunks } from "./chunking";

test("a 1-second last part joins the previous part (Gemini rejects tiny clips)", () => {
  const parts = splitIntoChunks(3301);
  assert.equal(parts.length, 11);
  assert.equal(parts.at(-1)!.end, 3301);
});

test("a 29-second tail is merged, a 30-second tail stays its own part", () => {
  assert.equal(splitIntoChunks(629).length, 2);
  assert.equal(splitIntoChunks(630).length, 3);
});
