import { describe, expect, it } from "bun:test";
import { detectChatCommand, redactKeys, smartSplitPlan } from "./chat-commands";

const gem = "AIza" + "B".repeat(35);
describe("chat commands", () => {
  it("detects a Gemini key and masks it", () => {
    const c = detectChatCommand(`my key ${gem}`);
    expect(c?.kind).toBe("api_key");
    expect(redactKeys(`k ${gem}`)).not.toContain(gem);
  });
  it("detects YouTube links", () => {
    expect(detectChatCommand("mine https://youtu.be/abcdefghijk please")).toEqual({ kind: "youtube", urls: ["https://youtu.be/abcdefghijk"] });
  });
  it("detects remine all in Mongolian", () => {
    expect(detectChatCommand("Бүх бичлэгээ дахин олборло")?.kind).toBe("remine_all");
  });
  it("reads creator mining rules", () => {
    expect(detectChatCommand("mining rules: focus on formulas")).toEqual({ kind: "mining_rules", rules: "focus on formulas" });
  });
  it("smart split keeps background jobs off live keys", () => {
    const plan = new Map(smartSplitPlan(["a", "b", "c", "d", "e"]));
    expect(plan.get("chat")).toEqual(["a"]);
    expect(plan.get("mine")).toEqual(["d", "e"]);
    expect(smartSplitPlan(["a"])).toBeNull();
  });
});
