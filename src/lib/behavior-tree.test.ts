import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileBehaviorTree, type VlaTrajectory } from "./embodied";

const t = (id: string, start: number, instruction: string, object = ""): VlaTrajectory => ({
  id, instruction, object, actionType: "grasp", startSec: start, endSec: start + 2, waypoints: [], confidence: "medium",
});

describe("compileBehaviorTree", () => {
  it("orders steps by video time and chains pre-conditions", () => {
    const tree = compileBehaviorTree("m", [t("b", 75, "pour water"), t("a", 10, "grab bottle", "bottle")]);
    assert.deepEqual(tree.children.map((c) => c.step.trajectoryId), ["a", "b"]);
    assert.equal(tree.children[0]!.step.sceneState, "start");
    assert.equal(tree.children[1]!.step.sceneState, "after: grab bottle");
    assert.equal(tree.children[1]!.step.timestamp, "1:15");
    assert.deepEqual(tree.children[0]!.step.affordances, ["graspable:bottle"]);
  });
});

describe("compileBehaviorTree with mined triplets", () => {
  it("uses real triplets in video order and marks recovery as fallback", () => {
    const tree = compileBehaviorTree("m", [], [
      { timestamp: "00:01:10", precondition: "cup on table", action_primitive: "pour", target_object: "cup", postcondition: "cup full", hazard_or_recovery: "spill: wipe and retry" },
      { timestamp: "00:00:05", precondition: "", action_primitive: "grasp", target_object: "bottle", postcondition: "bottle in hand", hazard_or_recovery: "" },
    ]);
    assert.deepEqual(tree.children.map((c) => c.step.actionPrimitive), ["grasp", "pour"]);
    assert.equal(tree.children[0]!.step.sceneState, "start");
    assert.equal(tree.children[1]!.step.sceneState, "cup on table");
    assert.equal(tree.children[1]!.onFailure, "fallback");
    assert.equal(tree.children[0]!.onFailure, "retry");
  });
});
