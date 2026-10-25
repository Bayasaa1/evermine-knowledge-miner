/**
 * Embodied AI & Robotics: Vision-Language-Action (VLA) trajectory structures
 * derived from mined video, plus the simulated ROS 2 / Robot Mind export toggle.
 */
import { idbGet, idbSet, STORES } from "./store";
import { scopedKey } from "./user-scope";
import type { ChunkResult, EmbodiedTriplet, FaceFrame } from "./gemini";
import { z } from "zod";

const movementDetail = z.string().trim().max(600);
export const MovementSkillDrillSchema = z.object({
  skill_name: movementDetail.min(1),
  phase: z.enum(["prep", "execution", "follow_through"]),
  body_or_hand_mechanics: movementDetail.min(1),
  tempo_and_rhythm: movementDetail,
  sensory_cue: movementDetail,
  common_mistake_to_avoid: movementDetail,
});
export type MovementSkillDrill = z.infer<typeof MovementSkillDrillSchema>;
export type SkillDrillChecklistItem = MovementSkillDrill & { timestamp: string };
// ScreenItem.steps survives existing normalization/merge without a schema migration.
export const MOVEMENT_DRILL_PREFIX = "movement_skill_drill:";

export function extractMovementSkillDrills(chunk: Partial<Pick<ChunkResult, "screenItems">>): SkillDrillChecklistItem[] {
  return (chunk.screenItems ?? []).flatMap((item) => item.steps.flatMap((step) => {
    if (!step.startsWith(MOVEMENT_DRILL_PREFIX)) return [];
    try {
      const drill = MovementSkillDrillSchema.safeParse(JSON.parse(step.slice(MOVEMENT_DRILL_PREFIX.length)));
      return drill.success ? [{ ...drill.data, timestamp: item.timestamp }] : [];
    } catch { return []; }
  })).sort((a, b) => toSeconds(a.timestamp) - toSeconds(b.timestamp));
}

