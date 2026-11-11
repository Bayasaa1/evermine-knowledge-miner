import type { ArchitectResult, MindDirective } from "./architect-types";

export const OPERATOR_SKILLS = ["advance_mining", "deepen_brains", "draft_post", "challenge_pack", "team_briefing"] as const;
/** Auto-Pilot may run at most this many automatic repairs per user per day, so it cannot drain keys. */
/** No daily cap: everyone runs on their own keys, so the app does not ration them. */
export const AUTOPILOT_DAILY_CAP = Number.POSITIVE_INFINITY;
export function autopilotAllowance(record: { day?: string; count?: number } | null, today: string, cap = AUTOPILOT_DAILY_CAP): { day: string; count: number; allowed: boolean } {
  const count = record?.day === today ? Math.max(0, Number(record.count) || 0) : 0;
  return { day: today, count, allowed: count < cap };
}
const BLOCKED_WORDS = /\b(fuck\w*|shit\w*|bitch\w*|bastard\w*|cunt\w*|asshole\w*|dickhead\w*|motherfuck\w*|retard\w*|idiot\w*|moron\w*)\b|(пизд|хуй|сука|новш|гичий|씨발|시발|병신|개새끼|좆)/giu;
/** Public-post tone guard: masks profanity/insults so a sharp persona cannot publish abuse. */
export function toneGuard(text: string): { clean: string; flagged: number } {
  let flagged = 0;
  const clean = text.replace(BLOCKED_WORDS, (m) => { flagged++; return m[0] + "*".repeat(Math.max(1, m.length - 1)); });
  return { clean, flagged };
}
export function teamBriefing(directives: { mindName: string; severity: string; issueSummary: string }[], lang = "en"): string {
  if (!directives.length) return lang === "mn" ? "Багийн бүх Mind эрүүл байна. Асуудал олдсонгүй." : lang === "ko" ? "팀의 모든 마인드가 정상입니다." : "All team Minds are healthy. No issues found.";
  const by = new Map<string, string[]>();
  for (const d of directives) by.set(d.mindName, [...(by.get(d.mindName) ?? []), `[${d.severity}] ${d.issueSummary}`]);
  const head = lang === "mn" ? "Багийн тайлан" : lang === "ko" ? "팀 브리핑" : "Team briefing";
  return `${head}\n${[...by].map(([name, lines]) => `• ${name}\n  ${lines.join("\n  ")}`).join("\n")}`;
}
export type OperatorSkill = typeof OPERATOR_SKILLS[number];
export function automaticDirective(directives: MindDirective[]): MindDirective | undefined {
  return directives.find((d) => d.suggestedTool === "resume_mining" || d.suggestedTool === "repair_timings");
}
export function operatorIntent(text: string): OperatorSkill | undefined {
  if (/\b(mining|queue)\b|олборлолт|마이닝/i.test(text)) return "advance_mining";
  if (/\b(deepen|fuse|brain)\b|тархи|브레인/i.test(text)) return "deepen_brains";
  if (/\b(post|highlight)\b|нийтлэл|게시물/i.test(text)) return "draft_post";
  if (/\b(briefing|team report)\b|багийн тайлан|브리핑/i.test(text)) return "team_briefing";
  if (/\b(challenge|assignment)\b|сорилт|даалгавар|챌린지/i.test(text)) return "challenge_pack";
  return undefined;
}
export function strongestModel(models: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(models)) return;
  return models.filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
    .sort((a, b) => (Number(b["weight"] ?? b["importance"] ?? 0) || 0) - (Number(a["weight"] ?? a["importance"] ?? 0) || 0))[0];
}
export function sourceVideoUrl(source: unknown): string {
  if (typeof source === "string") return source;
  if (source && typeof source === "object" && "url" in source && typeof source.url === "string") return source.url;
  return "";
}
export function missingPostEvidence(lang = "en"): string {
  return lang === "mn" ? "Нотолгоотой видео мөч бүхий хадгалсан загвар олдсонгүй. Нийтлэл үүсгээгүй." : lang === "ko" ? "검증된 영상 시점이 있는 저장된 모델이 없습니다. 게시물을 만들지 않았습니다." : "No stored mental model with a verified video timestamp. No post was created.";
}
export function missingPostResult(lang = "en"): ArchitectResult {
  return { text: missingPostEvidence(lang), actions_taken: [], interactive_cards: [] };
}