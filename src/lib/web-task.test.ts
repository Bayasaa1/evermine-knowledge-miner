import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { detectWebTask, fieldsCsv, missingValues, parseFieldMap } from "./web-task";

describe("web task", () => {
  test("needs an action word and a site", () => {
    assert.equal(detectWebTask("https://etax.mta.mn гэж юу вэ"), null);
    assert.equal(detectWebTask("энийг https://etax.mta.mn руу илгээ")?.host, "etax.mta.mn");
    assert.equal(detectWebTask("please submit this"), null);
  });
  test("parses the field map table and counts missing values", () => {
    const rows = parseFieldMap("Here.\n| Field / cell | Value | Source | Note |\n|---|---|---|---|\n| **Revenue** | 1,200 | B14 | |\n| Tax ID | ? | | missing |\n\nDone");
    assert.deepEqual(rows.map((r) => r.field), ["Revenue", "Tax ID"]);
    assert.equal(missingValues(rows), 1);
    assert.equal(fieldsCsv(rows).split("\n")[1], '"Revenue","1,200","B14"');
  });
});
