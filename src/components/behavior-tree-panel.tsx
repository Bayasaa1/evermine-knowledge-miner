import { useEffect, useState } from "react";
import { Play, RotateCcw, SkipForward } from "lucide-react";
import type { BehaviorTree } from "@/lib/embodied";
import { pickCopy, type Lang } from "@/lib/i18n";

const copy = {
  en: { title: "Behavior Tree / Action Graph", empty: "No action steps mined yet.", pre: "Pre", act: "Action", post: "Post", fallback: "Fallback", sim: "Dry-run: simulate step", reset: "Reset", done: "Dry-run complete — every step passed.", fail: "Simulate failure", running: "Running" },
  mn: { title: "Үйлдлийн мод / Үйлдлийн граф", empty: "Үйлдлийн алхам хараахан алга.", pre: "Өмнө", act: "Үйлдэл", post: "Дараа", fallback: "Нөөц арга", sim: "Туршилт: алхам гүйцэтгэх", reset: "Дахин эхлэх", done: "Туршилт дууслаа — бүх алхам амжилттай.", fail: "Алдаа гаргаж турших", running: "Гүйцэтгэж буй" },
  ko: { title: "행동 트리 / 액션 그래프", empty: "아직 추출된 행동 단계가 없습니다.", pre: "전", act: "행동", post: "후", fallback: "대체", sim: "드라이런: 단계 실행", reset: "초기화", done: "드라이런 완료 — 모든 단계 통과.", fail: "실패 시뮬레이션", running: "실행 중" },
};

/** Read-only preview + in-browser dry run of the compiled behavior tree. */
export function BehaviorTreePanel({ lang, tree }: { lang: Lang; tree: BehaviorTree }) {
  const t = pickCopy(copy, lang);
  const [cursor, setCursor] = useState(0);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  useEffect(() => { setCursor(0); setFailedAt(null); }, [tree]);
  const n = tree.children.length;

  return (
    <div className="mt-4 rounded-xl border border-border bg-card/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t.title}</p>
      {n === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t.empty}</p>
      ) : (
        <>
          <p className="mt-2 font-mono text-xs text-muted-foreground">Sequence · {tree.name}</p>
          <ol className="mt-2 space-y-2 border-l border-border pl-3">
            {tree.children.map((c, i) => {
              const s = c.step;
              const state = i < cursor ? "done" : i === cursor && cursor < n ? "active" : "idle";
              return (
                <li key={s.id} data-state={state} className={`rounded-lg border p-2 text-xs ${state === "active" ? "border-primary bg-primary/10" : state === "done" ? "border-border opacity-70" : "border-border"}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-primary">{s.timestamp}</span>
                    <span className="font-semibold">{s.actionPrimitive ?? "action"}</span>
                    {s.targetObject && <span className="text-muted-foreground">→ {s.targetObject}</span>}
                    {state === "done" && <span className="ml-auto">✓</span>}
                    {state === "active" && <span className="ml-auto text-primary">{t.running}</span>}
                  </div>
                  <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-muted-foreground">
                    <dt>{t.pre}</dt><dd>{s.sceneState}</dd>
                    <dt>{t.act}</dt><dd className="text-foreground">{s.actorMotion}</dd>
                    <dt>{t.post}</dt><dd>{s.successCondition}</dd>
                  </dl>
                  {s.recovery && (
                    <p className={`mt-1 rounded border border-dashed px-2 py-1 ${failedAt === i ? "border-destructive text-destructive" : "border-border text-muted-foreground"}`}>
                      {t.fallback}: {s.recovery}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={cursor >= n} onClick={() => { setFailedAt(null); setCursor((c) => Math.min(n, c + 1)); }} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              <Play className="h-3 w-3" /> {t.sim}
            </button>
            <button type="button" disabled={cursor >= n} onClick={() => setFailedAt(cursor)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50">
              <SkipForward className="h-3 w-3" /> {t.fail}
            </button>
            <button type="button" onClick={() => { setCursor(0); setFailedAt(null); }} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs">
              <RotateCcw className="h-3 w-3" /> {t.reset}
            </button>
          </div>
          {cursor >= n && <p className="mt-2 text-xs text-primary">{t.done}</p>}
        </>
      )}
    </div>
  );
}
