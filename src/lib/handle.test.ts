import { describe, expect, it } from "vitest";
import { cleanHandle, isBrokenHandle, looksLikeSummaryTitle } from "./handle";

describe("handles", () => {
  it("never exceeds 24 chars and drops punctuation", () => {
    const h = cleanHandle("Европт сурахад racism || монголчууд");
    expect(h.length).toBeLessThanOrEqual(25);
    expect(h).not.toMatch(/[|,\s]/);
  });
  it("flags title-made handles", () => {
    expect(isBrokenHandle("@thecreatorintroduceshisfirstvlogseries,explaininghis")).toBe(true);
    expect(isBrokenHandle("@gremix")).toBe(false);
  });
  it("flags summary titles but not real titles", () => {
    expect(looksLikeSummaryTitle("The creator recounts an eventful and clumsy day trying to vl")).toBe(true);
    expect(looksLikeSummaryTitle("Joe Rogan Experience #1470 - Elon Musk")).toBe(false);
  });
});
