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
