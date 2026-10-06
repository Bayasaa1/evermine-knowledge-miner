import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fixMinedVideo, listSubtitleHealth, repairTimings, retimeContent, type SubtitleHealthRow } from "@/lib/retime.functions";
import { pickCopy, useLang } from "@/lib/i18n";
import type { MineProblem } from "@/lib/subtitle-health";
import { OwnerSpeakerPicker } from "@/components/owner-speaker-picker";

const FIX_COPY = {
  en: {
    problems: "Problems found",
    time_jump: "Clock jumped out of the video — later subtitles disappear",
    foreign_lines: "AI summary lines in another language mixed into the subtitles",
    empty_part: "This part came back with no subtitles",
    unfinished: "Not mined yet",
    lines: "lines",
    fix: "Fix with Gemini",
    fixing: "Gemini is re-mining the broken parts…",
    fixed: (n: number) => n ? `Re-mined ${n} part(s) and rebuilt the subtitles.` : "Subtitles rebuilt with the new rules.",
    more: (n: number) => ` ${n} more part(s) left — press again.`,
    noRecord: "No mining record — mine this video again.",
  },
  mn: {
    problems: "Илэрсэн асуудал",
    time_jump: "Цаг видеоноос үсэрсэн — цаашдын хадмал алга болно",
    foreign_lines: "Хадмал дунд өөр хэлээр AI-ийн хураангуй холилдсон",
    empty_part: "Энэ хэсэг хадмалгүй гарсан",
    unfinished: "Хараахан mine хийгдээгүй",
    lines: "мөр",
    fix: "Gemini-ээр засах",
    fixing: "Gemini эвдэрсэн хэсгүүдийг дахин mine хийж байна…",
    fixed: (n: number) => n ? `${n} хэсгийг дахин mine хийж, хадмалыг шинэчиллээ.` : "Шинэ дүрмээр хадмалыг шинэчиллээ.",
    more: (n: number) => ` Дахиад ${n} хэсэг үлдсэн — дахин дарна уу.`,
    noRecord: "Mine хийсэн бүртгэл алга — бичлэгийг дахин mine хийнэ үү.",
  },
  ko: {
    problems: "발견된 문제",
    time_jump: "시간이 영상 밖으로 튀었습니다 — 이후 자막이 사라집니다",
    foreign_lines: "다른 언어의 AI 요약이 자막에 섞였습니다",
    empty_part: "이 구간에 자막이 없습니다",
    unfinished: "아직 분석되지 않음",
    lines: "줄",
    fix: "Gemini로 고치기",
    fixing: "Gemini가 문제 구간을 다시 분석 중…",
    fixed: (n: number) => n ? `${n}개 구간을 다시 분석하고 자막을 다시 만들었습니다.` : "새 규칙으로 자막을 다시 만들었습니다.",
    more: (n: number) => ` ${n}개 구간이 남았습니다 — 다시 누르세요.`,
    noRecord: "분석 기록이 없습니다 — 영상을 다시 분석하세요.",
  },
};

function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}

function ProblemList({ problems, t }: { problems: MineProblem[]; t: (typeof FIX_COPY)["en"] }) {
  if (!problems.length) return null;
  return (
    <ul className="mt-2 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px]">
      <li className="font-semibold text-destructive">{t.problems}</li>
      {problems.map((p) => (
        <li key={`${p.kind}-${p.part}`} className="text-muted-foreground">
          <span className="font-mono text-foreground">{clock(p.start)}–{clock(p.end)}</span> · {t[p.kind]}
          {p.lines > 0 && p.kind !== "empty_part" ? ` (${p.lines} ${t.lines})` : ""}
        </li>
      ))}
    </ul>
  );
}

