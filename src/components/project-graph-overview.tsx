/**
 * Persona level of the Core Brain: simple project cards, not a mega-graph.
 *
 * A persona may own many projects, and mixing them on one canvas is exactly
 * what made the old view unreadable. Here each project is a card with its own
 * counts; the map opens inside a project.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Boxes, ChevronRight, Loader2 } from "lucide-react";

import { listProjectOverviews } from "@/lib/knowledge-graph.functions";
import { pickCopy, type Lang } from "@/lib/i18n";

const C = {
  title: { en: "Core Brain by project", mn: "Төслөөр нь Гол Тархи", ko: "프로젝트별 코어 브레인" },
  desc: {
    en: "Each project is its own knowledge space. Open one to see its map.",
    mn: "Төсөл бүр өөрийн мэдлэгийн орон зайтай. Зураглалыг нь харахаар нээнэ үү.",
    ko: "각 프로젝트는 고유한 지식 공간입니다. 열어서 지도를 보세요.",
  },
  empty: {
    en: "No projects yet for this persona.",
    mn: "Энэ персонд төсөл алга.",
    ko: "이 페르소나에는 아직 프로젝트가 없습니다.",
  },
  videos: { en: "videos", mn: "видео", ko: "영상" },
  concepts: { en: "concepts", mn: "ойлголт", ko: "개념" },
  private: { en: "Private", mn: "Хувийн", ko: "비공개" },
  live: { en: "In feed", mn: "Хуудсанд", ko: "피드에 공개" },
} as const;

export function ProjectGraphOverview({
  lang = "en",
  userId,
  personaId,
  onOpen,
}: {
  lang?: Lang;
  userId: string;
  personaId: string | null;
  onOpen: (projectId: string) => void;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const fetchOverviews = useServerFn(listProjectOverviews);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["project-overviews", userId, personaId],
    queryFn: () => fetchOverviews({ data: { personaId } }),
    enabled: Boolean(userId),
  });

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <header>
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">{t("desc")}</p>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> …
        </div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.projectId}>
              <button
                type="button"
                onClick={() => onOpen(p.projectId)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary"
              >
                <Boxes className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{p.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.videos} {t("videos")} · {p.concepts} {t("concepts")} · {p.published ? t("live") : t("private")}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
