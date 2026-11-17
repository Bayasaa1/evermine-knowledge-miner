/**
 * Phase 1 deliverables: when the viewer hands over a file or link AND asks for
 * a concrete job, the Mind answers with a structured result (table, checklist,
 * field map) instead of a short chat reaction. Pure and deterministic.
 */

export type DeliverableKind = "table" | "checklist" | "fieldmap" | "report" | "code";

const JOB_WORDS: Record<Exclude<DeliverableKind, "code">, RegExp> = {
  fieldmap: /(field|form|cell|map|fill|tax|маягт|талбар|нүд|бөглө|татвар|양식|칸|세금)/i,
  checklist: /(checklist|steps?|plan|todo|алхам|төлөвлөгөө|шалга|체크|단계|계획)/i,
  table: /(table|compare|calculate|sum|total|balance|хүснэгт|харьцуул|тооц|баланс|нийт|표|비교|계산|합계)/i,
  report: /(analy[sz]e|audit|review|swot|risk|report|summari[sz]e|шинжил|аудит|эрсдэл|тайлан|дүгнэ|хураангуй|분석|감사|위험|보고|요약)/i,
};

/** True when the message carries a file or fetched link. */
export function hasMaterial(text: string): boolean {
  return /\[\[(file|link):/.test(text);
}

const BUILD_EN = /\b(build|create|make|write|code|develop|generate|program|implement)\b[\s\S]{0,60}\b(website|web ?site|web ?app|webpage|landing page|app|component|schema|sql|react|tailwind|html|frontend|backend|api|code)\b/i;
const BUILD_MN = /(веб|сайт|код|апп|программ|схем|компонент)[\s\S]{0,40}(хий|бүтээ|бич|гарга|хөгжүүл|угсар|үүсгэ)/i;
const BUILD_KO = /(코드|웹사이트|웹|앱|스키마|컴포넌트|프로그램)[\s\S]{0,30}(만들|작성|개발|생성|구현|짜)/;

/** True when the text asks to build software (no attachment needed). */
export function wantsCode(text: string): boolean {
  const asked = text.replace(/\[\[(file|link):[\s\S]*?\[\[\/(file|link)\]\]/g, " ");
  return BUILD_EN.test(asked) || BUILD_MN.test(asked) || BUILD_KO.test(asked);
}

/** Which structured result the job needs, or null for a plain reaction. */
export function detectDeliverable(text: string): DeliverableKind | null {
  if (wantsCode(text)) return "code";
  if (!hasMaterial(text)) return null;
  const asked = text.replace(/\[\[(file|link):[\s\S]*?\[\[\/(file|link)\]\]/g, " ");
  for (const kind of ["fieldmap", "checklist", "table", "report"] as const) {
    if (JOB_WORDS[kind].test(asked)) return kind;
  }
  return null;
}

const SHAPE: Record<DeliverableKind, string> = {
  fieldmap: "a markdown table | Field / cell | Value | Source (sheet+cell or page) | Note |, one row per form field, then a short list of values you could not find",
  checklist: "a numbered checklist of concrete steps, each with who does it and what proves it is done",
  table: "a markdown table with the computed figures (show totals and differences), then 2-3 lines on what stands out",
  report: "short headed sections: Key findings, Risks / problems, Recommendations (3 next steps)",
  code: "complete, runnable code in fenced blocks tagged with the language (```html, ```tsx, ```sql). Prefer one self-contained ```html file with Tailwind classes for web pages. No TODOs, no '...' placeholders",
};

/** Extra system rule, or "" when no deliverable is needed. */
export function deliverableRule(kind: DeliverableKind | null): string {
  if (!kind) return "";
  if (kind === "code") return `AGENT DELIVERABLE (this overrides the 1-3 sentence chat style and the no-headings rule): act as a senior engineer and ship working software. Ground every decision in your own mined mental models and frameworks from the knowledge above. Give one short line in your own voice, then ${SHAPE.code}.`;
  return `DELIVERABLE: the viewer asked for a concrete result from the shared material. After one short line in your own voice, deliver ${SHAPE[kind]}. Use only numbers and facts present in the material; when computing, show the formula. Mark anything missing as "?" instead of guessing.`;
}

/** Reply budget: deliverables need room for a table. */
export function replyBudget(kind: DeliverableKind | null): number {
  return kind === "code" ? 3800 : kind ? 1800 : 400;
}

/** Spreadsheet column letters: 0 -> A, 26 -> AA. */
export function columnLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Sheet rows rendered with cell addresses so the Mind can cite "B14". */
export function addressedSheet(rows: unknown[][]): string {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const head = "row," + Array.from({ length: width }, (_, i) => columnLetter(i)).join(",");
  const body = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""))
    .map(({ r, i }) => `${i + 1},` + Array.from({ length: width }, (_, j) => {
      const v = r[j] === null || r[j] === undefined ? "" : String(r[j]);
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(","));
  return [head, ...body].join("\n");
}