const STATUS: Record<SubtitleHealthRow["status"], { label: string; tone: string }> = {
  synced: { label: "In sync", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  drifting: { label: "Drifting", tone: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  untimed: { label: "No timings", tone: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
};

export function SubtitleHealth({ personaId }: { personaId?: string | null }) {
  const client = useQueryClient();
  const load = useServerFn(listSubtitleHealth);
  const retime = useServerFn(retimeContent);
  const repair = useServerFn(repairTimings);
  const geminiFix = useServerFn(fixMinedVideo);
  const { lang } = useLang();
  const t = pickCopy(FIX_COPY, lang);

  /** The panel stays folded away until the creator asks for it. */
  const [open, setOpen] = useState(false);
  /** Rows where the creator explicitly asked to see the paid option. */
  const [showPaid, setShowPaid] = useState<string[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["subtitle-health"],
    queryFn: () => load(),
    enabled: open,
  });

  const fixTimings = useMutation({
    mutationFn: async (v: { contentId: string; mode: "free" | "ai" }) => {
      if (v.mode === "free") return repair({ data: { contentId: v.contentId } });
      return retime({ data: { contentId: v.contentId } });
    },
    onSuccess: (row, v) => {
      toast.success(
        row.status === "synced"
          ? `“${row.title.slice(0, 40)}” is back in sync${v.mode === "free" ? " (estimated timings)" : ""}.`
          : `Repaired, but ${row.untimed + row.outOfOrder} of ${row.total} lines still drift.`,
      );
      void client.invalidateQueries({ queryKey: ["subtitle-health"] });
      void client.invalidateQueries({ queryKey: ["feed"] });
      void client.invalidateQueries({ queryKey: ["vaults"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fixMine = useMutation({
    mutationFn: (contentId: string) => geminiFix({ data: { contentId } }),
    onSuccess: (r) => {
      toast.success(t.fixed(r.remined) + (r.remaining ? t.more(r.remaining) : ""));
      void client.invalidateQueries({ queryKey: ["subtitle-health"] });
      void client.invalidateQueries({ queryKey: ["feed"] });
      void client.invalidateQueries({ queryKey: ["vaults"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Only this persona's videos. Videos never filed under a persona show up in
  // the "All personas" view, so nothing is ever silently hidden.
  const rows = useMemo(() => {
    const all = data ?? [];
    return personaId ? all.filter((r) => r.personaId === personaId) : all;
  }, [data, personaId]);
  const needWork = rows.filter((r) => r.status !== "synced");

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-primary" />
          Subtitle timing
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {open && rows.length > 0 && `${needWork.length} of ${rows.length} need work`}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            Open this only when captions appear too early or too late. Nothing here runs on its own and
            nothing costs anything unless you press the paid button yourself. “In sync” means every line
            already has a time on it — leave those alone.
          </p>

          {isLoading && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your mined videos…
            </p>
          )}
          {error && <p className="mt-3 text-xs text-destructive">{(error as Error).message}</p>}
          {!isLoading && !error && rows.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">No mined videos for this profile yet.</p>
          )}

          <ul className="mt-3 space-y-2">
            {rows.map((row) => {
              const badge = STATUS[row.status];
              const busy = fixTimings.isPending && fixTimings.variables?.contentId === row.contentId;
              const paidVisible = row.status !== "synced" || showPaid.includes(row.contentId);
              return (
                <li
                  key={row.contentId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{row.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {row.total} lines · {row.untimed} without a time · {row.outOfOrder} out of order
                    </p>
                    <ProblemList problems={row.problems} t={t} />
                    <OwnerSpeakerPicker contentId={row.contentId} />
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badge.tone}`}>
                    {row.status === "synced" ? (
                      <CheckCircle2 className="mr-1 inline h-3 w-3" />
                    ) : (
                      <AlertTriangle className="mr-1 inline h-3 w-3" />
                    )}
                    {badge.label}
                  </span>

                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    {row.problems.some((p) => p.kind !== "unfinished") && (
                      <button
                        type="button"
                        disabled={fixMine.isPending || !row.canRemine}
                        title={row.canRemine ? t.fix : t.noRecord}
                        onClick={() => fixMine.mutate(row.contentId)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:flex-none"
                      >
                        {fixMine.isPending && fixMine.variables === row.contentId ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.fixing}</>
                        ) : (
                          <><Sparkles className="h-3.5 w-3.5" /> {t.fix}</>
                        )}
                      </button>
                    )}
                    {row.status !== "synced" && (
                      <button
                        type="button"
                        disabled={fixTimings.isPending}
                        onClick={() => fixTimings.mutate({ contentId: row.contentId, mode: "free" })}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-50 sm:flex-none"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Fix (free)
                      </button>
                    )}

                    {!paidVisible && (
                      <button
                        type="button"
                        onClick={() => setShowPaid((v) => [...v, row.contentId])}
                        className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Still off while watching?
                      </button>
                    )}

                    {paidVisible && (
                      <button
                        type="button"
                        disabled={fixTimings.isPending}
                        onClick={() => fixTimings.mutate({ contentId: row.contentId, mode: "ai" })}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50 sm:flex-none"
                        title="Listens to the video again in short windows — uses AI credits"
                      >
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Re-listen (costs credits)
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
