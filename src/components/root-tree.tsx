/**
 * Root tree — the Mind's topic map drawn as roots growing down from the Mind.
 * A root's thickness is how much knowledge sits under it (facts + Q&A, Q&A
 * counted double), so the richest subjects are visible at a glance.
 * Read-only view over the saved topic map; it never changes data.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Flame, Loader2, MessageCircleQuestion, MessagesSquare, Play, Sprout } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TalkToMindModal } from "@/components/talk-to-mind-modal";
import { getTopicMap, type TopicStat } from "@/lib/topic-map.functions";
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
  chatBranch: { en: "Chat about this branch", mn: "Энэ салаагаар чатлах", ko: "이 가지로 대화하기" },
  all: { en: "All", mn: "Бүгд", ko: "전체" },
  hot: { en: "Most asked", mn: "Их асуугдсан", ko: "많이 질문됨" },
  issues: { en: "Reported", mn: "Асуудалтай", ko: "신고됨" },
  thin: { en: "Thin", mn: "Нимгэн", ko: "얇음" },
  asked: { en: "asked", mn: "асуулт", ko: "질문" },
  reports: { en: "reports", mn: "report", ko: "신고" },
  viewerQ: { en: "What people asked", mn: "Хүмүүс юу асуусан бэ", ko: "사람들이 물은 것" },
  reportList: { en: "Reported problems", mn: "Ирсэн асуудлууд", ko: "신고된 문제" },
  factsTab: { en: "Facts", mn: "Баримтууд", ko: "사실" },
  thinHint: {
    en: "Few facts here — a new video on this subject would strengthen this root.",
    mn: "Баримт цөөн — энэ сэдвээр бичлэг нэмбэл үндэс бүдүүрнэ.",
    ko: "사실이 적습니다 — 이 주제의 영상을 추가하면 뿌리가 굵어집니다.",
  },
} as const;

type Filter = "all" | "hot" | "issues" | "thin";

type Node = {
  id: string;
  label: string;
  kind: "mind" | "group" | "topic";
  topic?: Topic;
  children: Node[];
  weight: number;
  facts: number;
  qa: number;
  asked: number;
  reports: number;
};

const isQa = (f: TopicFact) => f.text.startsWith("Q:");

function buildTree(topics: Topic[], mindLabel: string, stats: Record<string, TopicStat>): Node {
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
    const asked = (stats[t.id]?.qCount ?? 0) + children.reduce((n, c) => n + c.asked, 0);
    const reports = (stats[t.id]?.rCount ?? 0) + children.reduce((n, c) => n + c.reports, 0);
    return { id: t.id, label: t.title, kind: "topic", topic: t, children: sortW(children), facts, qa, asked, reports, weight: facts + qa };
  };
  const groups: Node[] = [...rootsByGroup.entries()].map(([g, ts]) => {
    const children = sortW(ts.map(topicNode));
    const facts = children.reduce((n, c) => n + c.facts, 0);
    const qa = children.reduce((n, c) => n + c.qa, 0);
    const asked = children.reduce((n, c) => n + c.asked, 0);
    const reports = children.reduce((n, c) => n + c.reports, 0);
    return { id: `g:${g}`, label: g, kind: "group", children, facts, qa, asked, reports, weight: facts + qa };
  });
  const facts = groups.reduce((n, c) => n + c.facts, 0);
  const qa = groups.reduce((n, c) => n + c.qa, 0);
  const asked = groups.reduce((n, c) => n + c.asked, 0);
  const reports = groups.reduce((n, c) => n + c.reports, 0);
  return { id: "mind", label: mindLabel, kind: "mind", children: sortW(groups), facts, qa, asked, reports, weight: facts + qa };
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
  const [chatTopic, setChatTopic] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const stats = (data?.stats ?? {}) as Record<string, TopicStat>;
  const tree = useMemo(() => buildTree(data?.map?.topics ?? [], title, stats), [data, title]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxAsked = Math.max(1, ...tree.children.flatMap((g) => [g.asked, ...g.children.map((c) => c.asked)]));
  const thinLimit = Math.max(3, Math.round(tree.weight / Math.max(1, (data?.map?.topics ?? []).length) / 3));
  const state = (n: Node): "issue" | "hot" | "thin" | "ok" =>
    n.reports > 0 ? "issue" : n.asked > 0 && n.asked >= maxAsked * 0.4 ? "hot" : n.kind === "topic" && n.weight <= thinLimit ? "thin" : "ok";
  const tone = (n: Node) => {
    const st = state(n);
    return st === "issue" ? "text-warn" : st === "hot" ? "text-hot" : "text-primary";
  };
  const dimmed = (n: Node) => {
    if (filter === "all" || n.kind === "mind") return false;
    const has = (x: Node): boolean =>
      (filter === "issues" ? x.reports > 0 : filter === "hot" ? state(x) === "hot" : state(x) === "thin") || x.children.some(has);
    return !has(n);
  };

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
          <div className="flex flex-wrap gap-1.5">
            {(["all", "hot", "issues", "thin"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                  filter === f ? "border-foreground bg-secondary text-foreground" : "border-border text-muted-foreground"
                }`}
              >
                {f === "hot" ? <Flame className="h-3 w-3 text-hot" /> : null}
                {f === "issues" ? <AlertTriangle className="h-3 w-3 text-warn" /> : null}
                {f === "thin" ? <Sprout className="h-3 w-3" /> : null}
                {t(f)}
              </button>
            ))}
          </div>
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
                      className={tone(p.node)}
                      key={`e-${p.node.id}`}
                      d={`M ${a.x} ${a.y} C ${a.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`}
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeOpacity={dimmed(p.node) ? 0.08 : onPath ? 0.9 : 0.45}
                      strokeWidth={stroke(p.node.weight)}
                    />
                  );
                })}
              {placed.map((p) => {
                const onPath = path[p.depth] === p.node.id;
                return (
                  <g key={p.node.id} onClick={() => open(p)} className={`cursor-pointer ${tone(p.node)}`} opacity={dimmed(p.node) ? 0.2 : 1}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={p.depth === 0 ? 14 : 5 + Math.sqrt(p.node.weight / maxW) * 10}
                      className={onPath ? "fill-current" : "fill-card stroke-current"}
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
                      {p.node.asked ? ` · ?${p.node.asked}` : ""}
                      {p.node.reports ? ` · !${p.node.reports}` : ""}
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
              {selected.asked ? (
                <Badge variant="outline" className="border-hot text-hot">
                  <Flame className="mr-1 h-3 w-3" />
                  {selected.asked} {t("asked")}
                </Badge>
              ) : null}
              {selected.reports ? (
                <Badge variant="outline" className="border-warn text-warn">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {selected.reports} {t("reports")}
                </Badge>
              ) : null}
            </div>
            {state(selected) === "thin" ? <p className="mt-1 text-xs text-muted-foreground">{t("thinHint")}</p> : null}
            {selected.topic && stats[selected.topic.id]?.reports.length ? (
              <div className="mt-2 rounded-md border border-warn/40 p-2">
                <p className="mb-1 text-xs font-semibold text-warn">{t("reportList")}</p>
                <ul className="space-y-1">
                  {stats[selected.topic.id]!.reports.map((r, i) => (
                    <li key={i} className="text-xs text-foreground">• {r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selected.topic && stats[selected.topic.id]?.questions.length ? (
              <div className="mt-2 rounded-md border border-hot/40 p-2">
                <p className="mb-1 text-xs font-semibold text-hot">{t("viewerQ")}</p>
                <ul className="space-y-1">
                  {stats[selected.topic.id]!.questions.map((q, i) => (
                    <li key={i} className="flex gap-2 text-xs text-foreground">
                      <span className="shrink-0 font-mono text-hot">×{q.count}</span>
                      <span className="min-w-0">{q.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {selected.topic?.summary ? <p className="mt-1 text-xs text-muted-foreground">{selected.topic.summary}</p> : null}
            {selected.topic ? (
              <Button size="sm" variant="outline" className="mt-2" onClick={() => { if (selected.topic) setChatTopic(selected.topic.id); }}>
                <MessagesSquare className="mr-1 h-3.5 w-3.5" />
                {t("chatBranch")}
              </Button>
            ) : null}
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
      <TalkToMindModal
        open={chatTopic !== null}
        onClose={() => setChatTopic(null)}
        mindId={`project:${projectId}`}
        mindName={title}
        lang={lang}
        topicId={chatTopic ?? undefined}
        topicTitle={data?.map?.topics.find((topic) => topic.id === chatTopic)?.title}
      />
    </section>
  );
}

function secs(ts: string): number {
  const p = ts.split(":").map(Number);
  if (p.some((n) => !Number.isFinite(n))) return 0;
  return p.reduce((a, n) => a * 60 + n, 0);
}
