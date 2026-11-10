import type { MindDirective } from "./architect-types";

export const OPERATOR_SKILLS = ["advance_mining", "deepen_brains", "draft_post", "challenge_pack"] as const;
export type OperatorSkill = typeof OPERATOR_SKILLS[number];
export function automaticDirective(directives: MindDirective[]): MindDirective | undefined {
  return directives.find((d) => d.suggestedTool === "resume_mining" || d.suggestedTool === "repair_timings");
}
export function operatorIntent(text: string): OperatorSkill | undefined {
  if (/\b(mining|queue)\b|олборлолт|마이닝/i.test(text)) return "advance_mining";
  if (/\b(deepen|fuse|brain)\b|тархи|브레인/i.test(text)) return "deepen_brains";
  if (/\b(post|highlight)\b|нийтлэл|게시물/i.test(text)) return "draft_post";
  if (/\b(challenge|assignment)\b|сорилт|даалгавар|챌린지/i.test(text)) return "challenge_pack";
}
export function strongestModel(models: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(models)) return;
  return models.filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .sort((a, b) => (Number(b["weight"] ?? b["importance"] ?? 0) || 0) - (Number(a["weight"] ?? a["importance"] ?? 0) || 0))[0];
}