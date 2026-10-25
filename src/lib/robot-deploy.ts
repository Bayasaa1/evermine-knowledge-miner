/**
 * Robot Deployment: compiles a Mind Vault into an OTA package that a physical
 * robot can pull with one HTTP GET (or by scanning the deployment QR code).
 */
import type { ChunkResult, GamingExtraction, KnowledgeNode } from "./gemini";
import { compileBehaviorTree, compileSkillDrillChecklist, extractEmbodiedSteps, extractTrajectories, toRos2Payload, type BehaviorTree, type SkillDrillChecklistItem, type VlaTrajectory } from "./embodied";
import { buildTacticalPlaybook, type TacticalPlaybook } from "./game-bot";

export type MindKind = "knowledge" | "movement" | "robot" | "gaming";

export type RobotMindPackage = {
  schema: "evermind.robot_mind/v1";
  edition: "complete";
  mind_kind: MindKind;
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
  /** Ordered Action-State behavior tree compiled from the trajectories. */
  behavior_tree: BehaviorTree;
  /** Movement Coach drills (prep/execution/follow-through). */
  movement_drills: SkillDrillChecklistItem[];
  /** Gaming Mind playbook; null when the Mind has no gameplay. */
  tactical_playbook: TacticalPlaybook | null;
  stats: { nodes: number; trajectories: number; spatial_actions: number };
};

/** Read-only merge of every chunk's gaming material. */
function mergeGaming(chunks: Pick<ChunkResult, "gaming">[]): GamingExtraction | null {
  const parts = chunks.map((c) => c.gaming).filter(Boolean) as GamingExtraction[];
  if (!parts.length) return null;
  const merged = {} as Record<string, unknown[]>;
  for (const p of parts) {
    for (const [k, v] of Object.entries(p)) if (Array.isArray(v)) merged[k] = [...(merged[k] ?? []), ...v];
  }
  const g = merged as unknown as GamingExtraction;
  const size = (g.skills?.length ?? 0) + (g.tactics?.length ?? 0) + (g.decisions?.length ?? 0);
  if (!size) return null;
  const empty = { skills: [], tactics: [], decisions: [], tutorials: [], commentaryStyle: [], mistakes: [], communication: [], mindset: [], emotions: [] };
  return Object.assign(empty, g) as GamingExtraction;
}

/** Which kind of Mind this package is, from what was actually mined. */
export function detectMindKind(p: Pick<RobotMindPackage, "tactical_playbook" | "movement_drills" | "behavior_tree">): MindKind {
  if (p.tactical_playbook) return "gaming";
  if (p.movement_drills.length) return "movement";
  if (p.behavior_tree.children.length) return "robot";
  return "knowledge";
}

export function buildRobotPackage(input: {
  mindId: string;
  title: string;
  topic: string;
  chunks: (Pick<ChunkResult, "faceData" | "knowledgeNodes" | "screenItems"> & Partial<Pick<ChunkResult, "gaming">>)[];
}): RobotMindPackage {
  const knowledge = input.chunks.flatMap((c) => c.knowledgeNodes ?? []);
  const trajectories = input.chunks.flatMap((c) => extractTrajectories(c));
  const triplets = input.chunks.flatMap((c) => extractEmbodiedSteps(c));
  const gaming = mergeGaming(input.chunks as Pick<ChunkResult, "gaming">[]);
  const behavior_tree = compileBehaviorTree(input.title, trajectories, triplets);
  const movement_drills = compileSkillDrillChecklist(trajectories);
  const tactical_playbook = gaming ? buildTacticalPlaybook(gaming) : null;
  return {
    schema: "evermind.robot_mind/v1",
    edition: "complete",
    mind_kind: detectMindKind({ tactical_playbook, movement_drills, behavior_tree }),
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
    behavior_tree,
    movement_drills,
    tactical_playbook,
    stats: {
      nodes: knowledge.length,
      trajectories: trajectories.length,
      spatial_actions: knowledge.filter((n) => n.spatial_action !== null).length,
    },
  };
}

/** The one line a buyer pastes into a terminal. */
export function quickStartCommand(token: string): string {
  return `python3 evermind_runner.py --token ${token}`;
}

/**
 * Zero-config runner: pulls the Complete Edition package, steps the behavior
 * tree, speaks each step, and drives ROS 2 /cmd_vel, Serial or WebSocket.
 * Live camera decisions call /api/mind-vision (mode "embodied") when the buyer
 * passes their signed-in key via --auth / EVERMIND_AUTH; without it the runner
 * plays the mined plan offline.
 */
