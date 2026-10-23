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
  videoParts,
} from "@/lib/knowledge-graph.functions";
import { TopicDetail } from "@/components/topic-detail";
import {
  buildProjectGraph,
  NODE_RADIUS,
  type ConceptRow,
  type GraphLevel,
  type GraphNode,
  type VideoRow,
} from "@/lib/knowledge-graph";
import { pickCopy, type Lang } from "@/lib/i18n";

/** Default node budget so big projects stay smooth; "Show all" lifts it. */
const DEFAULT_NODE_CAP = 60;

const C = {
  showAll: { en: "Show all nodes", mn: "Бүх цэгийг харах", ko: "모든 노드 보기" },
  showTop: { en: "Show top 60", mn: "Шилдэг 60-г харах", ko: "상위 60개 보기" },
  title: { en: "Knowledge map", mn: "Мэдлэгийн зураглал", ko: "지식 지도" },
  desc: {
    en: "Start at the project, open a video, then open a topic to see the explained part.",
    mn: "Төслөөс эхэлж, видео нээгээд, дараа нь сэдэв нээж тайлбарыг харна.",
    ko: "프로젝트에서 시작해 영상을 열고, 주제를 열어 설명을 봅니다.",
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
  const fetchParts = useServerFn(videoParts);
  const rebuild = useServerFn(rebuildProjectConcepts);

  const [level, setLevel] = useState<GraphLevel>("project");
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [video, setVideo] = useState<VideoRow | null>(null);
  const [partIndex, setPartIndex] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [inspect, setInspect] = useState<GraphNode | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["graph-summary", userId, project.id],
    queryFn: () => fetchSummary({ data: { projectId: project.id } }),
    enabled: Boolean(userId),
  });

  // Project level: the project's videos (newest first, one page).
  const { data: videoPage } = useQuery({
    queryKey: ["graph-videos", userId, project.id, search.trim()],
    queryFn: () =>
      fetchVideos({
        data: {
          projectId: project.id,
          ...(search.trim() ? { search: search.trim() } : {}),
          offset: 0,
          limit: 200,
        },
      }),
    enabled: Boolean(userId),
  });

  // Video level: the well-explained parts of the open video.
  const { data: parts } = useQuery({
    queryKey: ["graph-video-parts", userId, video?.id ?? ""],
    queryFn: () => fetchParts({ data: { contentId: video!.id } }),
    enabled: Boolean(userId && video),
  });

  const partConcepts: ConceptRow[] = useMemo(
    () => (parts?.parts ?? []).map((p, i) => ({ concept: String(i), label: p.title, kind: "topic", count: 1 })),
    [parts],
  );

  const graph = useMemo(
    () =>
      buildProjectGraph({
        project,
        level: level === "video" && video ? "video" : "project",
        clusters: [],
        videos: (videoPage?.rows ?? []) as VideoRow[],
        concepts: partConcepts,
        openCluster: null,
        openVideo: video,
        totals: { videos: summary?.videos ?? 0, concepts: summary?.concepts ?? 0 },
      }),
    [project, level, summary, videoPage, partConcepts, video],
  );
  // Keep structural nodes (project/video/cluster) and the 60 heaviest concepts.
  const shown = useMemo(() => {
    if (showAllNodes || graph.nodes.length <= DEFAULT_NODE_CAP) return graph;
    const concepts = graph.nodes.filter((n) => n.kind === "concept").sort((a, b) => b.weight - a.weight);
    const others = graph.nodes.filter((n) => n.kind !== "concept");
    const room = Math.max(0, DEFAULT_NODE_CAP - others.length);
    const keep = new Set([...others, ...concepts.slice(0, room)].map((n) => n.id));
    return {
      ...graph,
      nodes: graph.nodes.filter((n) => keep.has(n.id)),
      links: graph.links.filter((l) => keep.has(l.source) && keep.has(l.target)),
    };
  }, [graph, showAllNodes]);

  const openVideoRow = (id: string) => {
    const row = (videoPage?.rows ?? []).find((r) => r.id === id);
    if (!row) return false;
    setVideo(row as VideoRow);
    setPartIndex(null);
    setLevel("video");
    setInspect(null);
    return true;
  };

  const goBack = () => {
    if (partIndex !== null) { setPartIndex(null); return; }
    setVideo(null);
    setLevel("project");
  };

  const openNode = (node: GraphNode) => {
    if (node.kind === "content" && node.meta.contentId) {
      if (level === "video") return; // the hub itself
      if (openVideoRow(node.meta.contentId)) return;
    }
    if (node.kind === "concept" && node.topic !== "overflow" && node.meta.concept && video) {
      const idx = Number(node.meta.concept.split(":")[0]);
      if (Number.isFinite(idx)) { setPartIndex(idx); return; }
    }
    setInspect(node);
  };

  const part = partIndex !== null ? parts?.parts[partIndex] ?? null : null;

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
            onChange={(e) => { setSearch(e.target.value); setVideo(null); setLevel("project"); }}
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
        {level !== "project" ? (
          <button type="button" onClick={goBack} className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1">
            <ArrowLeft className="h-3 w-3" /> {t("back")}
          </button>
        ) : null}
        <button type="button" onClick={() => { setVideo(null); setPartIndex(null); setLevel("project"); }} className="truncate font-semibold text-foreground">
          {project.title}
        </button>
        {video ? (
          <button type="button" onClick={() => setPartIndex(null)} className="max-w-[16rem] truncate">› {video.title}</button>
        ) : null}
        {part ? <span className="max-w-[14rem] truncate">› {part.title}</span> : null}
        <span className="ml-auto">
          {summary?.videos ?? 0} {t("videos")} · {summary?.concepts ?? 0} {t("concepts")}
        </span>
      </nav>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (summary?.videos ?? 0) === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {graph.nodes.length > DEFAULT_NODE_CAP ? (
            <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>{shown.nodes.length} / {graph.nodes.length}</span>
              <button
                type="button"
                onClick={() => setShowAllNodes((v) => !v)}
                className="rounded-md border border-border px-2 py-1 font-medium text-foreground hover:border-primary"
              >
                {showAllNodes ? t("showTop") : t("showAll")}
              </button>
            </div>
          ) : null}
          <GraphCanvas nodes={shown.nodes} links={shown.links} onOpen={openNode} />
        </>
      )}

      <Sheet open={Boolean(part && parts)} onOpenChange={(o) => !o && setPartIndex(null)}>
        <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("inspector")}</SheetTitle>
          </SheetHeader>
          {part && parts && video ? (
            <TopicDetail lang={lang} part={part} info={parts} videoTitle={video.title} />
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(inspect)} onOpenChange={(o) => !o && setInspect(null)}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("inspector")}</SheetTitle>
          </SheetHeader>
          {inspect ? (
            <div className="mt-4 space-y-3 text-sm">
              <p className="font-semibold text-foreground">{inspect.label}</p>
              {inspect.meta.overflow ? (
                <ul className="space-y-1 text-xs">
                  {inspect.meta.overflow.slice(0, 300).map((o) => (
                    <li key={o.key}>
                      <button
                        type="button"
                        className="w-full truncate text-left text-foreground hover:text-primary"
                        onClick={() => {
                          if (o.key.startsWith("content:")) openVideoRow(o.key.slice(8));
                          else if (video) { const i = Number(o.key.split(":").pop()?.split(":")[0]); if (Number.isFinite(i)) { setPartIndex(i); setInspect(null); } }
                        }}
                      >
                        • {o.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {inspect.meta.sourceUrl ? (
                <a href={inspect.meta.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary">
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
          const force = Math.min(4200 / (dist * dist), 5);
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
        const target = 170;
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

        // Labels only where they can be read: the hub, small views, hover or zoom.
        const readable = node.kind === "project" || sims.length <= 14 || view.scale > 1.2 || hover === node.key;
        if (!readable) continue;
        ctx.fillStyle = "rgba(226,232,240,0.92)";
        ctx.font = `${node.kind === "project" ? 14 : 11}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        const max = hover === node.key ? 60 : 22;
        const label = node.label.length > max ? `${node.label.slice(0, max - 1)}…` : node.label;
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
