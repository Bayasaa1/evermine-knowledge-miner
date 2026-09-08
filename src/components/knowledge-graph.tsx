/**
 * Obsidian-style Core Brain Knowledge Graph.
 *
 * A dependency-free force-directed canvas: the persona sits at the centre, its
 * projects orbit around it, mined videos hang off the projects and extracted
 * concepts (topics, lessons, emotions) form the outer constellation.
 *
 * Interactions: pan, wheel zoom, pinch-to-zoom, node drag, search, topic
 * filter, camera reset, an inspector drawer per node and a link mode that lets
 * the creator drag their own connection between two nodes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, Maximize, Search, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { listVaults, updateVault, type VaultRow } from "@/lib/cloud-vault.functions";
import {
  deleteProject,
  listProjectContent,
  listProjectsByPersona,
  moveProjectContent,
  updateProject,
  updateProjectContent,
  type Project,
  type ProjectContent,
} from "@/lib/projects";
import { permanentlyDeleteVideo } from "@/lib/content-delete.functions";
import {
  buildGraph,
  createCustomLink,
  deleteCustomLink,
  listCustomLinks,
  NODE_RADIUS,
  type GraphNode,
} from "@/lib/knowledge-graph";
import { pickCopy, type Lang } from "@/lib/i18n";

const C = {
  title: { en: "Core Brain Knowledge Graph", mn: "Гол Тархины Мэдлэгийн Граф", ko: "코어 브레인 지식 그래프" },
  desc: {
    en: "Every mined video expands this constellation. Drag nodes, pinch to zoom, tap a node to inspect it.",
    mn: "Олборлосон видео бүр энэ оддын бүлгийг тэлнэ. Зангилааг чирч, томруулж, дарж шалгана уу.",
    ko: "마이닝된 모든 영상이 이 성좌를 확장합니다. 노드를 끌고, 확대하고, 눌러 검사하세요.",
  },
  search: { en: "Search nodes", mn: "Зангилаа хайх", ko: "노드 검색" },
  allTopics: { en: "All topics", mn: "Бүх сэдэв", ko: "모든 주제" },
  reset: { en: "Reset view", mn: "Харагдацыг сэргээх", ko: "보기 초기화" },
  linkMode: { en: "Link mode", mn: "Холбох горим", ko: "링크 모드" },
  linked: { en: "Nodes linked", mn: "Зангилаа холбогдлоо", ko: "노드가 연결되었습니다" },
  empty: {
    en: "No knowledge yet — mine a video for this persona to grow the graph.",
    mn: "Мэдлэг алга — энэ персонд видео олборлоно уу.",
    ko: "아직 지식이 없습니다 — 이 페르소나로 영상을 마이닝하세요.",
  },
  inspector: { en: "Node inspector", mn: "Зангилааны шинжүүр", ko: "노드 인스펙터" },
  connect: { en: "Connect to project", mn: "Төсөлд холбох", ko: "프로젝트에 연결" },
  noProject: { en: "Not in a project", mn: "Төсөлгүй", ko: "프로젝트 없음" },
  connected: { en: "Connected to project", mn: "Төсөлд холбогдлоо", ko: "프로젝트에 연결됨" },
  rename: { en: "Rename", mn: "Нэр солих", ko: "이름 변경" },
  remove: { en: "Delete", mn: "Устгах", ko: "삭제" },
  saved: { en: "Saved", mn: "Хадгаллаа", ko: "저장됨" },
  removed: { en: "Deleted", mn: "Устгалаа", ko: "삭제됨" },
  payload: { en: "Raw .json.md payload", mn: "Түүхий .json.md", ko: "원본 .json.md" },
  source: { en: "Source video", mn: "Эх видео", ko: "원본 영상" },
  customLinks: { en: "Your links", mn: "Таны холбоос", ko: "내 링크" },
} as const;

type Sim = GraphNode & { x: number; y: number; vx: number; vy: number };

const COLORS: Record<GraphNode["kind"], string> = {
  persona: "#ff7a45",
  project: "#ffb35c",
  content: "#38e1ff",
  concept: "#8be9c8",
};

export function KnowledgeGraph({
  lang = "en",
  userId,
  personaId,
  personaName,
}: {
  lang?: Lang;
  userId: string;
  personaId: string | null;
  personaName: string;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const queryClient = useQueryClient();
  const fetchVaults = useServerFn(listVaults);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", userId, personaId],
    queryFn: () => listProjectsByPersona(userId, personaId),
  });

  const projectIds = projects.map((p) => p.id).join(",");
  const { data: content = [], isLoading } = useQuery<ProjectContent[]>({
    queryKey: ["graph-content", projectIds],
    queryFn: async () => {
      const all = await Promise.all(projects.map((p) => listProjectContent(p.id)));
      return all.flat();
    },
    enabled: projects.length >= 0,
  });

  const { data: vaults = [] } = useQuery<VaultRow[]>({
    queryKey: ["graph-vaults", personaId],
    queryFn: () => fetchVaults({ data: { scoped: true, personaId } }),
  });

  const { data: customLinks = [] } = useQuery({
    queryKey: ["graph-links", userId, personaId],
    queryFn: () => listCustomLinks(userId, personaId),
  });

  const graph = useMemo(
    () => buildGraph({ personaKey: personaId ?? "master", personaName, projects, content, vaults, customLinks }),
    [personaId, personaName, projects, content, vaults, customLinks],
  );

  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [linkMode, setLinkMode] = useState(false);
  const [inspect, setInspect] = useState<GraphNode | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  const visible = useMemo(() => {
    const nodes = graph.nodes.filter((n) => !hidden.includes(n.key) && (!topic || n.kind !== "concept" || n.topic === topic));
    const keys = new Set(nodes.map((n) => n.key));
    return { nodes, links: graph.links.filter((l) => keys.has(l.source) && keys.has(l.target)) };
  }, [graph, topic, hidden]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Map<string, Sim>>(new Map());
  const viewRef = useRef({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{ key: string | null; pointer: { x: number; y: number } | null; pan: boolean }>({
    key: null,
    pointer: null,
    pan: false,
  });
  const linkDragRef = useRef<{ from: string; x: number; y: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<number | null>(null);
  const highlightRef = useRef("");
  highlightRef.current = query.trim().toLowerCase();

  // Seed / prune simulation bodies whenever the visible node set changes.
  useEffect(() => {
    const sim = simRef.current;
    const keys = new Set(visible.nodes.map((n) => n.key));
    for (const key of [...sim.keys()]) if (!keys.has(key)) sim.delete(key);
    visible.nodes.forEach((node, i) => {
      const existing = sim.get(node.key);
      if (existing) {
        Object.assign(existing, node);
        return;
      }
      const angle = (i / Math.max(1, visible.nodes.length)) * Math.PI * 2;
      const ring = node.kind === "persona" ? 0 : node.kind === "project" ? 120 : node.kind === "content" ? 220 : 320;
      sim.set(node.key, { ...node, x: Math.cos(angle) * ring, y: Math.sin(angle) * ring, vx: 0, vy: 0 });
    });
  }, [visible.nodes]);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - rect.left - rect.width / 2 - v.x) / v.scale,
      y: (clientY - rect.top - rect.height / 2 - v.y) / v.scale,
    };
  }, []);

  const nodeAt = useCallback((wx: number, wy: number): Sim | null => {
    let hit: Sim | null = null;
    for (const node of simRef.current.values()) {
      const r = NODE_RADIUS[node.kind] + 6;
      if ((node.x - wx) ** 2 + (node.y - wy) ** 2 <= r * r) hit = node;
    }
    return hit;
  }, []);

  // Physics + rendering loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let alpha = 1;

    const tick = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }

      const bodies = [...simRef.current.values()];
      // Repulsion (capped so very large brains stay smooth).
      const limit = Math.min(bodies.length, 420);
      for (let i = 0; i < limit; i++) {
        const a = bodies[i]!;
        for (let j = i + 1; j < limit; j++) {
          const b = bodies[j]!;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 1;
          }
          const force = (1600 * alpha) / d2;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * force;
          a.vy += (dy / d) * force;
          b.vx -= (dx / d) * force;
          b.vy -= (dy / d) * force;
        }
      }
      // Springs.
      for (const l of visible.links) {
        const a = simRef.current.get(l.source);
        const b = simRef.current.get(l.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        const rest = a.kind === "persona" || b.kind === "persona" ? 150 : 90;
        const k = 0.008 * alpha * (d - rest);
        a.vx += (dx / d) * k;
        a.vy += (dy / d) * k;
        b.vx -= (dx / d) * k;
        b.vy -= (dy / d) * k;
      }
      for (const node of bodies) {
        if (node.kind === "persona") {
          node.x += (0 - node.x) * 0.2;
          node.y += (0 - node.y) * 0.2;
          node.vx = 0;
          node.vy = 0;
          continue;
        }
        if (dragRef.current.key === node.key) continue;
        node.vx = (node.vx - node.x * 0.0015) * 0.82;
        node.vy = (node.vy - node.y * 0.0015) * 0.82;
        node.x += node.vx;
        node.y += node.vy;
      }
      alpha = Math.max(0.05, alpha * 0.995);

      // Draw.
      const v = viewRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + v.x, h / 2 + v.y);
      ctx.scale(v.scale, v.scale);

      for (const l of visible.links) {
        const a = simRef.current.get(l.source);
        const b = simRef.current.get(l.target);
        if (!a || !b) continue;
        ctx.strokeStyle = l.custom ? "rgba(56,225,255,0.75)" : "rgba(255,122,69,0.28)";
        ctx.lineWidth = l.custom ? 1.6 : 0.9;
        ctx.shadowBlur = l.custom ? 10 : 6;
        ctx.shadowColor = l.custom ? "#38e1ff" : "#ff7a45";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      const pending = linkDragRef.current;
      if (pending) {
        const a = simRef.current.get(pending.from);
        if (a) {
          ctx.strokeStyle = "rgba(56,225,255,0.9)";
          ctx.setLineDash([6, 6]);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pending.x, pending.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      const needle = highlightRef.current;
      for (const node of bodies) {
        const r = NODE_RADIUS[node.kind];
        const match = !needle || node.label.toLowerCase().includes(needle);
        const color = COLORS[node.kind];
        ctx.globalAlpha = match ? 1 : 0.18;
        ctx.shadowBlur = match ? 18 : 0;
        ctx.shadowColor = color;
        ctx.fillStyle = `${color}33`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.stroke();

        if (v.scale > 0.55 && (node.kind !== "concept" || v.scale > 1 || !!needle)) {
          ctx.fillStyle = "rgba(233,238,250,0.85)";
          ctx.font = `${node.kind === "persona" ? 13 : 10}px ui-sans-serif, system-ui`;
          ctx.textAlign = "center";
          ctx.fillText(node.label.slice(0, 26), node.x, node.y + r + 12);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  const zoomBy = (factor: number) => {
    const v = viewRef.current;
    v.scale = Math.min(4, Math.max(0.25, v.scale * factor));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    const node = nodeAt(w.x, w.y);
    if (node && linkMode) {
      linkDragRef.current = { from: node.key, x: w.x, y: w.y };
      return;
    }
    dragRef.current = { key: node?.key ?? null, pointer: { x: e.clientX, y: e.clientY }, pan: !node };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomBy(dist / pinchRef.current);
      pinchRef.current = dist;
      return;
    }
    if (linkDragRef.current) {
      const w = toWorld(e.clientX, e.clientY);
      linkDragRef.current = { ...linkDragRef.current, x: w.x, y: w.y };
      return;
    }
    const drag = dragRef.current;
    if (!drag.pointer) return;
    const dx = e.clientX - drag.pointer.x;
    const dy = e.clientY - drag.pointer.y;
    drag.pointer = { x: e.clientX, y: e.clientY };
    if (drag.pan) {
      viewRef.current.x += dx;
      viewRef.current.y += dy;
    } else if (drag.key) {
      const node = simRef.current.get(drag.key);
      if (node) {
        node.x += dx / viewRef.current.scale;
        node.y += dy / viewRef.current.scale;
        node.vx = 0;
        node.vy = 0;
      }
    }
  };

  const onPointerUp = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    const pending = linkDragRef.current;
    if (pending) {
      linkDragRef.current = null;
      const w = toWorld(e.clientX, e.clientY);
      const target = nodeAt(w.x, w.y);
      if (target && target.key !== pending.from) {
        const error = await createCustomLink(userId, personaId, pending.from, target.key);
        if (error) toast.error(error);
        else {
          toast.success(t("linked"));
          await queryClient.invalidateQueries({ queryKey: ["graph-links", userId, personaId] });
        }
      }
      return;
    }

    const drag = dragRef.current;
    const moved = drag.pointer ? Math.abs(drag.pointer.x - e.clientX) + Math.abs(drag.pointer.y - e.clientY) : 0;
    dragRef.current = { key: null, pointer: null, pan: false };
    if (!drag.pan && drag.key && moved < 6) {
      const node = graph.nodes.find((n) => n.key === drag.key);
      if (node) setInspect(node);
    }
  };

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["graph-content"] }),
      queryClient.invalidateQueries({ queryKey: ["graph-vaults", personaId] }),
      queryClient.invalidateQueries({ queryKey: ["projects", userId, personaId] }),
      queryClient.invalidateQueries({ queryKey: ["project-content"] }),
      queryClient.invalidateQueries({ queryKey: ["home-feed"] }),
    ]);
  };

  return (
    <section className="min-w-0 space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("desc")}</p>
        </div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-xs text-foreground outline-none focus:border-primary"
          />
        </label>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-2 text-xs text-foreground outline-none focus:border-primary"
        >
          <option value="">{t("allTopics")}</option>
          {graph.topics.map((tp) => (
            <option key={tp} value={tp}>
              {tp}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.25)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">
          <ZoomIn className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.8)} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => { viewRef.current = { scale: 1, x: 0, y: 0 }; }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
        >
          <Maximize className="h-3.5 w-3.5" /> {t("reset")}
        </button>
        <button
          type="button"
          onClick={() => setLinkMode((s) => !s)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${
            linkMode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          <Link2 className="h-3.5 w-3.5" /> {t("linkMode")}
        </button>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border" style={{ background: "#0b0f19" }}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => void onPointerUp(e)}
          onPointerCancel={(e) => void onPointerUp(e)}
          onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.1 : 0.9)}
          className="h-[320px] w-full touch-none sm:h-[420px] lg:h-[520px]"
        />
        {visible.nodes.length <= 1 && !isLoading ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}
      </div>

      <Sheet open={!!inspect} onOpenChange={(o) => { if (!o) setInspect(null); }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="truncate">{inspect?.label ?? t("inspector")}</SheetTitle>
          </SheetHeader>
          {inspect ? (
            <NodeInspector
              lang={lang}
              node={inspect}
              customLinkIds={graph.links
                .filter((l) => l.custom && (l.source === inspect.key || l.target === inspect.key))
                .map((l) => l.id!)
                .filter(Boolean)}
              onClose={() => setInspect(null)}
              onHide={(key) => setHidden((h) => [...h, key])}
              onChanged={refreshAll}
              onLinksChanged={async () => {
                await queryClient.invalidateQueries({ queryKey: ["graph-links", userId, personaId] });
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function NodeInspector({
  lang,
  node,
  customLinkIds,
  onClose,
  onHide,
  onChanged,
  onLinksChanged,
}: {
  lang: Lang;
  node: GraphNode;
  customLinkIds: string[];
  onClose: () => void;
  onHide: (key: string) => void;
  onChanged: () => Promise<void>;
  onLinksChanged: () => Promise<void>;
}) {
  const removeVideo = useServerFn(permanentlyDeleteVideo);
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const [label, setLabel] = useState(node.label);
  const [busy, setBusy] = useState(false);
  useEffect(() => setLabel(node.label), [node.key, node.label]);

  const thumb = node.meta.youtubeId ? `https://i.ytimg.com/vi/${node.meta.youtubeId}/hqdefault.jpg` : null;
  const editable = node.kind === "content" ? !!node.meta.contentId : node.kind === "project";

  const save = async () => {
    setBusy(true);
    const error = node.kind === "project"
      ? await updateProject(node.meta.projectId!, { title: label })
      : await updateProjectContent(node.meta.contentId!, { title: label });
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success(t("saved"));
    await onChanged();
    onClose();
  };

  const remove = async () => {
    setBusy(true);
    let error: string | null = null;
    if (node.kind === "project" && node.meta.projectId) error = await deleteProject(node.meta.projectId);
    else if (node.meta.contentId) {
      try {
        await removeVideo({
          data: {
            contentId: node.meta.contentId,
            ...(node.meta.youtubeId ? { youtubeId: node.meta.youtubeId } : {}),
            ...(node.meta.sourceUrl ? { sourceUrl: node.meta.sourceUrl } : {}),
          },
        });
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
    else onHide(node.key);
    for (const id of customLinkIds) await deleteCustomLink(id);
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success(t("removed"));
    await onChanged();
    await onLinksChanged();
    onClose();
  };

  return (
    <div className="space-y-4 px-4 pb-8">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {node.kind} {node.meta.detail ? `· ${node.meta.detail}` : ""}
      </p>

      {thumb ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">{t("source")}</p>
          <img src={thumb} alt="" className="w-full rounded-lg border border-border object-cover" referrerPolicy="no-referrer" />
          {node.meta.timestamp !== undefined ? (
            <a
              href={`${node.meta.sourceUrl ?? `https://youtu.be/${node.meta.youtubeId}`}${node.meta.sourceUrl?.includes("?") ? "&" : "?"}t=${Math.round(node.meta.timestamp)}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline"
            >
              {Math.floor(node.meta.timestamp / 60)}:{String(Math.round(node.meta.timestamp) % 60).padStart(2, "0")}
            </a>
          ) : null}
        </div>
      ) : null}

      {node.meta.payload ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">{t("payload")}</p>
          <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[10px] leading-relaxed text-muted-foreground">
            {JSON.stringify(node.meta.payload, null, 2).slice(0, 6000)}
          </pre>
        </div>
      ) : null}

      {customLinkIds.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("customLinks")}: {customLinkIds.length}
        </p>
      ) : null}

      {editable ? (
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editable ? (
          <button
            type="button"
            disabled={busy || !label.trim()}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {t("rename")}
          </button>
        ) : null}
        {node.kind !== "persona" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("remove")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