export function evermindRunnerScript(origin: string, token: string): string {
  const base = origin.replace(/\/$/, "");
  return `#!/usr/bin/env python3
"""Evermind Complete Edition runner — zero config.

Quick start:  python3 evermind_runner.py --token ${token || "<TOKEN>"}
Optional:     pip install opencv-python pyttsx3 pyserial websocket-client
Outputs:      --out print | ros2 | serial:/dev/ttyUSB0 | ws://host:port
Live vision:  --auth <your Evermind sign-in key>  (or env EVERMIND_AUTH)
"""
import argparse, base64, json, os, time, urllib.request

BASE = "${base}"
DEFAULT_TOKEN = "${token}"


def http_json(url, body=None, auth=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={"content-type": "application/json"})
    if auth:
        req.add_header("authorization", "Bearer " + auth)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def speak(text):
    if not text:
        return
    print("🗣 ", text)
    try:
        import pyttsx3
        e = pyttsx3.init(); e.say(text); e.runAndWait()
    except Exception:
        pass


VEL = {"move": (0.2, 0.0), "approach": (0.15, 0.0), "reach": (0.05, 0.0), "turn": (0.0, 0.5),
       "rotate": (0.0, 0.5), "back": (-0.15, 0.0), "retreat": (-0.15, 0.0), "stop": (0.0, 0.0)}


def velocity(action):
    a = (action or "").lower()
    for k, v in VEL.items():
        if k in a:
            return v
    return (0.0, 0.0)


class Output:
    def __init__(self, spec, topic):
        self.spec, self.pub, self.ser, self.ws = spec, None, None, None
        if spec == "ros2":
            import rclpy
            from geometry_msgs.msg import Twist
            rclpy.init(); self.node = rclpy.create_node("evermind_runner")
            self.Twist = Twist; self.pub = self.node.create_publisher(Twist, "/cmd_vel", 10)
        elif spec.startswith("serial:"):
            import serial
            self.ser = serial.Serial(spec.split(":", 1)[1], 115200, timeout=1)
        elif spec.startswith("ws://") or spec.startswith("wss://"):
            import websocket
            self.ws = websocket.create_connection(spec)

    def send(self, action, target):
        lin, ang = velocity(action)
        cmd = {"action": action, "target": target, "linear_x": lin, "angular_z": ang}
        if self.pub:
            m = self.Twist(); m.linear.x = lin; m.angular.z = ang; self.pub.publish(m)
        elif self.ser:
            self.ser.write((json.dumps(cmd) + "\\n").encode())
        elif self.ws:
            self.ws.send(json.dumps(cmd))
        print("⚙ ", json.dumps(cmd))


def grab_frame(cam):
    if cam is None:
        return None
    ok, frame = cam.read()
    if not ok:
        return None
    import cv2
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
    return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode() if ok else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", default=DEFAULT_TOKEN)
    ap.add_argument("--out", default="print")
    ap.add_argument("--auth", default=os.environ.get("EVERMIND_AUTH", ""))
    ap.add_argument("--interval", type=float, default=2.0)
    args = ap.parse_args()

    mind = http_json(f"{BASE}/api/public/v1/mind/{args.token}/package.json")
    print(f"Loaded {mind.get('title')} ({mind.get('mind_kind', 'robot')})")
    out = Output(args.out, mind.get("runtime", {}).get("topic", "/evermind/mind_action"))
    cam = None
    if args.auth:
        try:
            import cv2
            cam = cv2.VideoCapture(0)
        except Exception:
            print("Camera unavailable — install opencv-python for live vision.")

    steps = [c.get("step", {}) for c in ((mind.get("behavior_tree") or {}).get("children") or [])]
    i = 0
    while True:
        frame = grab_frame(cam)
        if frame and args.auth:
            try:
                d = http_json(f"{BASE}/api/mind-vision", {"mode": "embodied", "image": frame, "name": mind.get("title")}, args.auth)
                act = d.get("embodied") or d
                speak(act.get("speech"))
                out.send(act.get("action_primitive"), act.get("target_object"))
            except Exception as e:
                print("vision error:", e)
        elif i < len(steps):
            s = steps[i]
            speak(s.get("actorMotion"))
            out.send(s.get("actionPrimitive") or s.get("actorMotion"), s.get("targetObject"))
            i += 1
        else:
            print("Plan complete."); out.send("stop", None); break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
`;
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
