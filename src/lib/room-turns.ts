export type TurnMessage = { id: string; moderator_pending?: boolean; reply_to_id?: string | null; sender_kind: string };
export function pendingQuestions<T extends TurnMessage>(messages: T[]): T[] {
  return messages.filter((m) => m.sender_kind === "user" && m.moderator_pending);
}
export function automaticRepliesAllowed(moderatorMode: boolean): boolean {
  return !moderatorMode;
}
export const ROOM_TURN_TIMEOUT_MS = 45000;
export function turnIsActive(startedAt: string | null | undefined, now = Date.now()): boolean {
  if (!startedAt) return false;
  const started = Date.parse(startedAt);
  return Number.isFinite(started) && now - started < ROOM_TURN_TIMEOUT_MS;
}
/** Race even when a provider ignores abort; late results never reach the caller. */
export async function withTurnDeadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = ROOM_TURN_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("TURN_TIMEOUT")); }, timeoutMs);
  });
  try { return await Promise.race([run(controller.signal), deadline]); }
  finally { if (timer) clearTimeout(timer); }
}
export function transcriptForQuestion<T extends TurnMessage>(messages: T[], questionId: string): T[] {
  const index = messages.findIndex((m) => m.id === questionId);
  if (index < 0) throw new Error("Question no longer exists");
  return messages.filter((m, i) => i <= index || (m.sender_kind === "mind" && m.reply_to_id === questionId));
}