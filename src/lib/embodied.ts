/**
 * Embodied AI & Robotics: Vision-Language-Action (VLA) trajectory structures
 * derived from mined video, plus the simulated ROS 2 / Robot Mind export toggle.
 */
import { idbGet, idbSet, STORES } from "./store";
import type { ChunkResult, FaceFrame } from "./gemini";

export type Vec3 = { x: number; y: number; z: number };

export type VlaWaypoint = {
  /** Seconds from the start of the source video. */
  t: number;
  /** Normalized end-effector / hand position in camera space (0..1). */
  position: Vec3;
  /** Open (1) to fully closed (0) gripper estimate. */
  gripper: number;
};

export type VlaTrajectory = {
  id: string;
  /** Natural-language instruction the robot would receive. */
  instruction: string;
  /** Object being manipulated, when the action involves one. */
  object: string;
  actionType: string;
  startSec: number;
  endSec: number;
  waypoints: VlaWaypoint[];
  /** low | medium | high — how usable this clip is for policy training. */
  confidence: "low" | "medium" | "high";
};

export type EmbodiedSettings = {
  /** Capture VLA trajectories while mining video. */
  captureVla: boolean;
  /** Simulated ROS 2 / Robot Mind export API. */
  rosExport: boolean;
  /** ROS 2 topic the exported mind publishes to. */
  topic: string;
};

export function defaultEmbodiedSettings(): EmbodiedSettings {
  return { captureVla: false, rosExport: false, topic: "/evermind/mind_action" };
}

export function normalizeEmbodiedSettings(raw: unknown): EmbodiedSettings {
  const base = defaultEmbodiedSettings();
  if (typeof raw !== "object" || raw === null) return base;
  const v = raw as Record<string, unknown>;
  return {
    captureVla: v['captureVla'] === true,
    rosExport: v['rosExport'] === true,
    topic: typeof v['topic'] === "string" && v['topic'].trim() ? v['topic'] : base.topic,
  };
}

const KEY = "embodied-settings";

export async function loadEmbodiedSettings(): Promise<EmbodiedSettings> {
  return normalizeEmbodiedSettings(await idbGet<unknown>(STORES.SETTINGS, KEY));
}

export async function saveEmbodiedSettings(s: EmbodiedSettings): Promise<void> {
  await idbSet(STORES.SETTINGS, KEY, s);
}

/** "1:05" / "65" / "1:02:03" → seconds. */
export function toSeconds(stamp: string): number {
  const parts = String(stamp ?? "")
    .trim()
    .split(":")
    .map((p) => Number(p.replace(/[^\d.]/g, "")));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic pseudo-trajectory sampled across the action window. */
function waypoints(frame: FaceFrame, start: number, end: number): VlaWaypoint[] {
  const seed = hash(`${frame.timestamp}|${frame.actionType}|${frame.description}`);
  const steps = 6;
  const span = Math.max(0.5, end - start);
  return Array.from({ length: steps }, (_, i) => {
    const p = i / (steps - 1);
    const wobble = ((seed >> (i * 3)) % 100) / 1000;
    return {
      t: Number((start + span * p).toFixed(2)),
      position: {
        x: Number(Math.min(1, Math.max(0, 0.5 + Math.sin(p * Math.PI) * 0.25 + wobble)).toFixed(3)),
        y: Number(Math.min(1, Math.max(0, 0.45 + p * 0.2 - wobble)).toFixed(3)),
        z: Number(Math.min(1, Math.max(0, 0.3 + p * 0.35)).toFixed(3)),
      },
      gripper: Number(Math.min(1, Math.max(0, 1 - p)).toFixed(2)),
    };
  });
}

/** Derives VLA trajectories from the key physical actions captured while mining. */
export function extractTrajectories(chunk: Pick<ChunkResult, "faceData">): VlaTrajectory[] {
  return (chunk.faceData ?? [])
    .filter((f) => f.isKeyAction)
    .map((f, i) => {
      const start = toSeconds(f.clipStart || f.timestamp);
      const end = Math.max(start + 1, toSeconds(f.clipEnd || f.timestamp) || start + 3);
      const gestures = f.gestures?.trim();
      return {
        id: `vla_${i}_${Math.round(start)}`,
        instruction: f.actionType ? `${f.actionType}: ${f.description}` : f.description,
        object: gestures ? gestures.split(/[,;]/)[0]!.trim() : "",
        actionType: f.actionType || "manipulation",
        startSec: start,
        endSec: end,
        waypoints: waypoints(f, start, end),
        confidence: /high|clear|sharp/i.test(f.cloneQuality)
          ? ("high" as const)
          : /low|blur|poor/i.test(f.cloneQuality)
            ? ("low" as const)
            : ("medium" as const),
      };
    });
}

/** ROS 2-shaped payload for the simulated Robot Mind Export API. */
export function toRos2Payload(topic: string, trajectories: VlaTrajectory[]) {
  return {
    schema: "evermind.robot_mind/v1",
    ros_distro: "jazzy",
    topic,
    message_type: "evermind_msgs/msg/MindAction",
    actions: trajectories.map((t) => ({
      instruction: t.instruction,
      object: t.object,
      confidence: t.confidence,
      header: { frame_id: "camera_link" },
      points: t.waypoints.map((w) => ({
        time_from_start: w.t - t.startSec,
        position: [w.position.x, w.position.y, w.position.z],
        gripper: w.gripper,
      })),
    })),
  };
}
