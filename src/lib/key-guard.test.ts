import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { guardsFromBackground } from "./user-ai.server";

describe("mining never borrows live keys", () => {
  it("mining cannot use chat, assistant or translation keys", () => {
    for (const live of ["chat", "assistant", "translate"]) assert.equal(guardsFromBackground("mine", live), true);
  });
  it("chat may still use spare mining keys", () => {
    assert.equal(guardsFromBackground("chat", "mine"), false);
  });
});
