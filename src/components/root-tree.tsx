/**
 * Root tree — the Mind's topic map drawn as roots growing down from the Mind.
 * A root's thickness is how much knowledge sits under it (facts + Q&A, Q&A
 * counted double), so the richest subjects are visible at a glance.
 * Read-only view over the saved topic map; it never changes data.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircleQuestion, Play, Sprout } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getTopicMap } from "@/lib/topic-map.functions";
import type { Topic, TopicFact } from "@/lib/topic-map.server";
import { pickCopy, type Lang } from "@/lib/i18n";

const C = {
  title: { en: "Knowledge roots", mn: "Мэдлэгийн үндэс", ko: "지식 뿌리" },
  desc: {
    en: "Thicker roots = richer subjects. Tap a root to grow its branches.",
    mn: "Бүдүүн үндэс = баялаг сэдэв. Үндэс дээр дарж салааг нь дэлгэнэ.",
    ko: "굵은 뿌리 = 풍부한 주제. 뿌리를 눌러 가지를 펼치세요.",
  },
  empty: {
    en: "No roots yet. Open the Brain tab and press “Sort into topics”.",
    mn: "Үндэс алга. Brain таб руу орж “Сэдвээр ангилах”-ыг дарна уу.",
    ko: "아직 뿌리가 없습니다. Brain 탭에서 “주제로 정리”를 누르세요.",
  },
  facts: { en: "facts", mn: "баримт", ko: "사실" },
  qa: { en: "Q&A", mn: "асуулт-хариулт", ko: "Q&A" },
} as const;

type Node = {
  id: string;
  label: string;
  kind: "mind" | "group" | "topic";
  topic?: Topic;
  children: Node[];
  weight: number;
  facts: number;
  qa: number;
};

const isQa = (f: TopicFact) => f.text.startsWith("Q:");

function buildTree(topics: Topic[], mindLabel: string): Node {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const kids = new Map<string, Topic[]>();
  const rootsByGroup = new Map<string, Topic[]>();
  for (const t of topics) {
    if (t.parentId && byId.has(t.parentId) && t.parentId !== t.id) {
      kids.set(t.parentId, [...(kids.get(t.parentId) ?? []), t]);
    } else {
      rootsByGroup.set(t.group, [...(rootsByGroup.get(t.group) ?? []), t]);
    }
  }
  const seen = new Set<string>();
  const topicNode = (t: Topic): Node => {
    seen.add(t.id);
    const children = (kids.get(t.id) ?? []).filter((c) => !seen.has(c.id)).map(topicNode);
    const qa = t.facts.filter(isQa).length + children.reduce((n, c) => n + c.qa, 0);
    const facts = t.facts.length + children.reduce((n, c) => n + c.facts, 0);
    return { id: t.id, label: t.title, kind: "topic", topic: t, children: sortW(children), facts, qa, weight: facts + qa };
  };
  const groups: Node[] = [...rootsByGroup.entries()].map(([g, ts]) => {
    const children = sortW(ts.map(topicNode));
    const facts = children.reduce((n, c) => n + c.facts, 0);
    const qa = children.reduce((n, c) => n + c.qa, 0);
    return { id: `g:${g}`, label: g, kind: "group", children, facts, qa, weight: facts + qa };
  });
  const facts = groups.reduce((n, c) => n + c.facts, 0);
  const qa = groups.reduce((n, c) => n + c.qa, 0);
  return { id: "mind", label: mindLabel, kind: "mind", children: sortW(groups), facts, qa, weight: facts + qa };
}

const sortW = (n: Node[]) => n.sort((a, b) => b.weight - a.weight);

type Placed = { node: Node; x: number; y: number; depth: number; parent?: Placed };

const W = 900;
const ROW = 110;

export function RootTree({ lang, projectId, title }: { lang: Lang; projectId: string; title: string }) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const load = useServerFn(getTopicMap);
  const { data, isLoading } = useQuery({ queryKey: ["topic-map", projectId], queryFn: () => load({ data: { projectId } }) });
  const [path, setPath] = useState<string[]>(["mind"]);

  const tree = useMemo(() => buildTree(data?.map?.topics ?? [], title), [data, title]);

  // Lay out only the open path: every node on the path shows its children.
  const { placed, maxW, rows } = useMemo(() => {
    const out: Placed[] = [];
    const root: Placed = { node: tree, x: W / 2, y: 30, depth: 0 };
    out.push(root);
    let level: Placed[] = [root];
    let depth = 0;
    while (true) {
      const openNode = level.find((p) => p.node.id === path[depth]);
      if (!openNode || openNode.node.children.length === 0) break;
      depth++;
      const ch = openNode.node.children.slice(0, 14);
      const step = W / (ch.length + 1);
      level = ch.map((c, i) => ({ node: c, x: step * (i + 1), y: 30 + depth * ROW, depth, parent: openNode }));
      out.push(...level);
    }
    return { placed: out, maxW: Math.max(1, tree.weight), rows: depth + 1 };
  }, [tree, path]);

  const selected = placed.find((p) => p.node.id === path[path.length - 1])?.node ?? tree;
  const stroke = (w: number) => 1.5 + Math.sqrt(w / maxW) * 22;

  const open = (p: Placed) => {
    const next = path.slice(0, p.depth);
    next[p.depth] = p.node.id;
    setPath(path[p.depth] === p.node.id && path.length === p.depth + 1 && p.depth > 0 ? next.slice(0, p.depth) : next);
  };

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4">
      <header className="flex items-start gap-3">
        <Sprout className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("desc")}</p>
        </div>
      </header>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : tree.children.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {path.map((id, i) => {
              const n = placed.find((p) => p.node.id === id)?.node;
              if (!n) return null;
              return (
                <button key={id} type="button" onClick={() => setPath(path.slice(0, i + 1))} className="hover:text-primary">
                  {i > 0 ? "› " : ""}
                  {n.label}
                </button>
              );
            })}
          </div>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${rows * ROW + 20}`} className="w-full min-w-[560px] text-primary" role="img">
              {placed
                .filter((p) => p.parent)
                .map((p) => {
                  const a = p.parent!;
                  const my = (a.y + p.y) / 2;
                  const onPath = path[p.depth] === p.node.id;
                  return (
                    <path
                      key={`e-${p.node.id}`}
                      d={`M ${a.x} ${a.y} C ${a.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`}
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeOpacity={onPath ? 0.9 : 0.4}
                      strokeWidth={stroke(p.node.weight)}
                    />
                  );
                })}
              {placed.map((p) => {
                const onPath = path[p.depth] === p.node.id;
                return (
                  <g key={p.node.id} onClick={() => open(p)} className="cursor-pointer">
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={p.depth === 0 ? 14 : 5 + Math.sqrt(p.node.weight / maxW) * 10}
                      className={onPath ? "fill-primary" : "fill-card stroke-primary"}
                      strokeWidth={2}
                    />
                    <text
                      x={p.x}
                      y={p.y + (p.depth === 0 ? -20 : 26)}
                      textAnchor="middle"
                      className="fill-foreground"
                      fontSize={12}
                      fontWeight={onPath ? 700 : 400}
                    >
                      {p.node.label.length > 18 ? `${p.node.label.slice(0, 17)}…` : p.node.label}
                    </text>
                    <text x={p.x} y={p.y + (p.depth === 0 ? 32 : 40)} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                      {p.node.weight}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{selected.label}</p>
              <Badge variant="outline">
                {selected.facts} {t("facts")}
              </Badge>
              <Badge variant="secondary">
                {selected.qa} {t("qa")}
              </Badge>
            </div>
            {selected.topic?.summary ? <p className="mt-1 text-xs text-muted-foreground">{selected.topic.summary}</p> : null}
            {selected.topic ? (
              <ul className="mt-2 space-y-1.5">
                {[...selected.topic.facts].sort((a, b) => Number(isQa(b)) - Number(isQa(a))).map((f) => (
                  <li key={f.id} className="flex gap-2 text-xs text-foreground">
                    {isQa(f) ? <MessageCircleQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> : null}
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
          </div>
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
