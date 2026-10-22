import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recallBranch, type RecallTopic } from "./topic-recall";
const fact = (text: string) => ({ text, ts: "02:34", videoId: "abcdefghijk" });
const topics: RecallTopic[] = [
  { id: "boring", title: "The Boring Company", group: "Business", summary: "company", facts: [fact("The company digs tunnels.")] },
  { id: "ai", title: "Artificial Intelligence", group: "Technology", summary: "", facts: Array.from({ length: 40 }, (_, i) => fact(`General intelligence record ${i}`)) },
  { id: "grok", title: "Grok and xAI", parentId: "ai", group: "Technology", summary: "", facts: [fact("Grok training uses curated data.")] },
  { id: "data", title: "Training Data", parentId: "grok", group: "Technology", summary: "", facts: [fact("Data quality matters more than quantity.")] },
  { id: "quality", title: "Data Quality", parentId: "data", group: "Technology", summary: "", facts: [] },
  { id: "deep", title: "Deduplication", parentId: "quality", group: "Technology", summary: "", facts: [fact("Deduplication removes repeated training examples.")] },
];
describe("branch fact recall", () => {
  it("uses at most eight topic chunks and retains the latest-query deep match", () => {
    const many: RecallTopic[] = Array.from({ length: 20 }, (_, i) => ({ id: String(i), ...(i ? { parentId: "0" } : {}), title: `Branch ${i}`, group: "Test", summary: "", facts: [fact(i === 19 ? "Deduplication concrete detail" : `record-${i}`)] }));
    const before = JSON.stringify(many);
    const result = recallBranch(many, "deduplication", [], "0", 100);
    assert.equal(result.facts.length, 8);
    assert.ok(result.facts.some((f) => f.includes("concrete detail")));
    assert.equal(JSON.stringify(many), before);
  });
  it("finds Grok inside a broader topic even when no topic is named Grok", () => {
    const broader = topics.filter((t) => t.id !== "grok").map((t) => t.id === "ai" ? { ...t, facts: [fact("Grok AI on X: integrated into the X app.")] } : t);
    const r = recallBranch(broader, "groq ursuldugch company haritsuul", []);
    assert.ok(r.titles[0]?.includes("Artificial Intelligence"));
    assert.ok(r.facts.some((f) => f.includes("integrated into the X app")));
    assert.ok(!r.facts.some((f) => f.includes("tunnels")));
  });
  it("Grok/xAI company questions never retrieve Boring Company", () => {
    const r = recallBranch(topics, "Tell me about Grok at xAI company", []);
    assert.ok(r.titles[0]?.includes("Grok and xAI")); assert.ok(r.facts.some((f) => f.includes("curated data"))); assert.ok(!r.facts.some((f) => f.includes("tunnels")));
  });
  it("selected source titles resolve translated picks and stay inside the subtree", () => {
    const r = recallBranch(topics, "Илүү дэлгэрэнгүй яриач", [], undefined, 30, "Training Data");
    assert.ok(r.facts.some((f) => f.includes("Data quality"))); assert.ok(!r.facts.some((f) => f.includes("curated data") || f.includes("tunnels")));
  });
  it("deep details survive a parent containing more than the fact budget", () => {
    const before = JSON.stringify(topics); const r = recallBranch(topics, "Explain deduplication", [], "ai", 6);
    assert.equal(r.facts.length, 6); assert.ok(r.facts.some((f) => f.includes("Deduplication removes"))); assert.ok(r.facts.some((f) => f.includes("src=abcdefghijk@02:34"))); assert.equal(JSON.stringify(topics), before);
  });
});