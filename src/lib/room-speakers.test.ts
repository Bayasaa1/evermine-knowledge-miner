import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { RoomMind } from "./chat-rooms";
import { selectRoomSpeakers } from "./room-speakers";

const minds: RoomMind[] = ["Alice", "Frontend Architect", "UX Strategist"].map((mind_name, i) => ({
  id: String(i), mind_id: `mind-${i}`, mind_name, role: "debater", sort: i,
}));

describe("room coding requests", () => {
  test("an addressed coding request calls only the mentioned Mind, without relay", () => {
    const reply = selectRoomSpeakers("@Alice write the API code", minds, "round", 3);
    assert.deepEqual(reply.speakers.map((m) => m.mind_name), ["Alice"]);
    assert.equal(reply.build, false);
  });
  test("mention-only rooms stay silent on unaddressed build-sounding messages", () => {
    for (const body of ["Build a website", "how do I make my app better?"]) {
      assert.deepEqual(selectRoomSpeakers(body, minds, "mention", 3), { build: false, speakers: [] });
    }
  });
  test("ordinary coding requests preserve the room turn limit", () => {
    const reply = selectRoomSpeakers("Build a website", minds, "round", 1);
    assert.deepEqual(reply.speakers.map((m) => m.mind_name), ["Alice"]);
    assert.equal(reply.build, false);
  });
  test("multiple coding mentions still respect the turn limit", () => {
    const reply = selectRoomSpeakers("@Alice @Frontend Architect write API code", minds, "mention", 1);
    assert.deepEqual(reply.speakers.map((m) => m.mind_name), ["Alice"]);
    assert.equal(reply.build, false);
  });
  test("relevance mode chooses one Mind rather than the squad", () => {
    const reply = selectRoomSpeakers("Frontend: build a website", minds, "relevance", 3);
    assert.deepEqual(reply.speakers.map((m) => m.mind_name), ["Frontend Architect"]);
    assert.equal(reply.build, false);
  });
  test("explicit Auto-Build still starts the ordered full squad", () => {
    const reply = selectRoomSpeakers("Build a website", minds, "mention", 1, true);
    assert.deepEqual(reply.speakers.map((m) => m.mind_name), ["UX Strategist", "Frontend Architect", "Alice"]);
    assert.equal(reply.build, true);
  });
});