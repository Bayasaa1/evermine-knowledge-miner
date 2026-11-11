import { useState } from "react";
import { Check, Copy, Download, ExternalLink, Lock, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { fieldsCsv, missingValues, parseFieldMap, type WebTask } from "@/lib/web-task";

type L = "en" | "mn" | "ko";
const tr = (lang: L, en: string, mn: string, ko: string) => (lang === "mn" ? mn : lang === "ko" ? ko : en);

/** Human-in-the-loop card: the app prepares, the person logs in and submits. */
export function WebTaskCard({ task, reply, lang }: { task: WebTask; reply: string; lang: L }) {
  const rows = parseFieldMap(reply);
  const [done, setDone] = useState<Set<number>>(new Set());
  const mark = (i: number) => setDone((s) => new Set(s).add(i));
  const copy = async (i: number, v: string) => {
    try { await navigator.clipboard.writeText(v); mark(i); toast.success(tr(lang, "Copied", "Хуулагдлаа", "복사됨")); } catch { toast.error(tr(lang, "Copy failed", "Хуулж чадсангүй", "복사 실패")); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([fieldsCsv(rows)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${task.host}-fields.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const missing = missingValues(rows);
  const step = "flex items-start gap-2 rounded-lg border border-border bg-background/60 p-2";
  return (
    <div className="mt-2 space-y-1.5 text-xs text-foreground">
      <p className="font-semibold">{tr(lang, "Web task", "Вэб ажил", "웹 작업")} · {task.host}</p>
      <div className={step}>
        <span className="font-medium">1.</span>
        <a href={task.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary underline">
          {tr(lang, "Open the site", "Сайтыг нээх", "사이트 열기")} <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className={step}>
        <span className="font-medium">2.</span>
        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{tr(lang, "You log in (password, OTP, e-sign token). The Mind never sees them.", "Та өөрөө нэвтэрнэ (нууц үг, OTP, тоон гарын үсэг). Mind эдгээрийг хэзээ ч харахгүй.", "로그인(비밀번호·OTP·전자서명)은 직접 하세요. Mind는 보지 않습니다.")}</span>
      </div>
      <div className={`${step} flex-col`}>
        <span className="font-medium">3. {tr(lang, "Paste each value", "Утга бүрийг буулгах", "값 붙여넣기")} ({done.size}/{rows.length})</span>
        {rows.length === 0 && <span className="text-muted-foreground">{tr(lang, "No field table in this answer — ask the Mind for a field map.", "Энэ хариунд талбарын хүснэгт алга — Mind-аас талбарын хүснэгт гаргуул.", "필드 표가 없습니다 — Mind에게 필드 맵을 요청하세요.")}</span>}
        {rows.map((r, i) => (
          <div key={i} className="flex w-full items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{r.field}: <b className={r.value.includes("?") || !r.value ? "text-destructive" : ""}>{r.value || "?"}</b></span>
            <button type="button" onClick={() => void copy(i, r.value)} aria-label={`Copy ${r.field}`} className="rounded p-1 hover:bg-muted">
              {done.has(i) ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        ))}
        {missing > 0 && <span className="text-destructive">{tr(lang, `${missing} value(s) missing — fill them yourself.`, `${missing} утга дутуу — өөрөө бөглөнө үү.`, `${missing}개 값 누락 — 직접 입력하세요.`)}</span>}
      </div>
      {rows.length > 0 && (
        <div className={step}>
          <span className="font-medium">4.</span>
          <button type="button" onClick={download} className="flex items-center gap-1 text-primary underline">
            <Download className="h-3 w-3" /> {tr(lang, "Download file to attach", "Хавсаргах файл татах", "첨부 파일 다운로드")}
          </button>
        </div>
      )}
      <div className={step}>
        <span className="font-medium">5.</span>
        <UserCheck className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{tr(lang, "Check everything and press Submit yourself. Nothing is sent automatically.", "Бүгдийг шалгаад Илгээх товчийг өөрөө дарна. Юу ч автоматаар илгээгдэхгүй.", "모두 확인 후 제출은 직접 누르세요. 자동 전송은 없습니다.")}</span>
      </div>
    </div>
  );
}
