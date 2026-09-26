/**
 * Auditor panel for a saved mind.
 *
 * A second AI reviews what the miner produced: it gives a score, its own
 * reading, what is right, what is wrong and what to fix. An AI never audits
 * its own work. Every audit stays listed — Auditor X, then Auditor Y under it
 * — and the creator picks whose result feeds the Core Brain.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Gavel, Loader2, RefreshCw, ShieldCheck, Undo2, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import type { MindPayload } from "@/lib/mind-json";
import {
  auditorsFor,
  auditsOf,
  chosenAuditId,
  minedBy,
  runAudit,
  type AuditRecord,
} from "@/lib/mind-audit";
import { chooseAudit, refreshPersonality, saveAudit, undoPersonalityRefresh } from "@/lib/mind-audit.functions";
import { DEFAULT_MINER, loadMinerChoice, minerReadiness, type MinerChoice, type MinerId } from "@/lib/miner-pool";
import { pickCopy, type Lang } from "@/lib/i18n";

export function MindAuditor({
  lang,
  open,
  onOpenChange,
  vaultId,
  title,
  payload,
  sourceId,
  onChanged,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaultId: string;
  title: string;
  payload: MindPayload;
  /** Saved source row for this video — needed to send a fix back to mining. */
  sourceId?: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const store = useServerFn(saveAudit);
  const pick = useServerFn(chooseAudit);
  const refreshPersona = useServerFn(refreshPersonality);
  const undoPersona = useServerFn(undoPersonalityRefresh);
  const [choice, setChoice] = useState<MinerChoice>(DEFAULT_MINER);
  const [auditor, setAuditor] = useState<MinerId>("gemini");
  const [openResult, setOpenResult] = useState<string | null>(null);

  const t = {
    title: pickCopy({ en: "Auditor", mn: "Аудитор", ko: "감사관" }, lang),
    intro: pickCopy(
      {
        en: "A second AI reviews this mining result, scores it and says what is right and what is wrong. An AI never audits its own work.",
        mn: "Өөр нэг AI энэ олборлолтын үр дүнг шалгаж, оноо өгч, юу зөв, юу буруу байгааг хэлнэ. AI өөрийнхөө ажлыг хэзээ ч шалгахгүй.",
        ko: "다른 AI가 이 마이닝 결과를 검토하고 점수를 매기며 무엇이 맞고 틀린지 알려줍니다. AI는 자기 작업을 감사하지 않습니다.",
      },
      lang,
    ),
    choose: pickCopy({ en: "Choose an auditor", mn: "Аудитор сонгох", ko: "감사관 선택" }, lang),
    run: pickCopy({ en: "Run audit", mn: "Аудит хийх", ko: "감사 실행" }, lang),
    running: pickCopy({ en: "Auditing…", mn: "Шалгаж байна…", ko: "감사 중…" }, lang),
    ready: pickCopy({ en: "Ready", mn: "Бэлэн", ko: "준비됨" }, lang),
    needsKey: pickCopy({ en: "Needs key", mn: "Түлхүүр хэрэгтэй", ko: "키 필요" }, lang),
    minedByLabel: pickCopy({ en: "Mined by", mn: "Олборлосон", ko: "마이닝한 AI" }, lang),
    none: pickCopy({ en: "No audit yet.", mn: "Одоогоор аудит алга.", ko: "아직 감사가 없습니다." }, lang),
    see: pickCopy({ en: "See the result", mn: "Үр дүнг харах", ko: "결과 보기" }, lang),
    hide: pickCopy({ en: "Hide the result", mn: "Үр дүнг нуух", ko: "결과 숨기기" }, lang),
    fix: pickCopy({ en: "Fix the result", mn: "Үр дүнг засах", ko: "결과 수정" }, lang),
    use: pickCopy({ en: "Use for Core Brain", mn: "Гол тархинд ашиглах", ko: "코어 브레인에 사용" }, lang),
    used: pickCopy({ en: "Feeding the Core Brain", mn: "Гол тархийг тэжээж байна", ko: "코어 브레인에 반영 중" }, lang),
    score: pickCopy({ en: "Score", mn: "Оноо", ko: "점수" }, lang),
    right: pickCopy({ en: "What is right", mn: "Юу зөв байна", ko: "잘된 점" }, lang),
    wrong: pickCopy({ en: "What is wrong", mn: "Юу буруу байна", ko: "잘못된 점" }, lang),
    advice: pickCopy({ en: "Recommendations", mn: "Зөвлөмж", ko: "권장 사항" }, lang),
    own: pickCopy({ en: "The auditor's own result", mn: "Аудиторын өөрийн үр дүн", ko: "감사관의 자체 결과" }, lang),
    noSource: pickCopy(
      {
        en: "This mind has no saved video row, so a fix cannot be sent back to mining.",
        mn: "Энэ оюунд хадгалсан видеоны мөр байхгүй тул засварыг олборлолт руу буцаах боломжгүй.",
        ko: "이 마인드에는 저장된 영상 항목이 없어 수정을 마이닝으로 보낼 수 없습니다.",
      },
      lang,
    ),
    sentToMiner: pickCopy(
      { en: "Sent to mining with", mn: "Олборлолт руу илгээлээ:", ko: "다음 AI로 마이닝에 전달됨:" },
      lang,
    ),
    close: pickCopy({ en: "Close", mn: "Хаах", ko: "닫기" }, lang),
    saved: pickCopy({ en: "Audit saved", mn: "Аудит хадгалагдлаа", ko: "감사 저장됨" }, lang),
    refreshPersona: pickCopy({ en: "Refresh personality", mn: "Дүрийн мэдээлэл шинэчлэх", ko: "인물 정보 새로고침" }, lang),
    refreshingPersona: pickCopy({ en: "Refreshing…", mn: "Шинэчилж байна…", ko: "새로고침 중…" }, lang),
    undoPersona: pickCopy({ en: "Undo refresh", mn: "Шинэчлэл буцаах", ko: "새로고침 취소" }, lang),
    refreshedPersona: pickCopy({ en: "Personality refreshed", mn: "Дүрийн мэдээлэл шинэчлэгдлээ", ko: "인물 정보가 새로고침됨" }, lang),
  };

  useEffect(() => {
    void loadMinerChoice().then(setChoice);
  }, []);

  const { data: readiness } = useQuery({
    queryKey: ["miner-readiness", choice.id, choice.custom.endpoint],
    queryFn: () => minerReadiness(choice),
  });

  const options = useMemo(() => auditorsFor(payload, choice), [payload, choice]);
  const audits = useMemo(() => auditsOf(payload), [payload]);
  const chosen = chosenAuditId(payload);
  const miner = minedBy(payload);

  useEffect(() => {
    if (options.length && !options.some((o) => o.id === auditor)) setAuditor(options[0]!.id);
  }, [options, auditor]);

  const audit = useMutation({
    mutationFn: async () => {
      const record = await runAudit(auditor, choice, payload);
      await store({ data: { vaultId, audit: record as never } });
      return record;
    },
    onSuccess: async () => {
      toast.success(t.saved);
      await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
      await onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const choose = useMutation({
    mutationFn: (auditId: string | null) => pick({ data: { vaultId, auditId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
      await onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const personaRefresh = useMutation({
    mutationFn: () => refreshPersona({ data: { vaultId } }),
    onSuccess: async () => {
      toast.success(t.refreshedPersona, {
        action: { label: t.undoPersona, onClick: () => void undoPersona({ data: { vaultId } }).then(() => onChanged()) },
      });
      await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
      await onChanged();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const sendToMiner = (record: AuditRecord) => {
    if (!sourceId) {
      toast.error(t.noSource);
      return;
    }
    window.localStorage.setItem("evermind.mine-batch", JSON.stringify([sourceId]));
    window.localStorage.setItem("evermind.mine-ai", JSON.stringify({ [sourceId]: record.auditorId }));
    window.localStorage.setItem("evermind.mine-step", "3");
    toast.success(`${t.sentToMiner} ${record.auditorLabel}`);
    void navigate({ to: "/creator" });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/90 p-4">
      <div className="w-full max-w-2xl space-y-4 rounded-[12px] border border-border bg-card p-4">
        <div className="flex items-start gap-2">
          <Gavel className="mt-0.5 h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {t.title} — {title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t.intro}</p>
            {miner && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t.minedByLabel}: {miner}
              </p>
            )}
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

        <div className="rounded-lg border border-border bg-background p-3">
          <p className="text-xs font-medium text-foreground">{t.choose}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {options.map((o) => {
              const isReady = o.id === "gemini" ? true : Boolean(readiness?.[o.id]);
              const active = auditor === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setAuditor(o.id)}
                  className={`rounded-lg border p-2.5 text-left transition-colors ${
                    active ? "border-primary bg-primary/10" : isReady ? "border-emerald-500/50" : "border-border"
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    {o.label}
                    <span className={`text-[10px] ${isReady ? "text-emerald-500" : "text-amber-500"}`}>
                      {isReady ? t.ready : t.needsKey}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{o.capability}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={audit.isPending}
            onClick={() => audit.mutate()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {audit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {audit.isPending ? t.running : t.run}
          </button>
          <button
            type="button"
            disabled={personaRefresh.isPending}
            onClick={() => personaRefresh.mutate()}
            className="ml-2 mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            {personaRefresh.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {personaRefresh.isPending ? t.refreshingPersona : t.refreshPersona}
          </button>
        </div>

        {audits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.none}</p>
        ) : (
          <ul className="space-y-3">
            {audits.map((a) => {
              const shown = openResult === a.id;
              return (
                <li key={a.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {t.title} {a.auditorLabel}
                    </p>
                    <span className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground">
                      {t.score}: {a.score}/100
                    </span>
                    {chosen === a.id && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {t.used}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {a.verdict && <p className="mt-1 text-xs text-muted-foreground">{a.verdict}</p>}

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenResult(shown ? null : a.id)}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground"
                    >
                      {shown ? t.hide : t.see}
                    </button>
                    <button
                      type="button"
                      onClick={() => sendToMiner(a)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      {t.fix}
                    </button>
                    <button
                      type="button"
                      disabled={choose.isPending}
                      onClick={() => choose.mutate(chosen === a.id ? null : a.id)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                        chosen === a.id
                          ? "border border-emerald-500 text-emerald-500"
                          : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {t.use}
                    </button>
                  </div>

                  {shown && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs">
                      <Block title={t.right} items={a.strengths} />
                      <Block title={t.wrong} items={a.issues} />
                      <Block title={t.advice} items={a.recommendations} />
                      <div>
                        <p className="font-semibold text-foreground">{t.own}</p>
                        {a.ownResult.summary && (
                          <p className="mt-1 text-muted-foreground">{a.ownResult.summary}</p>
                        )}
                        <Block title="Topics" items={a.ownResult.topics} />
                        <Block title="Beliefs" items={a.ownResult.beliefs} />
                        <Block title="Skills" items={a.ownResult.skills} />
                        <Block title="Knowledge" items={a.ownResult.knowledge} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <p className="font-semibold text-foreground">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
        {items.map((item, i) => (
          <li key={`${title}-${i}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
