import { describe, expect, test } from "bun:test";
import { compileBehaviorTree, type VlaTrajectory } from "./embodied";

const t = (id: string, start: number, instruction: string, object = ""): VlaTrajectory => ({
  id, instruction, object, actionType: "grasp", startSec: start, endSec: start + 2, waypoints: [], confidence: "medium",
});

describe("compileBehaviorTree", () => {
  test("orders steps by video time and chains pre-conditions", () => {
    const tree = compileBehaviorTree("m", [t("b", 75, "pour water"), t("a", 10, "grab bottle", "bottle")]);
    expect(tree.children.map((c) => c.step.trajectoryId)).toEqual(["a", "b"]);
    expect(tree.children[0]!.step.sceneState).toBe("start");
    expect(tree.children[1]!.step.sceneState).toBe("after: grab bottle");
    expect(tree.children[1]!.step.timestamp).toBe("1:15");
    expect(tree.children[0]!.step.affordances).toEqual(["graspable:bottle"]);
  });
});
