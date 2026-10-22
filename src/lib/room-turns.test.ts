import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { automaticRepliesAllowed, pendingQuestions, transcriptForQuestion, turnIsActive, withTurnDeadline } from "./room-turns";
describe("moderator turns", () => {
  it("expires a disconnected turn at exactly 45 seconds", () => {
    const started = "2026-10-22T11:00:00Z";
    assert.equal(turnIsActive(started, Date.parse(started) + 44999), true);
    assert.equal(turnIsActive(started, Date.parse(started) + 45000), false);
    assert.equal(turnIsActive(null), false);
  });
  it("aborts timed-out AI work and rejects even if the provider never settles", async () => {
    let aborted = false;
    await assert.rejects(withTurnDeadline((signal) => new Promise(() => {
      signal.addEventListener("abort", () => { aborted = true; });
    }), 5), /TURN_TIMEOUT/);
    assert.equal(aborted, true);
  });
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