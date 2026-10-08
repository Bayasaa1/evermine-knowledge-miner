/**
 * Topic map — the mined brain sorted into topics the AI invented itself.
 * Built only after mining, on the creator's own key, one batch per click-loop.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderTree, Loader2, Play, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTopicMap, growTopicMap } from "@/lib/topic-map.functions";
import { pickCopy, type Lang } from "@/lib/i18n";

const C = {
  title: { en: "Topic map", mn: "Сэдвийн газрын зураг", ko: "주제 지도" },
  desc: {
    en: "The AI finds the topics itself and keeps growing them as new videos are mined. Runs on your own key, after mining.",
    mn: "AI сэдвүүдийг өөрөө олж, шинэ бичлэг нэмэгдэх бүрт тэдгээрээ баяжуулна. Mine дууссаны дараа таны өөрийн түлхүүрээр ажиллана.",
    ko: "AI가 주제를 직접 찾고 새 영상이 마이닝될 때마다 키워갑니다. 마이닝 후 내 키로 실행됩니다.",
  },
  build: { en: "Sort into topics", mn: "Сэдвээр ангилах", ko: "주제로 정리" },
  grow: { en: "Add new facts", mn: "Шинэ баримт нэмэх", ko: "새 사실 추가" },
  waiting: { en: "facts waiting", mn: "баримт хүлээгдэж байна", ko: "개 대기 중" },
  allSorted: { en: "All facts sorted", mn: "Бүх баримт ангилагдсан", ko: "모두 정리됨" },
  search: { en: "Search topics and facts…", mn: "Сэдэв, баримтаас хайх…", ko: "주제와 사실 검색…" },
  all: { en: "All", mn: "Бүгд", ko: "전체" },
  empty: { en: "No topics yet.", mn: "Сэдэв алга.", ko: "아직 주제가 없습니다." },
  done: { en: "Topic map updated", mn: "Сэдвийн зураг шинэчлэгдлээ", ko: "주제 지도 업데이트됨" },
} as const;

export function TopicMapPanel({ lang, projectId }: { lang: Lang; projectId: string }) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const qc = useQueryClient();
  const load = useServerFn(getTopicMap);
  const grow = useServerFn(growTopicMap);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const key = ["topic-map", projectId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => load({ data: { projectId } }) });

  const run = useMutation({
    mutationFn: async () => {
      let remaining = Infinity;
      let guard = 0;
      while (remaining > 0 && guard++ < 40) {
        const r = await grow({ data: { projectId } });
        remaining = r.remaining;
        setProgress(r.remaining);
        qc.setQueryData(key, (old: typeof data) => (old ? { ...old, map: r.map, pending: r.remaining } : old));
        if (r.filedNow === 0) break;
      }
    },
    onSuccess: () => toast.success(t("done")),
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => {
      setProgress(null);
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  const map = data?.map ?? null;
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const tp of map?.topics ?? []) m.set(tp.group, (m.get(tp.group) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [map]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (map?.topics ?? [])
      .filter((tp) => !group || tp.group === group)
      .map((tp) => {
        if (!needle) return { tp, facts: tp.facts };
        const hitTopic = `${tp.title} ${tp.summary}`.toLowerCase().includes(needle);
        const facts = hitTopic ? tp.facts : tp.facts.filter((f) => f.text.toLowerCase().includes(needle));
        return { tp, facts };
      })
      .filter((x) => x.facts.length > 0)
      .sort((a, b) => b.facts.length - a.facts.length);
  }, [map, q, group]);

  const pending = data?.pending ?? 0;

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-start gap-3">
        <FolderTree className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("desc")}</p>
        </div>
        <div className="flex items-center gap-2">
          {pending > 0 ? (
            <Badge variant="outline">
              {progress ?? pending} {t("waiting")}
            </Badge>
          ) : map ? (
            <Badge variant="secondary">{t("allSorted")}</Badge>
          ) : null}
          <Button size="sm" disabled={run.isPending || isLoading || pending === 0} onClick={() => run.mutate()}>
            {run.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {map ? t("grow") : t("build")}
          </Button>
        </div>
      </header>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : !map || map.topics.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="pl-8" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setGroup(null)}
              className={`rounded-full border px-2.5 py-1 text-xs ${!group ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {t("all")} · {map.topics.length}
            </button>
            {groups.map(([g, n]) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroup(g === group ? null : g)}
                className={`rounded-full border px-2.5 py-1 text-xs ${g === group ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                {g} · {n}
              </button>
            ))}
          </div>
          <ul className="space-y-2">
            {shown.map(({ tp, facts }) => (
              <li key={tp.id} className="rounded-lg border border-border bg-background">
                <button
                  type="button"
                  onClick={() => setOpen(open === tp.id ? null : tp.id)}
                  className="flex w-full items-start gap-2 p-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{tp.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{tp.summary}</p>
                  </div>
                  <Badge variant="outline">{facts.length}</Badge>
                </button>
                {open === tp.id || q.trim() ? (
                  <ul className="space-y-1.5 border-t border-border p-3">
                    {facts.map((f) => (
                      <li key={f.id} className="flex gap-2 text-xs text-foreground">
                        {f.videoId && f.ts ? (
                          <a
                            href={`https://www.youtube.com/watch?v=${f.videoId}&t=${secs(f.ts)}s`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 font-mono text-primary"
                          >
                            <Play className="h-3 w-3" />
                            {f.ts}
                          </a>
                        ) : null}
                        <span className="min-w-0">{f.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function secs(ts: string): number {
  const p = ts.split(":").map(Number);
  if (p.some((n) => !Number.isFinite(n))) return 0;
  return p.reduce((a, n) => a * 60 + n, 0);
}
