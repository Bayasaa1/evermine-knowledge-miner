import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { participantId, shareUrl } from "./share-content";

describe("content sharing rules", () => {
  it("videos are cards, never new AI participants", () => {
    assert.equal(participantId({ kind: "video", id: "clip", title: "Clip", url: "https://youtube.com", mindId: "persona:cts" }), null);
  });
  it("projects and personas keep their actual Mind identity", () => {
    assert.equal(participantId({ kind: "project", id: "abc", title: "Project", url: "/" }), "project:abc");
    assert.equal(participantId({ kind: "mind", id: "abc", title: "CTS", url: "/", mindId: "persona:cts" }), "persona:cts");
  });
  it("shared card links reject executable protocols", () => {
    assert.equal(shareUrl("javascript:alert(1)"), "");
    assert.equal(shareUrl("https://ever-mind.dev/search?q=CTS"), "https://ever-mind.dev/search?q=CTS");
  });
});