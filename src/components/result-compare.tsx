/**
 * Side-by-side comparison of every reading of one video.
 *
 * Column 1 is the miner's own result, then one column per audit another AI
 * produced. Each column shows the same measurable facts (subtitles, emotions,
 * topics, knowledge, story) so the creator can see at a glance which AI did the
 * better job — and pick the winner that feeds the Core Brain.
 */
import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Columns3, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import type { MindPayload } from "@/lib/mind-json";
import { auditsOf, chosenAuditId, minedBy } from "@/lib/mind-audit";
import { chooseAudit } from "@/lib/mind-audit.functions";
import { pickCopy, type Lang } from "@/lib/i18n";

type Column = {
  id: string | null;
  label: string;
  score: number | null;
  summary: string;
  topics: string[];
  knowledge: string[];
  subtitles: number;
  emotions: number;
  issues: string[];
};

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : [];
}

export function ResultCompare({
  lang,
  open,
  onOpenChange,
  vaultId,
  title,
  payload,
  onChanged,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultId: string;
  title: string;
  payload: MindPayload;
  onChanged: () => Promise<void> | void;
}) {
  const queryClient = useQueryClient();
  const pick = useServerFn(chooseAudit);
  const chosen = chosenAuditId(payload);

  const t = {
    title: pickCopy({ en: "Compare AI results", mn: "AI-үүдийн үр дүнг харьцуулах", ko: "AI 결과 비교" }, lang),
    intro: pickCopy(
      {
        en: "Every AI reading of this video, side by side. Pick the one that feeds your Core Brain.",
        mn: "Энэ видеоны бүх AI уншилтыг зэрэгцүүлэн харуулав. Гол тархийг тэжээх нэгийг сонго.",
        ko: "이 영상에 대한 모든 AI 해석을 나란히 봅니다. 코어 브레인에 사용할 결과를 고르세요.",
      },
      lang,
    ),
    miner: pickCopy({ en: "Miner result", mn: "Олборлогчийн үр дүн", ko: "마이너 결과" }, lang),
    subtitles: pickCopy({ en: "Subtitles", mn: "Хадмал", ko: "자막" }, lang),
    emotions: pickCopy({ en: "Emotions", mn: "Сэтгэл хөдлөл", ko: "감정" }, lang),
    topics: pickCopy({ en: "Topics", mn: "Сэдвүүд", ko: "주제" }, lang),
    knowledge: pickCopy({ en: "Knowledge", mn: "Мэдлэг", ko: "지식" }, lang),
    issues: pickCopy({ en: "Problems found", mn: "Илэрсэн алдаа", ko: "발견된 문제" }, lang),
    use: pickCopy({ en: "Use for Core Brain", mn: "Гол тархинд ашиглах", ko: "코어 브레인에 사용" }, lang),
    used: pickCopy({ en: "In use", mn: "Ашиглаж байна", ko: "사용 중" }, lang),
    none: pickCopy(
      {
        en: "Only the miner's result exists so far. Run the Auditor with another AI to compare.",
        mn: "Одоохондоо зөвхөн олборлогчийн үр дүн байна. Харьцуулахын тулд өөр AI-гаар аудит хийлгэнэ үү.",
        ko: "아직 마이너 결과만 있습니다. 다른 AI로 감사를 실행해 비교하세요.",
      },
      lang,
    ),
    close: pickCopy({ en: "Close", mn: "Хаах", ko: "닫기" }, lang),
  };

  const columns: Column[] = useMemo(() => {
    const result = (payload.result ?? {}) as Record<string, unknown>;
    const story = (result['story'] ?? {}) as Record<string, unknown>;
    const sub = (result['subconsciousness'] ?? {}) as Record<string, unknown>;
    const base: Column = {
      id: null,
      label: `${t.miner}${minedBy(payload) ? ` · ${minedBy(payload)}` : ""}`,
      score: null,
      summary: String(story['summary'] ?? ""),
      topics: strings(sub['skills']).slice(0, 8),
      knowledge: list(result['knowledgeNodes'])
        .map((n) => String(n['concept_title'] ?? ""))
        .filter(Boolean)
        .slice(0, 8),
      subtitles: list(result['transcript']).length,
      emotions: list(result['emotionTimeline']).length,
      issues: [],
    };
    const audits = auditsOf(payload).map<Column>((a) => ({
      id: a.id,
      label: a.auditorLabel,
      score: a.score,
      summary: a.ownResult?.summary ?? "",
      topics: (a.ownResult?.topics ?? []).slice(0, 8),
      knowledge: (a.ownResult?.knowledge ?? []).slice(0, 8),
      subtitles: base.subtitles,
      emotions: base.emotions,
      issues: (a.issues ?? []).slice(0, 5),
    }));
    return [base, ...audits];
  }, [payload, t.miner]);

  const choose = useMutation({
    mutationFn: (auditId: string | null) => pick({ data: { vaultId, auditId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
      await onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/90 p-4">
      <div className="w-full max-w-5xl space-y-4 rounded-[12px] border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          <Columns3 className="mt-0.5 h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {t.title} — {title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t.intro}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t.close}
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {columns.length === 1 && <p className="text-xs text-muted-foreground">{t.none}</p>}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {columns.map((c) => {
            const active = (chosen ?? null) === c.id;
            return (
              <div
                key={c.id ?? "miner"}
                className={`space-y-2 rounded-xl border p-3 ${active ? "border-primary bg-primary/5" : "border-border bg-background"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{c.label}</p>
                  {c.score !== null && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-foreground">
                      {c.score}/100
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                  <span className="rounded-md bg-muted px-1.5 py-0.5">
                    {t.subtitles}: {c.subtitles}
                  </span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5">
                    {t.emotions}: {c.emotions}
                  </span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5">
                    {t.topics}: {c.topics.length}
                  </span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5">
                    {t.knowledge}: {c.knowledge.length}
                  </span>
                </div>

                {c.summary && <p className="line-clamp-5 text-xs text-muted-foreground">{c.summary}</p>}

                {c.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.topics.map((topic) => (
                      <span key={topic} className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                        {topic}
                      </span>
                    ))}
                  </div>
                )}

                {c.issues.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-foreground">{t.issues}</p>
                    <ul className="mt-1 space-y-0.5">
                      {c.issues.map((issue) => (
                        <li key={issue} className="text-[11px] text-amber-500">
                          • {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  disabled={choose.isPending || active}
                  onClick={() => choose.mutate(c.id)}
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  }`}
                >
                  {choose.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : active ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : null}
                  {active ? t.used : t.use}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
