import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMasterPrompt, buildStandaloneMindHtml, downloadOllamaModelfile, downloadStandaloneMindHtmlApp, copyMindAsMasterPrompt } from "./mind-json";

const data = { result: { knowledgeNodes: [{ concept_title: "Sear first", detailed_explanation: "Hot pan", creator_quote: "Get it hot!" }], gaming: { decisions: [{ situation: "low hp", action: "retreat", why: "survive" }] } } };

test("locked Minds export nothing", async () => {
  assert.equal(downloadStandaloneMindHtmlApp({ name: "X", data, allowed: false }), false);
  assert.equal(downloadOllamaModelfile({ name: "X", data, allowed: false }), false);
  assert.equal(await copyMindAsMasterPrompt({ name: "X", data, allowed: false }), false);
});

test("master prompt carries models, quotes and rules", () => {
  const p = buildMasterPrompt("Chef", data);
  assert.match(p, /Sear first/);
  assert.match(p, /> Get it hot!/);
  assert.match(p, /If low hp → retreat \(because survive\)/);
});

test("html app cannot be broken out of by Mind text", () => {
  const h = buildStandaloneMindHtml("A", { result: { knowledgeNodes: [{ concept_title: "</script><b>", detailed_explanation: "x" }] } });
  assert.equal(h.split("</script>").length, 2);
});
