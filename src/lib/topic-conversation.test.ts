import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conversationProgress, topicSuggestions, type ConversationTurn } from "./topic-conversation";

const turns: ConversationTurn[] = [
  { role: "user", text: "Let's start with Space." }, { role: "agent", text: "It matters to me." },
  { role: "user", text: "Why?" }, { role: "agent", text: "Here is my reason." },
];
describe("per-topic progression", () => {
  it("opens every untouched topic instead of starting with interview fragments", () => {
    const result = topicSuggestions({ turns: [], topics: ["Space", "Energy"], lang: "mn" });
    assert.deepEqual(result.filter((s) => s.topic).map((s) => [s.topic, s.stage]), [["Space", "opening"], ["Energy", "opening"]]);
  });
  it("develops after an answered opening, not an unanswered user message", () => {
    assert.equal(conversationProgress(turns.slice(0, 1), ["Space"]).stage, "opening");
    assert.equal(conversationProgress(turns.slice(0, 2), ["Space"]).stage, "development");
  });
  it("keeps developing a topic for at least 3 answers before concluding", () => {
    assert.equal(conversationProgress(turns, ["Space"]).stage, "development");
    const more: ConversationTurn[] = [...turns, { role: "user", text: "More?" }, { role: "agent", text: "Yes." }];
    assert.equal(conversationProgress(more, ["Space"]).stage, "conclusion");
  });
  it("stays inside the branch while developing and digs into its sub-branches", () => {
    const out = topicSuggestions({ turns, topics: ["Space", "Energy"], lang: "en", branches: { Space: ["Starship"] } });
    assert.ok(out.every((s) => s.topic === "Space"));
    assert.ok(out[0]?.text.includes("Starship"));
  });
  it("uses separately translated topic names and still recognises them", () => {
    const labels = { "Strategic communication": "Стратегийн харилцаа холбоо" };
    const out = topicSuggestions({ turns: [], topics: ["Strategic communication"], lang: "mn", labels });
    const opening = out.find((s) => s.topic);
    assert.ok(opening && !/Strategic/.test(opening.text));
    assert.equal(conversationProgress([{ role: "user", text: opening.text }, { role: "agent", text: "A" }], ["Strategic communication"], undefined, labels).topic, "Strategic communication");
  });
  it("starts a different topic at its own beginning", () => {
    const changed: ConversationTurn[] = [...turns, { role: "user", text: "Let's talk about Energy." }];
    assert.deepEqual(conversationProgress(changed, ["Space", "Energy"]), { topic: "Energy", stage: "opening", fromIndex: 4, completed: 0 });
  });
  it("does not count unrelated saved history for a selected Root branch", () => {
    assert.equal(conversationProgress(turns, ["Energy"], { title: "Energy", fromIndex: turns.length }).stage, "opening");
  });
  it("recognizes topic mentions in English, Mongolian and Korean", () => {
    for (const lang of ["en", "mn", "ko"]) {
      const opening = topicSuggestions({ turns: [], topics: ["Space"], lang }).find((s) => s.topic);
      assert.ok(opening);
      assert.equal(conversationProgress([{ role: "user", text: opening.text }, { role: "agent", text: "Answer" }], ["Space"]).topic, "Space");
    }
  });
  it("keeps the source conversation untouched", () => {
    const before = JSON.stringify(turns);
    topicSuggestions({ turns, topics: ["Space"], lang: "mn" });
    assert.equal(JSON.stringify(turns), before);
  });
});