import { describe, expect, test } from "bun:test";
import { guardsFromBackground } from "./user-ai.server";

describe("mining never borrows live keys", () => {
  test("mining cannot use chat, assistant or translation keys", () => {
    for (const live of ["chat", "assistant", "translate"]) expect(guardsFromBackground("mine", live)).toBe(true);
  });
  test("chat may still use spare mining keys", () => {
    expect(guardsFromBackground("chat", "mine")).toBe(false);
  });
});
