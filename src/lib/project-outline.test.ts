import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildVideoOutline, mergeProjectOutline, normalizeLessons, outlinePromptBlock } from "./project-outline";

describe("project outline", () => {
  test("mistakes without a fix are dropped", () => {
    const l = normalizeLessons({ mistakes: [{ mistake: "wrong loop", fix: "" }, { mistake: "off by one", fix: "use <" }] });
    assert.deepEqual(l.mistakes.map((m) => m.mistake), ["off by one"]);
  });
  test("re-mining a video replaces its entry and keywords", () => {
    const a = mergeProjectOutline(null, "v1", buildVideoOutline({ title: "A", tags: ["Lexer"] }));
    const b = mergeProjectOutline(a.outline, "v1", buildVideoOutline({ title: "A", tags: ["Parser"] }));
    assert.deepEqual(b.keywords, ["parser"]);
    assert.deepEqual(Object.keys(b.outline.videos), ["v1"]);
  });
  test("chat block always carries the fix, never only the mistake", () => {
    const { outline } = mergeProjectOutline(null, "v1", buildVideoOutline({
      title: "A",
      lessons: normalizeLessons({ mistakes: [{ mistake: "free twice", fix: "set pointer to NULL" }] }),
    }));
    const block = outlinePromptBlock(outline, "free");
    assert.ok(block.includes("Fix: set pointer to NULL"));
  });
});
