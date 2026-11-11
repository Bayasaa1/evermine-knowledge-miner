/**
 * Phase 2 transparency: plain-language steps showing what the Mind did for a
 * reply. Built only from facts the server/browser already know (files, links,
 * deliverable kind, which AI answered), never from model prose.
 */
import type { DeliverableKind } from "./chat-deliverable";

type L = "en" | "mn" | "ko";

export type ActivityFacts = {
  files: { name: string; kind: string }[];
  links: string[];
  deliverable: DeliverableKind | null;
  provider?: string | undefined;
};

const T = {
  file: { en: "Read file", mn: "Файл уншлаа", ko: "파일 읽음" },
  link: { en: "Opened link", mn: "Холбоос нээлээ", ko: "링크 열람" },
  vault: { en: "Checked the Mind's mined knowledge", mn: "Mind-ийн олборлосон мэдлэгтэй тулгалаа", ko: "Mind의 채굴 지식 확인" },
  shape: {
    fieldmap: { en: "Mapped values to form fields", mn: "Утгуудыг маягтын талбарт тохирууллаа", ko: "양식 칸에 값 매핑" },
    checklist: { en: "Built a step checklist", mn: "Алхамт жагсаалт гаргалаа", ko: "단계 체크리스트 작성" },
    table: { en: "Calculated figures into a table", mn: "Тоог тооцоолж хүснэгт гаргалаа", ko: "수치 계산 후 표 작성" },
    report: { en: "Wrote findings, risks and next steps", mn: "Олдвор, эрсдэл, дараагийн алхам бичлээ", ko: "발견·위험·다음 단계 작성" },
  },
  answer: { en: "Answered with", mn: "Хариулсан AI", ko: "답변 AI" },
  write: { en: "Writing the answer", mn: "Хариу бичиж байна", ko: "답변 작성 중" },
} as const;

/** Finished steps for the "What the Mind did" panel. */
export function activitySteps(f: ActivityFacts, lang: L): string[] {
  const out: string[] = [];
  for (const file of f.files) out.push(`${T.file[lang]}: ${file.name}`);
  for (const url of f.links) {
    let host = url;
    try { host = new URL(url).hostname; } catch { /* keep raw */ }
    out.push(`${T.link[lang]}: ${host}`);
  }
  out.push(T.vault[lang]);
  if (f.deliverable) out.push(T.shape[f.deliverable][lang]);
  if (f.provider) out.push(`${T.answer[lang]}: ${f.provider}`);
  return out;
}

/** Pending work is not reported as completed work. No polling or AI calls. */
export function plannedSteps(_f: ActivityFacts, lang: L): string[] {
  return [lang === "mn" ? "Хүсэлтийг боловсруулж байна" : lang === "ko" ? "요청 처리 중" : "Processing request"];
}
