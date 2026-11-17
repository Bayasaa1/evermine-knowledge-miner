import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractCodeBlocks, previewHtml, previewable, relayNote, squadOrder } from "./web-build";

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
