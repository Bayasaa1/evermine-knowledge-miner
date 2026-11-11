import { test } from "node:test";
import assert from "node:assert/strict";
import { activeMention, rankMentions, insertMention } from "./mind-mention";

const many = Array.from({ length: 1000 }, (_, i) => ({ mindId: `project:${i}`, name: `Project ${i}`, kind: "project" as const }));
const all = [...many, { mindId: "persona:d", name: "Aswath Damodaran", kind: "persona" as const }];

test("@dam finds Damodaran among 1000 projects", () => {
  assert.equal(rankMentions(all, "dam")[0]?.name, "Aswath Damodaran");
});
test("results are capped at 8", () => {
  assert.equal(rankMentions(all, "project").length, 8);
});
test("empty query puts recent Minds first", () => {
  assert.equal(rankMentions(all, "", ["persona:d"])[0]?.mindId, "persona:d");
});
test("@ inside an email is not a mention", () => {
  assert.equal(activeMention("mail a@b", 8), null);
  assert.deepEqual(activeMention("hi @da", 6), { start: 3, query: "da", trigger: "@" });
});
test("insert replaces the typed query", () => {
  assert.equal(insertMention("hi @da x", 3, 6, "Aswath Damodaran").text, "hi @Aswath Damodaran  x");
});

test("# targets projects, @ targets people", () => {
  assert.deepEqual(activeMention("hi #dam", 7), { start: 3, query: "dam", trigger: "#" });
  assert.deepEqual(activeMention("hi @bat", 7), { start: 3, query: "bat", trigger: "@" });
  assert.equal(insertMention("hi #da", 3, 6, "Finance", "#").text, "hi #Finance ");
});

test("preset aliases in mention results normalize before server lookup", () => {
  assert.equal(rankMentions([{ mindId: "elon-musk", name: "Elon Musk", kind: "persona" }], "elon-musk")[0]?.mindId, "builtin:musk");
});
