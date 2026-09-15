/**
 * Manage a thousand videos: a sortable, searchable table with bulk actions.
 *
 * The map answers "what is in this brain"; this table answers "fix these forty
 * rows". Both read the same project, so a creator never has to hunt for a video
 * by dragging a canvas around.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { listProjectVideos, rebuildProjectConcepts } from "@/lib/knowledge-graph.functions";
import { permanentlyDeleteVideo } from "@/lib/content-delete.functions";
import { listProjectsByPersona, moveProjectContent, updateProjectContent, type Project } from "@/lib/projects";
import { pickCopy, type Lang } from "@/lib/i18n";

const PAGE = 25;

const C = {
  title: { en: "All videos", mn: "Бүх видео", ko: "모든 영상" },
  search: { en: "Search by title", mn: "Гарчгаар хайх", ko: "제목으로 검색" },
  selected: { en: "{n} selected", mn: "{n} сонгосон", ko: "{n}개 선택됨" },
  moveTo: { en: "Move to project", mn: "Төсөл рүү зөөх", ko: "프로젝트로 이동" },
  makeFeed: { en: "Show in feed", mn: "Хуудсанд харуулах", ko: "피드에 표시" },
  makeTraining: { en: "Training only", mn: "Зөвхөн сургалт", ko: "학습 전용" },
  remove: { en: "Delete", mn: "Устгах", ko: "삭제" },
  confirm: {
    en: "Delete the selected videos for good? This cannot be undone.",
    mn: "Сонгосон видеог бүрмөсөн устгах уу? Буцаах боломжгүй.",
    ko: "선택한 영상을 영구 삭제할까요? 되돌릴 수 없습니다.",
  },
  done: { en: "Done", mn: "Боллоо", ko: "완료" },
  empty: { en: "No videos match.", mn: "Тохирох видео алга.", ko: "일치하는 영상이 없습니다." },
  colTitle: { en: "Video", mn: "Видео", ko: "영상" },
  colKind: { en: "Use", mn: "Ашиглалт", ko: "용도" },
  colTags: { en: "Topics", mn: "Сэдэв", ko: "주제" },
  colDate: { en: "Added", mn: "Нэмсэн", ko: "추가됨" },
  feed: { en: "Feed", mn: "Хуудас", ko: "피드" },
  training: { en: "Training", mn: "Сургалт", ko: "학습" },
} as const;

export function ProjectContentTable({
  lang = "en",
  userId,
  project,
  onChanged,
}: {
  lang?: Lang;
  userId: string;
  project: Project;
  onChanged?: () => void;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const queryClient = useQueryClient();
  const fetchVideos = useServerFn(listProjectVideos);
  const removeVideo = useServerFn(permanentlyDeleteVideo);
  const rebuildConcepts = useServerFn(rebuildProjectConcepts);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["project-table", userId, project.id, search.trim(), page],
    queryFn: () =>
      fetchVideos({
        data: {
          projectId: project.id,
          ...(search.trim() ? { search: search.trim() } : {}),
          offset: page * PAGE,
          limit: PAGE,
        },
      }),
    enabled: Boolean(userId),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", userId, project.persona_id ?? null],
    queryFn: () => listProjectsByPersona(userId, project.persona_id ?? null),
    enabled: Boolean(userId),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const allPicked = useMemo(() => rows.length > 0 && rows.every((r) => picked.includes(r.id)), [rows, picked]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["project-table", userId, project.id] });
    await queryClient.invalidateQueries({ queryKey: ["project-content", userId, project.id] });
    await queryClient.invalidateQueries({ queryKey: ["graph-summary", userId, project.id] });
    setPicked([]);
    onChanged?.();
  };

  const runBulk = async (
    action: (id: string) => Promise<string | null | void>,
    /** Videos that left this project land here; both maps must be refreshed. */
    targetProjectId?: string,
  ) => {
    setBusy(true);
    let failed = 0;
    for (const id of picked) {
      try {
        const error = await action(id);
        if (typeof error === "string" && error) failed += 1;
      } catch {
        failed += 1;
      }
    }
    // The knowledge map counts videos, so it must be re-indexed after a bulk
    // move or delete — otherwise topics keep counting videos that are gone.
    for (const projectId of [project.id, ...(targetProjectId ? [targetProjectId] : [])]) {
      try {
        await rebuildConcepts({ data: { projectId } });
      } catch {
        /* the map can still be rebuilt by hand */
      }
    }
    setBusy(false);
    if (failed > 0) toast.error(`${failed}`);
    else toast.success(t("done"));
    await refresh();
  };

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          {t("title")} <span className="text-muted-foreground">({total})</span>
        </h3>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t("search")}
            className="w-48 rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>
      </header>

      {picked.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
          <span className="font-semibold text-foreground">{t("selected").replace("{n}", String(picked.length))}</span>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              const target = e.target.value;
              e.target.value = "";
              if (target) void runBulk((id) => moveProjectContent(id, target));
            }}
            className="rounded-lg border border-border bg-background px-2 py-1 text-foreground"
          >
            <option value="">{t("moveTo")}</option>
            {projects.filter((p) => p.id !== project.id).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runBulk((id) => updateProjectContent(id, { kind: "VISUAL_CONTENT" }))}
            className="rounded-lg border border-border px-2 py-1 text-foreground"
          >
            {t("makeFeed")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runBulk((id) => updateProjectContent(id, { kind: "TRAINING_ONLY" }))}
            className="rounded-lg border border-border px-2 py-1 text-foreground"
          >
            {t("makeTraining")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(t("confirm"))) return;
              void runBulk(async (id) => { await removeVideo({ data: { contentId: id } }); });
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1 text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("remove")}
          </button>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> …
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="w-8 py-2">
                  <input
                    type="checkbox"
                    checked={allPicked}
                    onChange={(e) =>
                      setPicked(e.target.checked ? [...new Set([...picked, ...rows.map((r) => r.id)])] : [])
                    }
                  />
                </th>
                <th className="py-2">{t("colTitle")}</th>
                <th className="py-2">{t("colKind")}</th>
                <th className="hidden py-2 sm:table-cell">{t("colTags")}</th>
                <th className="hidden py-2 sm:table-cell">{t("colDate")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={picked.includes(row.id)}
                      onChange={(e) =>
                        setPicked(e.target.checked ? [...picked, row.id] : picked.filter((id) => id !== row.id))
                      }
                    />
                  </td>
                  <td className="max-w-[16rem] truncate py-2 text-foreground">{row.title}</td>
                  <td className="py-2 text-muted-foreground">
                    {row.kind === "TRAINING_ONLY" ? t("training") : t("feed")}
                  </td>
                  <td className="hidden max-w-[14rem] truncate py-2 text-muted-foreground sm:table-cell">
                    {row.tags.slice(0, 4).join(", ")}
                  </td>
                  <td className="hidden py-2 text-muted-foreground sm:table-cell">
                    {new Date(row.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border border-border p-1 disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span>{page + 1} / {pages}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-border p-1 disabled:opacity-40">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
