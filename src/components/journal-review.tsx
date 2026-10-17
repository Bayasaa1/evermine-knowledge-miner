import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, SpellCheck } from "lucide-react";
import { getJournalReview } from "@/lib/journal-review.functions";
import { pickCopy, useLang } from "@/lib/i18n";

const TONE = {
  typo: "border-l-2 border-destructive bg-destructive/10",
  meaning: "border-l-2 border-primary bg-primary/10",
  unclear: "border-l-2 border-muted-foreground bg-muted/40",
} as const;

/** Read-only proof-reading result: flagged lines are highlighted, never edited. */
export function JournalReviewPanel({ contentId }: { contentId: string }) {
  const { lang } = useLang();
  const c = (en: string, mn: string, ko: string) => pickCopy({ en, mn, ko }, lang);
  const fetchReview = useServerFn(getJournalReview);
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ["journal-review", contentId],
    queryFn: () => fetchReview({ data: { contentId } }),
    staleTime: 60_000,
  });
  if (!data) {
    return <p className="mt-1 text-[11px] text-muted-foreground">{c("Journal check: waiting in the background…", "Journal шалгалт: цаана хүлээгдэж байна…", "저널 검사: 백그라운드 대기 중…")}</p>;
  }
  const n = (k: string) => data.flags.filter((f) => f.kind === k).length;
  const label = { typo: c("word", "үг", "단어"), meaning: c("meaning", "утга", "의미"), unclear: c("unclear", "тодорхойгүй", "불명확") };
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground">
        <SpellCheck className="h-3.5 w-3.5" />
        {data.done
          ? c("Journal checked", "Journal шалгасан", "저널 검사 완료")
          : c(`Checking ${data.reviewed}/${data.total}`, `Шалгаж байна ${data.reviewed}/${data.total}`, `검사 중 ${data.reviewed}/${data.total}`)}
        {" · "}
        {data.flags.length
          ? `${n("typo")} ${label.typo} · ${n("meaning")} ${label.meaning} · ${n("unclear")} ${label.unclear}`
          : c("no problems", "алдаа алга", "문제 없음")}
        {data.flags.length > 0 && <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>
      {open && data.flags.length > 0 && (
        <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
          {data.flags.map((f, k) => (
            <li key={k} className={`rounded px-2 py-1.5 text-xs ${TONE[f.kind]}`}>
              <span className="mr-1 font-mono text-[10px] text-muted-foreground">{f.timestamp}</span>
              <span className="mr-1 text-[10px] uppercase text-muted-foreground">{label[f.kind]}</span>
              <Highlighted text={f.text} word={f.word} />
              {(f.suggestion || f.note) && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {f.suggestion ? `→ ${f.suggestion}` : ""} {f.note ?? ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Highlighted({ text, word }: { text: string; word?: string }) {
  const at = word ? text.indexOf(word) : -1;
  if (!word || at < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, at)}
      <span className="underline decoration-destructive decoration-wavy underline-offset-2">{word}</span>
      {text.slice(at + word.length)}
    </span>
  );
}
