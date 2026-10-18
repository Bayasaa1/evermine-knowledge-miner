import { describe, expect, it } from "bun:test";
import { automaticRepliesAllowed, pendingQuestions, transcriptForQuestion } from "./room-turns";
describe("moderator turns", () => {
  it("never automatically replies in moderator mode", () => {
    expect(automaticRepliesAllowed(true)).toBe(false);
    expect(automaticRepliesAllowed(false)).toBe(true);
  });
  it("queues only pending human messages in their saved order", () => {
    expect(pendingQuestions([
      { id: "1", sender_kind: "user", moderator_pending: true },
      { id: "2", sender_kind: "mind", moderator_pending: true },
      { id: "3", sender_kind: "user", moderator_pending: false },
      { id: "4", sender_kind: "user", moderator_pending: true },
    ]).map((m) => m.id)).toEqual(["1", "4"]);
  });
  it("keeps earlier history and debate replies without answering the next queued question", () => {
    const messages = [
      { id: "past", sender_kind: "user" }, { id: "current", sender_kind: "user" },
      { id: "next", sender_kind: "user" }, { id: "reply", sender_kind: "mind", reply_to_id: "current" },
    ];
    expect(transcriptForQuestion(messages, "current").map((m) => m.id)).toEqual(["past", "current", "reply"]);
  });
});