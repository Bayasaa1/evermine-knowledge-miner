import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractCodeBlocks, mergeProjectFiles, previewHtml, previewable, relayNote, squadOrder, squadReplies } from "./web-build";

describe("squad web build", () => {
  test("squad runs UX -> UI -> Backend -> Frontend -> QA", () => {
    const names = ["Web Quality Engineer", "Frontend Architect", "UX Strategist", "Backend Architect", "UI Designer"].map((mind_name) => ({ mind_name }));
    assert.deepEqual(squadOrder(names).map((m) => m.mind_name), ["UX Strategist", "UI Designer", "Backend Architect", "Frontend Architect", "Web Quality Engineer"]);
  });
  test("Product Lead goes first in a 6-Mind squad", () => {
    const names = ["Web Quality Engineer", "UX Strategist", "Product Lead", "Frontend Architect"].map((mind_name) => ({ mind_name }));
    assert.deepEqual(squadOrder(names).map((m) => m.mind_name), ["Product Lead", "UX Strategist", "Frontend Architect", "Web Quality Engineer"]);
    assert.match(relayNote("Product Lead", 1, 6), /user stories/);
  });
  test("last step must ship final code", () => {
    assert.match(relayNote("Web Quality Engineer", 5, 5), /LAST step/);
    assert.doesNotMatch(relayNote("UX Strategist", 1, 5), /LAST step/);
  });
  test("code blocks become named files and an html preview", () => {
    const b = extractCodeBlocks("Here:\n```html\n<h1>Hi</h1>\n```\n```sql\ncreate table t();\n```");
    assert.deepEqual(b.map((x) => x.file), ["index.html", "schema.sql"]);
    assert.equal(previewable(b), true);
    assert.match(previewHtml(b), /cdn\.tailwindcss\.com[\s\S]*<h1>Hi<\/h1>/);
    assert.equal(previewable(extractCodeBlocks("```sql\nselect 1;\n```")), false);
  });
});

describe("multi-file squad project", () => {
  test("a stated path names the file, and later steps replace earlier versions", () => {
    const a = "```sql db/schema.sql\ncreate table a();\n```\n```tsx src/App.tsx\nexport default function App(){return null}\n```";
    const b = "```tsx file=src/App.tsx\nexport default function App(){return <h1/>}\n```";
    const files = mergeProjectFiles([a, b]);
    assert.deepEqual(files.map((f) => f.file), ["db/schema.sql", "src/App.tsx"]);
    assert.match(files[1]!.code, /<h1\/>/);
  });
  test("unsafe paths fall back to plain names", () => {
    assert.equal(extractCodeBlocks("```ts ../../etc/x.ts\nlet a=1\n```")[0]!.file, "file.ts");
  });
  test("practitioner Minds get their squad roles in order", () => {
    const names = ["ThePrimeagen", "Jack Herrington", "Hussein Nasser", "Gary Simon", "Dave Farley", "Josh Tried Coding"].map((mind_name) => ({ mind_name }));
    assert.deepEqual(squadOrder(names).map((m) => m.mind_name), ["Dave Farley", "Gary Simon", "Hussein Nasser", "Josh Tried Coding", "Jack Herrington", "ThePrimeagen"]);
  });
  test("a squad run collects only Mind replies since the last person", () => {
    const msgs = [{ sender_kind: "mind", body: "old" }, { sender_kind: "user", body: "go" }, { sender_kind: "mind", body: "a" }, { sender_kind: "mind", body: "b" }];
    assert.deepEqual(squadReplies(msgs, 3), ["a", "b"]);
  });
});
