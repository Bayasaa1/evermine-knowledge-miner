import type { MindDirective } from "./architect-types";
import { miningLeaseState } from "./mining-jobs";

export function updateMindRoster(ids: string[], id: string, attach: boolean): string[] {
  return attach ? [...new Set([...ids, id])].slice(0, 10) : ids.filter((x) => x !== id);
}
export function normalizeMindRoster(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === "string" && /^(project|persona):[0-9a-f-]{36}$/i.test(x)))].slice(0, 10) : [];
}
export type DirectiveHealth = {
  mindId: string; mindName: string; mindAvatar: string | null; projectId: string;
  stalled: number; failed: number; shallow: number; timing: number; missing: number; unposted?: number;
};
export function stalledJob(status: string, updatedAt: string, now = Date.now()): boolean {
  return miningLeaseState(status, updatedAt, now) === "stale";
}
const TEXT = {
  en: { unposted: "My unpublished project has videos available for a highlight draft", stalled: "My mining has stalled", failed: "My mining jobs failed", shallow: "My saved brain lacks a deep evidence layer", timing: "My subtitles have timing drift", missing: "My mined video has missing speech chunks", order: "Chatbot, review my project", inspect: "Detected from saved records; not a live message from the teacher" },
  mn: { unposted: "Миний нийтлээгүй төсөлд онцлох нийтлэл бэлдэх бичлэгүүд байна", stalled: "Миний олборлолт гацсан", failed: "Миний олборлолтын ажил алдаатай", shallow: "Миний тархинд гүн нотолгооны давхарга дутуу", timing: "Миний хадмалын хугацаа зөрсөн", missing: "Миний бичлэгийн ярианы хэсэг дутуу", order: "Чатбот, миний төслийг шалга", inspect: "Хадгалсан мэдээллээс илрүүлсэн; багшийн шууд мессеж биш" },
  ko: { unposted: "미공개 프로젝트에 하이라이트 초안용 영상이 있습니다", stalled: "내 마이닝이 멈췄습니다", failed: "내 마이닝 작업이 실패했습니다", shallow: "내 브레인에 심층 근거가 부족합니다", timing: "내 자막 시간이 어긋났습니다", missing: "내 영상에 누락된 음성 구간이 있습니다", order: "챗봇, 내 프로젝트를 점검해 주세요", inspect: "저장된 기록에서 감지됨; 교사의 실시간 메시지가 아님" },
};
export function generateMindDirectives(h: DirectiveHealth, lang = "en"): MindDirective[] {
  const t = TEXT[lang === "mn" || lang === "ko" ? lang : "en"];
  const checks: [number, keyof Pick<typeof t, "stalled" | "failed" | "shallow" | "timing" | "missing" | "unposted">, MindDirective["suggestedTool"], MindDirective["severity"]][] = [
    [h.stalled, "stalled", "resume_mining", "critical"], [h.failed, "failed", "clear_failed_jobs", "critical"],
    [h.shallow, "shallow", "deepen_legacy_vaults", "enhance"], [h.timing, "timing", "repair_timings", "warning"],
    [h.missing, "missing", "repair_timings", "warning"],
    [h.unposted ?? 0, "unposted", "draft_post", "enhance"],
  ];
  return checks.filter(([n]) => n > 0).map(([n, issue, tool, severity]) => ({
    id: `${h.mindId}:${h.projectId}:${issue}`, mindId: h.mindId, mindName: h.mindName, mindAvatar: h.mindAvatar,
    severity, issueSummary: `${t[issue]} (${n})`, directiveForChatbot: `${t.order}: ${tool}.`, suggestedTool: tool, targetProjectId: h.projectId,
  }));
}