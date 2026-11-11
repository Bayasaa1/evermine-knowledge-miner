/**
 * Phase 3 dual mode for Mind chat. Manual: the Mind does one step of a
 * file/link job and waits for "continue". Auto-Pilot: it finishes every step in
 * one reply, limited per day so it cannot burn the user's keys.
 */
import { autopilotAllowance, AUTOPILOT_DAILY_CAP } from "./architect-operator";
import type { DeliverableKind } from "./chat-deliverable";

export type ChatMode = "manual" | "auto";
export const CHAT_AUTOPILOT_KEY = "evermind_chat_autopilot";

/** Mode the server should actually use: auto only when the daily cap allows it. */
export function effectiveMode(wanted: ChatMode, record: { day?: string; count?: number } | null, today: string): { mode: ChatMode; count: number; capped: boolean } {
  if (wanted !== "auto") return { mode: "manual", count: record?.day === today ? Number(record.count) || 0 : 0, capped: false };
  const a = autopilotAllowance(record, today, AUTOPILOT_DAILY_CAP);
  return { mode: a.allowed ? "auto" : "manual", count: a.count, capped: !a.allowed };
}

/** System rule; only applies to multi-step file/link jobs. */
export function modeRule(mode: ChatMode, deliverable: DeliverableKind | null): string {
  if (!deliverable) return "";
  return mode === "auto"
    ? "AUTO-PILOT MODE: complete every step of this job in this one reply and deliver the finished result. Do not stop to ask for confirmation unless a required value is truly missing."
    : "MANUAL MODE: do only the first step of this job now, show its result, then list the remaining steps as a numbered plan and end by asking the user to reply \"continue\" before you do the next step.";
}