/** Read-only source-timed checklist: never invent mechanics or missing phases. */
export function compileSkillDrillChecklist(trajectories: VlaTrajectory[]): SkillDrillChecklistItem[] {
  const seen = new Set<string>();
  return trajectories.flatMap((t) => t.movementDrills ?? []).filter((drill) => {
    const key = JSON.stringify(drill);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => toSeconds(a.timestamp) - toSeconds(b.timestamp));
}

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
  movementDrills?: SkillDrillChecklistItem[];
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

const KEY = () => scopedKey("embodied-settings");

export async function loadEmbodiedSettings(): Promise<EmbodiedSettings> {
  return normalizeEmbodiedSettings(await idbGet<unknown>(STORES.SETTINGS, KEY()));
}

export async function saveEmbodiedSettings(s: EmbodiedSettings): Promise<void> {
  await idbSet(STORES.SETTINGS, KEY(), s);
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
export function extractTrajectories(chunk: Pick<ChunkResult, "faceData"> & Partial<Pick<ChunkResult, "screenItems">>): VlaTrajectory[] {
  const drills = extractMovementSkillDrills(chunk);
  const trajectories: VlaTrajectory[] = (chunk.faceData ?? [])
    .filter((f) => f.isKeyAction)
    .map((f, i) => {
      const start = toSeconds(f.clipStart || f.timestamp);
      const end = Math.max(start + 1, toSeconds(f.clipEnd || f.timestamp) || start + 3);
      const gestures = f.gestures?.trim();
      return {
        id: `vla_${i}_${Math.round(start)}`,
        instruction: f.actionType ? `${f.actionType}: ${f.description}` : f.description,
        object: gestures ? gestures.split(/[,;]/)[0]?.trim() ?? "" : "",
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
  for (const drill of drills) {
    const sec = toSeconds(drill.timestamp);
    const match = trajectories.find((t) => sec >= t.startSec && sec <= t.endSec);
    if (match) (match.movementDrills ??= []).push(drill);
    else trajectories.push({
      id: `drill_${trajectories.length}_${sec}`, instruction: drill.skill_name,
      object: "", actionType: "skill_drill", startSec: sec, endSec: sec,
      // Observational checklist, not measured robot joint coordinates.
      waypoints: [], confidence: "low", movementDrills: [drill],
    });
  }
  return trajectories;
}

/** ROS 2-shaped payload for the simulated Robot Mind Export API. */
export function toRos2Payload(topic: string, trajectories: VlaTrajectory[]) {
  return {
    schema: "evermind.robot_mind/v1",
    ros_distro: "jazzy",
    topic,
    message_type: "evermind_msgs/msg/MindAction",
    skill_drill_checklist: compileSkillDrillChecklist(trajectories),
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

/** One Pre-condition → Action → Post-condition step, derived only from mined key actions. */
export type ActionStateStep = {
  id: string;
  timestamp: string;
  sceneState: string;
  actorMotion: string;
  affordances: string[];
  successCondition: string;
  trajectoryId: string;
  /** Verb the robot executes (grasp, place, pour...) when mined as a triplet. */
  actionPrimitive?: string;
  targetObject?: string;
  /** Recovery hint; the UI and runtime treat it as a Fallback branch. */
  recovery?: string;
};

export type BehaviorTree = {
  type: "sequence";
  name: string;
  children: { type: "action"; step: ActionStateStep; onFailure: "retry" | "fallback" }[];
};

export type MinedTriplet = EmbodiedTriplet & { timestamp: string };

/** Collects the embodied triplets the screen pass recorded, in video order. */
export function extractEmbodiedSteps(chunk: Pick<ChunkResult, "screenItems">): MinedTriplet[] {
  return (chunk.screenItems ?? [])
    .filter((i) => i.embodied?.action_primitive)
    .map((i) => ({ ...i.embodied!, timestamp: i.timestamp }));
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/**
 * Compiles the mined key actions into an ordered Action-State behavior tree.
 * Read-only: never calls AI and never changes mined data. Real mined triplets
 * are used when present; otherwise each step's pre-condition is the previous
 * trajectory's instruction, so order follows the video.
 */
export function compileBehaviorTree(
  name: string,
  trajectories: VlaTrajectory[],
  triplets: MinedTriplet[] = [],
): BehaviorTree {
  if (triplets.length > 0) {
    const sorted = [...triplets].sort((a, b) => toSeconds(a.timestamp) - toSeconds(b.timestamp));
    return {
      type: "sequence",
      name,
      children: sorted.map((tr, i) => {
        const prev = sorted[i - 1];
        const step: ActionStateStep = {
          id: `step_${i + 1}`,
          timestamp: fmt(toSeconds(tr.timestamp)),
          sceneState: tr.precondition || (prev ? `after: ${prev.postcondition || prev.action_primitive}` : "start"),
          actorMotion: `${tr.action_primitive}${tr.target_object ? ` ${tr.target_object}` : ""}`,
          affordances: tr.target_object ? [`${tr.action_primitive}:${tr.target_object}`] : [],
          successCondition: tr.postcondition || `${tr.action_primitive} completed`,
          trajectoryId: "",
          actionPrimitive: tr.action_primitive,
          targetObject: tr.target_object,
          ...(tr.hazard_or_recovery ? { recovery: tr.hazard_or_recovery } : {}),
        };
        return { type: "action" as const, step, onFailure: tr.hazard_or_recovery ? ("fallback" as const) : ("retry" as const) };
      }),
    };
  }
  const sorted = [...trajectories].sort((a, b) => a.startSec - b.startSec);
  const steps: ActionStateStep[] = sorted.map((t, i) => {
    const prev = sorted[i - 1];
    return {
      id: `step_${i + 1}`,
      timestamp: fmt(t.startSec),
      sceneState: prev ? `after: ${prev.instruction}` : "start",
      actorMotion: t.instruction,
      affordances: t.object ? [`graspable:${t.object}`] : [],
      successCondition: `${t.actionType} completed`,
      trajectoryId: t.id,
    };
  });
  return {
    type: "sequence",
    name,
    children: steps.map((step) => ({ type: "action", step, onFailure: "retry" })),
  };
}
