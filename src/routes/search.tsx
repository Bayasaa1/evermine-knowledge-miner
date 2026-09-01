import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search as SearchIcon, Users, FolderOpen, Video, Tag } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { listPublicVisualContent } from "@/lib/projects";
import { Localized } from "@/components/localized";
import { pickCopy, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search Evermind — Personas, projects and mined topics" },
      {
        name: "description",
        content:
          "Search Evermind for creator personas, published projects, mined videos and knowledge topics with instant real-time filters.",
      },
      { property: "og:title", content: "Search Evermind" },
      {
        property: "og:description",
        content: "Find personas, projects, mined videos and topics across the Evermind network.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchPage,
});

type Filter = "all" | "personas" | "projects" | "videos" | "topics";

const COPY = {
  en: {
    title: "Search",
    sub: "Personas, projects, mined videos and knowledge topics.",
    placeholder: "Search minds, creators, topics…",
    all: "All",
    personas: "Personas",
    projects: "Projects",
    videos: "Videos",
    topics: "Topics",
    empty: "No matches yet. Try another word.",
    start: "Start typing to search the whole Evermind network.",
    loading: "Searching…",
  },
  mn: {
    title: "Хайлт",
    sub: "Дүр, төсөл, задлагдсан бичлэг, мэдлэгийн сэдвүүд.",
    placeholder: "Оюун, бүтээгч, сэдэв хайх…",
    all: "Бүгд",
    personas: "Дүрүүд",
    projects: "Төслүүд",
    videos: "Бичлэгүүд",
    topics: "Сэдвүүд",
    empty: "Илэрц алга. Өөр үг оруулна уу.",
    start: "Хайхын тулд бичиж эхлээрэй.",
    loading: "Хайж байна…",
  },
  ko: {
    title: "검색",
    sub: "페르소나, 프로젝트, 마이닝된 영상과 지식 주제.",
    placeholder: "마인드, 크리에이터, 주제 검색…",
    all: "전체",
    personas: "페르소나",
    projects: "프로젝트",
    videos: "영상",
    topics: "주제",
    empty: "결과가 없습니다. 다른 단어로 검색해 보세요.",
    start: "검색을 시작하려면 입력하세요.",
    loading: "검색 중…",
  },
};

type Hit = {
  id: string;
  kind: Exclude<Filter, "all">;
  title: string;
  subtitle: string;
  tags: string[];
  avatar?: string | null;
};

async function loadIndex(): Promise<Hit[]> {
  const [projects, content, personas] = await Promise.all([
    supabase
      .from("projects")
      .select("id,title,description,creator_name,creator_avatar_url")
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(200)
      .then((r) => r.data ?? []),
    listPublicVisualContent(200).catch(() => []),
    supabase
      .from("creator_personas")
      .select("id,name,handle,bio,avatar_url")
      .limit(100)
      .then((r) => r.data ?? []),
  ]);

  const hits: Hit[] = [];
  for (const p of personas) {
    hits.push({
      id: `persona:${p.id}`,
      kind: "personas",
      title: p.name,
      subtitle: p.handle,
      tags: [],
      avatar: p.avatar_url,
    });
  }
  for (const p of projects) {
    hits.push({
      id: `project:${p.id}`,
      kind: "projects",
      title: p.title,
      subtitle: p.creator_name,
      tags: [],
      avatar: p.creator_avatar_url,
    });
  }
  const topics = new Map<string, number>();
  for (const c of content) {
    hits.push({
      id: `video:${c.id}`,
      kind: "videos",
      title: c.title,
      subtitle: c.project?.creator_name ?? "",
      tags: c.tags.slice(0, 4),
      avatar: c.youtube_id ? `https://i.ytimg.com/vi/${c.youtube_id}/default.jpg` : null,
    });
    for (const tag of c.tags) topics.set(tag, (topics.get(tag) ?? 0) + 1);
  }
  for (const [tag, count] of topics) {
    hits.push({ id: `topic:${tag}`, kind: "topics", title: tag, subtitle: `${count}`, tags: [] });
  }
  return hits;
}

const ICONS = { personas: Users, projects: FolderOpen, videos: Video, topics: Tag } as const;

function SearchPage() {
  const { lang } = useLang();
  const t = pickCopy(COPY, lang);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const { data: index = [], isLoading } = useQuery({
    queryKey: ["search-index"],
    queryFn: loadIndex,
    staleTime: 30_000,
  });

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return index
      .filter((h) => (filter === "all" ? true : h.kind === filter))
      .filter(
        (h) =>
          !needle ||
          h.title.toLowerCase().includes(needle) ||
          h.subtitle.toLowerCase().includes(needle) ||
          h.tags.some((tag) => tag.toLowerCase().includes(needle)),
      )
      .slice(0, 80);
  }, [index, q, filter]);

  const chips: Filter[] = ["all", "personas", "projects", "videos", "topics"];

  return (
    <div className="min-h-screen bg-background px-4 pb-28 pt-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold text-foreground">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.sub}</p>

        <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                filter === c
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t[c]}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">{t.loading}</p>}
          {!isLoading && !index.length && <p className="text-sm text-muted-foreground">{t.start}</p>}
          {!isLoading && index.length > 0 && !results.length && (
            <p className="text-sm text-muted-foreground">{t.empty}</p>
          )}
          {results.map((hit) => {
            const Icon = ICONS[hit.kind];
            return (
              <button
                key={hit.id}
                type="button"
                onClick={() => void navigate({ to: hit.kind === "personas" ? "/vaults" : "/" })}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted"
              >
                {hit.avatar ? (
                  <img src={hit.avatar} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    <Localized text={hit.title} />
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {t[hit.kind]} · <Localized text={hit.subtitle} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
