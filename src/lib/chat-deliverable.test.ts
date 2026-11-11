import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { addressedSheet, columnLetter, deliverableRule, detectDeliverable, replyBudget } from "./chat-deliverable";

const file = "\n\n[[file:bal.xlsx|excel]]\nrow,A\n1,Cash\n[[/file]]";

describe("chat deliverables", () => {
  test("no file means plain chat", () => {
    assert.equal(detectDeliverable("fill the tax form"), null);
    assert.equal(replyBudget(null), 400);
  });
  test("tax form job with a file gives a field map", () => {
    assert.equal(detectDeliverable("Татварын маягтыг бөглө" + file), "fieldmap");
    assert.match(deliverableRule("fieldmap"), /Field \/ cell/);
  });
  test("words inside the file do not trigger a job", () => {
    assert.equal(detectDeliverable("what do you think?\n\n[[file:a.pdf|pdf]]\ntax audit risk table\n[[/file]]"), null);
  });
  test("deliverables get a bigger reply budget", () => {
    assert.equal(replyBudget("table"), 1800);
  });
  test("column letters and addressed rows", () => {
    assert.equal(columnLetter(0), "A");
    assert.equal(columnLetter(26), "AA");
    assert.equal(addressedSheet([["Cash", 100], [], ["Debt", "1,5"]]), 'row,A,B\n1,Cash,100\n3,Debt,"1,5"');
  });
});
