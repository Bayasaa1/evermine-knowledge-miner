export type TurnMessage = { id: string; moderator_pending?: boolean; reply_to_id?: string | null; sender_kind: string };
export function pendingQuestions<T extends TurnMessage>(messages: T[]): T[] {
  return messages.filter((m) => m.sender_kind === "user" && m.moderator_pending);
}
export function automaticRepliesAllowed(moderatorMode: boolean): boolean {
  return !moderatorMode;
}
export function transcriptForQuestion<T extends TurnMessage>(messages: T[], questionId: string): T[] {
  const index = messages.findIndex((m) => m.id === questionId);
  if (index < 0) throw new Error("Question no longer exists");
  return messages.filter((m, i) => i <= index || (m.sender_kind === "mind" && m.reply_to_id === questionId));
}