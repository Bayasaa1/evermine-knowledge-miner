/**
 * JSON Surgical Editor — chunk eraser, conflict annotations and FAQ patches.
 * Every save writes a NEW version, so a bad edit is always recoverable.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Eraser, MessageSquarePlus, Save, Scissors, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { pickCopy, type Lang } from "@/lib/i18n";
import {
  addAnnotation,
  addFaqPatch,
  chunkBuckets,
  eraseChunk,
  removeAnnotation,
  removeFaqPatch,
  type MindPayload,
} from "@/lib/mind-json";

const C = {
  title: { en: "Fix this mind", mn: "Энэ оюуныг засах", ko: "이 마인드 고치기" },
  desc: {
    en: "Remove a bad part, correct something wrong, or add a question and answer. Saving keeps the old copy too.",
    mn: "Муу хэсгийг хасах, буруу зүйлийг засах, эсвэл асуулт хариулт нэмэх. Хадгалахад хуучин хувь нь бас үлдэнэ.",
    ko: "잘못된 부분을 지우거나, 틀린 내용을 고치거나, 질문과 답을 추가하세요. 저장해도 예전 사본은 남습니다.",
  },
  chunks: { en: "Bad part? Remove it", mn: "Муу хэсэг үү? Устга", ko: "잘못된 부분 지우기" },
  noChunks: { en: "This mind has no time-marked parts.", mn: "Энэ оюунд цагаар тэмдэглэсэн хэсэг алга.", ko: "시간 표시된 부분이 없습니다." },
  erase: { en: "Remove", mn: "Устгах", ko: "지우기" },
  annotations: { en: "Something wrong? Correct it", mn: "Буруу зүйл байна уу? Зас", ko: "틀린 내용 고치기" },
  statement: { en: "What it says wrong", mn: "Буруу хэлсэн зүйл", ko: "잘못 말한 내용" },
  overrule: { en: "What it should say", mn: "Юу гэж хэлэх ёстой вэ", ko: "올바른 내용" },
  faq: { en: "Add a question and answer", mn: "Асуулт хариулт нэмэх", ko: "질문과 답 추가" },
  question: { en: "Question", mn: "Асуулт", ko: "질문" },
  answer: { en: "Right answer", mn: "Зөв хариулт", ko: "올바른 답" },
  add: { en: "Add", mn: "Нэмэх", ko: "추가" },
  notes: { en: "What changed (short note)", mn: "Юу өөрчлөгдсөн (богино тэмдэглэл)", ko: "변경 내용 (짧은 메모)" },
  save: { en: "Save", mn: "Хадгалах", ko: "저장" },
  saved: { en: "Saved", mn: "Хадгаллаа", ko: "저장되었습니다" },
} as const;

export function JsonSurgicalEditor({
  lang,
  open,
  onOpenChange,
  title,
  payload,
  onSave,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  payload: MindPayload;
  onSave: (next: MindPayload, releaseNotes: string) => Promise<void>;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const [draft, setDraft] = useState<MindPayload>(payload);
  const [statement, setStatement] = useState("");
  const [overrule, setOverrule] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const buckets = useMemo(() => chunkBuckets(draft), [draft]);
  const annotations = draft.annotations ?? [];
  const faqPatches = draft.faqPatches ?? [];

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft, notes);
      toast.success(t("saved"));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) setDraft(payload); onOpenChange(o); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" /> {t("title")}
          </DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
        </DialogHeader>

        <p className="truncate text-sm font-medium text-foreground">{title}</p>

        <section className="space-y-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Eraser className="h-4 w-4 text-primary" /> {t("chunks")}
          </h4>
          {buckets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noChunks")}</p>
          ) : (
            <ul className="space-y-2">
              {buckets.map((b) => (
                <li key={b.index} className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{b.label}</Badge>
                      <span className="text-xs text-muted-foreground">{b.total} records</span>
                    </div>
                    {b.preview ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{b.preview}</p> : null}
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => setDraft(eraseChunk(draft, b.index))}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("erase")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">{t("annotations")}</h4>
          {annotations.map((a) => (
            <div key={a.id} className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs">
              <div className="min-w-0 flex-1">
                <p className="line-through text-muted-foreground">{a.statement}</p>
                <p className="text-foreground">→ {a.overrule}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setDraft(removeAnnotation(draft, a.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Input value={statement} onChange={(e) => setStatement(e.target.value)} placeholder={t("statement")} />
          <Textarea value={overrule} onChange={(e) => setOverrule(e.target.value)} placeholder={t("overrule")} rows={2} />
          <Button
            size="sm"
            variant="secondary"
            disabled={!statement.trim() || !overrule.trim()}
            onClick={() => {
              setDraft(addAnnotation(draft, statement.trim(), overrule.trim()));
              setStatement("");
              setOverrule("");
            }}
          >
            <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> {t("add")}
          </Button>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">{t("faq")}</h4>
          {faqPatches.map((f) => (
            <div key={f.id} className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{f.question}</p>
                <p className="text-muted-foreground">{f.answer}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setDraft(removeFaqPatch(draft, f.id))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("question")} />
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t("answer")} rows={2} />
          <Button
            size="sm"
            variant="secondary"
            disabled={!question.trim() || !answer.trim()}
            onClick={() => {
              setDraft(addFaqPatch(draft, question.trim(), answer.trim()));
              setQuestion("");
              setAnswer("");
            }}
          >
            <MessageSquarePlus className="mr-1 h-3.5 w-3.5" /> {t("add")}
          </Button>
        </section>

        <section className="space-y-2 border-t border-border pt-4">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notes")} rows={2} />
          <Button onClick={save} disabled={saving} className="w-full">
            <Save className="mr-2 h-4 w-4" /> {t("save")}
          </Button>
        </section>
      </DialogContent>
    </Dialog>
  );
}
