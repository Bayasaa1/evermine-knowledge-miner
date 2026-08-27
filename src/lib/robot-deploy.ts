/**
 * Robot Deployment: compiles a Mind Vault into an OTA package that a physical
 * robot can pull with one HTTP GET (or by scanning the deployment QR code).
 */
import type { ChunkResult, KnowledgeNode } from "./gemini";
import { extractTrajectories, toRos2Payload, type VlaTrajectory } from "./embodied";

export type RobotMindPackage = {
  schema: "evermind.robot_mind/v1";
  mind_id: string;
  title: string;
  generated_at: string;
  runtime: { ros_distro: string; topic: string; message_type: string };
  /** Confidence-filtered concept + spatial-action graph. */
  knowledge_graph: KnowledgeNode[];
  /** Vision-Language-Action trajectories for the robot's local policy memory. */
  vla_trajectories: VlaTrajectory[];
  /** ROS 2-shaped action stream, ready to publish. */
  ros2: ReturnType<typeof toRos2Payload>;
  stats: { nodes: number; trajectories: number; spatial_actions: number };
};

export function buildRobotPackage(input: {
  mindId: string;
  title: string;
  topic: string;
  chunks: Pick<ChunkResult, "faceData" | "knowledgeNodes">[];
}): RobotMindPackage {
  const knowledge = input.chunks.flatMap((c) => c.knowledgeNodes ?? []);
  const trajectories = input.chunks.flatMap((c) => extractTrajectories(c));
  return {
    schema: "evermind.robot_mind/v1",
    mind_id: input.mindId,
    title: input.title,
    generated_at: new Date().toISOString(),
    runtime: {
      ros_distro: "jazzy",
      topic: input.topic,
      message_type: "evermind_msgs/msg/MindAction",
    },
    knowledge_graph: knowledge,
    vla_trajectories: trajectories,
    ros2: toRos2Payload(input.topic, trajectories),
    stats: {
      nodes: knowledge.length,
      trajectories: trajectories.length,
      spatial_actions: knowledge.filter((n) => n.spatial_action !== null).length,
    },
  };
}

/** Public, robot-facing pull URL for a deployment token. */
export function deploymentUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/v1/mind/${token}/package.json`;
}

/** Minimal Python/ROS 2 client the creator can run for integration testing. */
export function rosClientScript(url: string, topic: string): string {
  return `#!/usr/bin/env python3
"""Evermind OTA Mind loader — pulls a mind package and republishes it on ROS 2."""
import json
import urllib.request

import rclpy
from rclpy.node import Node
from std_msgs.msg import String

MIND_URL = "${url}"
TOPIC = "${topic}"


def fetch_mind():
    with urllib.request.urlopen(MIND_URL, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


class MindLoader(Node):
    def __init__(self, mind):
        super().__init__("evermind_mind_loader")
        self.mind = mind
        self.publisher = self.create_publisher(String, TOPIC, 10)
        self.index = 0
        self.create_timer(1.0, self.tick)

    def tick(self):
        actions = self.mind["ros2"]["actions"]
        if self.index >= len(actions):
            self.get_logger().info("Mind fully loaded into local runtime memory.")
            rclpy.shutdown()
            return
        msg = String()
        msg.data = json.dumps(actions[self.index])
        self.publisher.publish(msg)
        self.index += 1


def main():
    mind = fetch_mind()
    print(f"Loaded mind {mind['mind_id']}: {mind['stats']}")
    rclpy.init()
    rclpy.spin(MindLoader(mind))


if __name__ == "__main__":
    main()
`;
}
