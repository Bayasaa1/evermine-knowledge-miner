import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { automaticRepliesAllowed, pendingQuestions, transcriptForQuestion } from "./room-turns";
describe("moderator turns", () => {
  it("never automatically replies in moderator mode", () => {
    assert.equal(automaticRepliesAllowed(true), false);
    assert.equal(automaticRepliesAllowed(false), true);
  });
  it("queues only pending human messages in their saved order", () => {
    assert.deepEqual(pendingQuestions([
      { id: "1", sender_kind: "user", moderator_pending: true },
      { id: "2", sender_kind: "mind", moderator_pending: true },
      { id: "3", sender_kind: "user", moderator_pending: false },
      { id: "4", sender_kind: "user", moderator_pending: true },
    ]).map((m) => m.id), ["1", "4"]);
  });
  it("keeps earlier history and debate replies without answering the next queued question", () => {
    const messages = [
      { id: "past", sender_kind: "user" }, { id: "current", sender_kind: "user" },
      { id: "next", sender_kind: "user" }, { id: "reply", sender_kind: "mind", reply_to_id: "current" },
    ];
    assert.deepEqual(transcriptForQuestion(messages, "current").map((m) => m.id), ["past", "current", "reply"]);
  });
});