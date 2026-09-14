/**
 * Core Brain Knowledge Map — one project, three zoom levels.
 *
 * The old graph drew every video and every concept of every project at once,
 * which turned a large library into an unreadable wall of text. This one works
 * like a map: you start at the project, open a topic cluster, then open a
 * single video. Each level replaces the previous one, so the canvas holds a few
 * hundred nodes whether the project has ten videos or a thousand.
 *
 * Two projects never share a canvas: a project is its own knowledge space.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Search, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  listProjectVideos,
  projectGraphSummary,
  rebuildProjectConcepts,
  videoConcepts,
} from "@/lib/knowledge-graph.functions";
import {
  buildProjectGraph,
  MAX_NODES,
  NODE_RADIUS,
  type ConceptRow,
  type GraphLevel,
  type GraphNode,
  type VideoRow,
} from "@/lib/knowledge-graph";
import { pickCopy, type Lang } from "@/lib/i18n";

const C = {
  title: { en: "Knowledge map", mn: "Мэдлэгийн зураглал", ko: "지식 지도" },
  desc: {
    en: "Start at the project, open a topic, then open a video. Only what you open is loaded.",
    mn: "Төслөөс эхэлж, сэдэв нээгээд, дараа нь видео нээнэ. Зөвхөн нээсэн зүйл ачаална.",
    ko: "프로젝트에서 시작해 주제를 열고 영상을 엽니다. 연 것만 불러옵니다.",
  },
  search: { en: "Search videos", mn: "Видео хайх", ko: "영상 검색" },
  back: { en: "Back", mn: "Буцах", ko: "뒤로" },
  rebuild: { en: "Rebuild map", mn: "Зураглал шинэчлэх", ko: "지도 다시 만들기" },
  rebuilt: { en: "Map rebuilt", mn: "Зураглал шинэчлэгдлээ", ko: "지도가 다시 만들어졌습니다" },
  needsRebuild: {
    en: "This project was mined before the map existed. Rebuild it once to see its topics.",
    mn: "Энэ төсөл зураглал гарахаас өмнө олборлогдсон. Нэг удаа шинэчилнэ үү.",
    ko: "이 프로젝트는 지도가 생기기 전에 마이닝되었습니다. 한 번 다시 만드세요.",
  },
  empty: {
    en: "No videos in this project yet — mine one to grow the map.",
    mn: "Энэ төсөлд видео алга — нэгийг олборлож зураглалаа ургуулна уу.",
    ko: "이 프로젝트에 영상이 없습니다 — 하나를 마이닝하세요.",
  },
  capped: {
    en: "Showing the biggest {n} of this view — search to find the rest.",
    mn: "Энэ харагдацын хамгийн том {n}-г харуулж байна — үлдсэнийг хайна уу.",
    ko: "이 보기에서 가장 큰 {n}개를 표시합니다 — 나머지는 검색하세요.",
  },
  inspector: { en: "Details", mn: "Дэлгэрэнгүй", ko: "세부 정보" },
  openVideo: { en: "Open video", mn: "Видео нээх", ko: "영상 열기" },
  videos: { en: "videos", mn: "видео", ko: "영상" },
  concepts: { en: "concepts", mn: "ойлголт", ko: "개념" },
  levelProject: { en: "Project", mn: "Төсөл", ko: "프로젝트" },
  more: { en: "more", mn: "бусад", ko: "더" },
} as const;

type Sim = GraphNode & { x: number; y: number; vx: number; vy: number };

const COLORS: Record<GraphNode["kind"], string> = {
  project: "#ff7a45",
  cluster: "#ffb35c",
  content: "#38e1ff",
  concept: "#8be9c8",
};

export function ProjectKnowledgeGraph({
  lang = "en",
  userId,
  project,
}: {
  lang?: Lang;
  userId: string;
  project: { id: string; title: string };
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const queryClient = useQueryClient();

  const fetchSummary = useServerFn(projectGraphSummary);
  const fetchVideos = useServerFn(listProjectVideos);
  const fetchConcepts = useServerFn(videoConcepts);
  const rebuild = useServerFn(rebuildProjectConcepts);

  const [level, setLevel] = useState<GraphLevel>("project");
  const [cluster, setCluster] = useState<ConceptRow | null>(null);
  const [video, setVideo] = useState<VideoRow | null>(null);
  const [search, setSearch] = useState("");
  const [inspect, setInspect] = useState<GraphNode | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["graph-summary", userId, project.id],
    queryFn: () => fetchSummary({ data: { projectId: project.id } }),
    enabled: Boolean(userId),
  });

  // Videos load only for the level that needs them, newest first, one page.
  const wantVideos = level === "cluster" || Boolean(search.trim());
  const { data: videoPage } = useQuery({
    queryKey: ["graph-videos", userId, project.id, cluster?.concept ?? "", cluster?.kind ?? "", search.trim()],
    queryFn: () =>
      fetchVideos({
        data: {
          projectId: project.id,
          ...(cluster && !search.trim() ? { concept: cluster.concept, conceptKind: cluster.kind } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          offset: 0,
          limit: 120,
        },
      }),
    enabled: Boolean(userId) && wantVideos,
  });

  const { data: openConcepts = [] } = useQuery({
    queryKey: ["graph-video-concepts", userId, video?.id ?? ""],
    queryFn: () => fetchConcepts({ data: { contentId: video!.id } }),
    enabled: Boolean(userId && video),
  });

  const graph = useMemo(
    () =>
      buildProjectGraph({
        project,
        level: search.trim() && level === "project" ? "cluster" : level,
        clusters: summary?.clusters ?? [],
        videos: (videoPage?.rows ?? []) as VideoRow[],
        concepts: openConcepts as ConceptRow[],
        openCluster: search.trim() ? null : cluster,
        openVideo: video,
        totals: { videos: summary?.videos ?? 0, concepts: summary?.concepts ?? 0 },
      }),
    [project, level, summary, videoPage, openConcepts, cluster, video, search],
  );

  const goBack = () => {
    if (level === "video") {
      setVideo(null);
      setLevel(cluster ? "cluster" : "project");
      return;
    }
    setCluster(null);
    setLevel("project");
  };

  const openNode = (node: GraphNode) => {
    if (node.kind === "cluster" && node.meta.concept) {
      setCluster({
        concept: node.meta.concept,
        label: node.label.replace(/\s*\(\d+\)$/, ""),
        kind: node.meta.conceptKind ?? "topic",
        count: node.meta.count ?? 0,
      });
      setVideo(null);
      setLevel("cluster");
      return;
    }
    if (node.kind === "content" && node.meta.contentId) {
      const row = (videoPage?.rows ?? []).find((r) => r.id === node.meta.contentId);
      if (row) {
        setVideo(row as VideoRow);
        setLevel("video");
        return;
      }
    }
    setInspect(node);
  };

  const doRebuild = async () => {
    setBusy(true);
    try {
      await rebuild({ data: { projectId: project.id } });
      await queryClient.invalidateQueries({ queryKey: ["graph-summary", userId, project.id] });
      toast.success(t("rebuilt"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
          <p className="text-xs text-muted-foreground">{t("desc")}</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("search")}
            className="w-44 rounded-lg border border-border bg-background py-1.5 pl-8 pr-2 text-xs text-foreground outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => void doRebuild()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t("rebuild")}
        </button>
      </header>

      <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {level !== "project" || search.trim() ? (
          <button
            type="button"
            onClick={() => { setSearch(""); goBack(); }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1"
          >
            <ArrowLeft className="h-3 w-3" /> {t("back")}
          </button>
        ) : null}
        <span className="truncate font-semibold text-foreground">{project.title}</span>
        {cluster && !search.trim() ? <span>/ {cluster.label}</span> : null}
        {video ? <span className="truncate">/ {video.title}</span> : null}
        <span className="ml-auto">
          {summary?.videos ?? 0} {t("videos")} · {summary?.concepts ?? 0} {t("concepts")}
        </span>
      </nav>

      {summary?.needsRebuild ? (
        <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-foreground">{t("needsRebuild")}</p>
      ) : null}

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (summary?.videos ?? 0) === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <GraphCanvas nodes={graph.nodes} links={graph.links} onOpen={openNode} />
      )}

      {graph.nodes.length >= MAX_NODES ? (
        <p className="text-xs text-muted-foreground">{t("capped").replace("{n}", String(MAX_NODES))}</p>
      ) : null}

      <Sheet open={Boolean(inspect)} onOpenChange={(o) => !o && setInspect(null)}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("inspector")}</SheetTitle>
          </SheetHeader>
          {inspect ? (
            <div className="mt-4 space-y-3 text-sm">
              <p className="font-semibold text-foreground">{inspect.label}</p>
              {inspect.meta.detail ? <p className="text-xs text-muted-foreground">{inspect.meta.detail}</p> : null}
              {inspect.meta.overflow ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {inspect.meta.overflow.slice(0, 200).map((o) => (
                    <li key={o.key} className="truncate">• {o.label}</li>
                  ))}
                </ul>
              ) : null}
              {inspect.meta.sourceUrl ? (
                <a
                  href={inspect.meta.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {t("openVideo")}
                </a>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

/** Dependency-free force-directed canvas: pan, zoom, drag, click to open. */
function GraphCanvas({
  nodes,
  links,
  onOpen,
}: {
  nodes: GraphNode[];
  links: { source: string; target: string }[];
  onOpen: (node: GraphNode) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Map<string, Sim>>(new Map());
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{ key: string | null; from: { x: number; y: number } | null; moved: boolean }>({
    key: null,
    from: null,
    moved: false,
  });
  const [hover, setHover] = useState<string | null>(null);

  // Rebuild the simulation whenever the level changes; keep known positions.
  useEffect(() => {
    const next = new Map<string, Sim>();
    nodes.forEach((node, i) => {
      const prev = simRef.current.get(node.key);
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const radius = node.kind === "project" ? 0 : 120 + (i % 7) * 26;
      next.set(node.key, {
        ...node,
        x: prev?.x ?? Math.cos(angle) * radius,
        y: prev?.y ?? Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      });
    });
    simRef.current = next;
  }, [nodes]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    return {
      x: (clientX - rect.left - rect.width / 2 - view.x) / view.scale,
      y: (clientY - rect.top - rect.height / 2 - view.y) / view.scale,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;

    const tick = () => {
      const sims = [...simRef.current.values()];
      // Repulsion between nodes, springs along links, gravity to the centre.
      for (let i = 0; i < sims.length; i += 1) {
        for (let j = i + 1; j < sims.length; j += 1) {
          const a = sims[i]!;
          const b = sims[j]!;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          if (dist > 420) continue;
          const force = Math.min(2200 / (dist * dist), 4);
          dx /= dist;
          dy /= dist;
          a.vx -= dx * force;
          a.vy -= dy * force;
          b.vx += dx * force;
          b.vy += dy * force;
        }
      }
      for (const link of links) {
        const a = simRef.current.get(link.source);
        const b = simRef.current.get(link.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const target = 130;
        const force = (dist - target) * 0.012;
        const ux = dx / dist;
        const uy = dy / dist;
        a.vx += ux * force;
        a.vy += uy * force;
        b.vx -= ux * force;
        b.vy -= uy * force;
      }
      for (const node of sims) {
        if (node.kind === "project") {
          node.x = 0;
          node.y = 0;
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        node.vx -= node.x * 0.0016;
        node.vy -= node.y * 0.0016;
        node.vx *= 0.86;
        node.vy *= 0.86;
        if (dragRef.current.key !== node.key) {
          node.x += node.vx;
          node.y += node.vy;
        }
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const view = viewRef.current;
      ctx.save();
      ctx.translate(width / 2 + view.x, height / 2 + view.y);
      ctx.scale(view.scale, view.scale);

      ctx.lineWidth = 1 / view.scale;
      ctx.strokeStyle = "rgba(148,163,184,0.28)";
      for (const link of links) {
        const a = simRef.current.get(link.source);
        const b = simRef.current.get(link.target);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      for (const node of sims) {
        const radius = NODE_RADIUS[node.kind] * (0.7 + node.weight * 0.5);
        ctx.beginPath();
        ctx.fillStyle = COLORS[node.kind];
        ctx.globalAlpha = hover && hover !== node.key ? 0.55 : 1;
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Labels only where they can be read: hubs always, the rest on zoom or hover.
        const readable = node.kind === "project" || node.kind === "cluster" || view.scale > 0.9 || hover === node.key;
        if (!readable) continue;
        ctx.fillStyle = "rgba(226,232,240,0.92)";
        ctx.font = `${node.kind === "project" ? 14 : 11}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        const label = node.label.length > 30 ? `${node.label.slice(0, 29)}…` : node.label;
        ctx.fillText(label, node.x, node.y + radius + 12);
      }
      ctx.restore();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [links, hover]);

  const nodeAt = (clientX: number, clientY: number): Sim | null => {
    const point = toWorld(clientX, clientY);
    let found: Sim | null = null;
    for (const node of simRef.current.values()) {
      const radius = NODE_RADIUS[node.kind] * (0.7 + node.weight * 0.5) + 6;
      if (Math.hypot(node.x - point.x, node.y - point.y) <= radius) found = node;
    }
    return found;
  };

  return (
    <div className="relative h-[26rem] overflow-hidden rounded-xl border border-border bg-card">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        onPointerDown={(e) => {
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          const node = nodeAt(e.clientX, e.clientY);
          dragRef.current = { key: node?.key ?? null, from: { x: e.clientX, y: e.clientY }, moved: false };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag.from) {
            const node = nodeAt(e.clientX, e.clientY);
            setHover(node?.key ?? null);
            return;
          }
          const dx = e.clientX - drag.from.x;
          const dy = e.clientY - drag.from.y;
          if (Math.hypot(dx, dy) > 4) drag.moved = true;
          if (drag.key) {
            const node = simRef.current.get(drag.key);
            const point = toWorld(e.clientX, e.clientY);
            if (node && node.kind !== "project") {
              node.x = point.x;
              node.y = point.y;
            }
          } else {
            viewRef.current.x += dx;
            viewRef.current.y += dy;
          }
          drag.from = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const drag = dragRef.current;
          if (drag.key && !drag.moved) {
            const node = simRef.current.get(drag.key);
            if (node) onOpen(node);
          }
          dragRef.current = { key: null, from: null, moved: false };
          (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
        }}
        onWheel={(e) => {
          const next = Math.min(3, Math.max(0.35, viewRef.current.scale * (e.deltaY > 0 ? 0.92 : 1.08)));
          viewRef.current.scale = next;
        }}
      />
      <div className="absolute bottom-3 right-3 flex gap-1.5">
        {[
          { icon: ZoomOut, factor: 0.85 },
          { icon: ZoomIn, factor: 1.18 },
        ].map(({ icon: Icon, factor }) => (
          <button
            key={factor}
            type="button"
            onClick={() => {
              viewRef.current.scale = Math.min(3, Math.max(0.35, viewRef.current.scale * factor));
            }}
            className="rounded-lg border border-border bg-background/80 p-1.5 text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
