/**
 * Step 2a — pick the destination Project before any link is pasted.
 * Creators either start a brand new Mind Project or append to an existing one
 * (with an explicit intent + publication date), and decide right here whether
 * the video also lands on the public feed.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FolderPlus, Layers, Loader2 } from "lucide-react";

import { pickCopy, type Lang } from "@/lib/i18n";
import { listMyProjects, type ContentKind } from "@/lib/projects";
import { useAuth } from "@/hooks/use-auth";

export type UpdateIntent = "continuation" | "patch" | "expand";

export type ProjectTarget = {
  mode: "new" | "existing";
  projectId: string | null;
  newTitle: string;
  intent: UpdateIntent;
  publishDate: string;
  contentKind: ContentKind;
  publishToFeed: boolean;
};

export const DEFAULT_TARGET: ProjectTarget = {
  mode: "new",
  projectId: null,
  newTitle: "",
  intent: "continuation",
  publishDate: new Date().toISOString().slice(0, 10),
  contentKind: "VISUAL_CONTENT",
  publishToFeed: true,
};

const copy = {
  en: {
    title: "Where should this Mind go?",
    sub: "Pick a destination project first — everything mined from this video is filed there.",
    newOpt: "Create a Brand New Mind Project",
    newSub: "Starts a fresh project for this video.",
    existingOpt: "Append / Update Existing Project",
    existingSub: "Adds this video to a project you already own.",
    name: "Project name",
    namePlaceholder: "e.g. Morning Podcast Season 2",
    choose: "Choose project",
    none: "You have no projects yet — a new one will be created.",
    intent: "Update intent",
    intentContinuation: "Chronological Continuation (New Episode)",
    intentPatch: "Error Fix / Patch",
    intentExpand: "Expand Topic",
    date: "Content publication date",
    kind: "Content type",
    visual: "Visual content (playable)",
    training: "Training-only archive",
    publish: "Publish video directly to the public feed?",
    publishOn: "This video appears on the home feed as soon as mining finishes.",
    publishOff: "Stays private — used only to train your Mind.",
  },
  mn: {
    title: "Энэ оюуныг хаана хадгалах вэ?",
    sub: "Эхлээд төслөө сонго — энэ видеоноос гарсан бүх мэдээлэл тэнд хадгалагдана.",
    newOpt: "Шинэ Mind төсөл үүсгэх",
    newSub: "Энэ видеонд зориулж шинэ төсөл эхлүүлнэ.",
    existingOpt: "Одоо байгаа төсөлд нэмэх / шинэчлэх",
    existingSub: "Таны эзэмшиж буй төсөлд энэ видеог нэмнэ.",
    name: "Төслийн нэр",
    namePlaceholder: "жишээ нь: Өглөөний подкаст 2-р улирал",
    choose: "Төсөл сонгох",
    none: "Танд төсөл алга — шинэ төсөл үүснэ.",
    intent: "Шинэчлэлийн зорилго",
    intentContinuation: "Дараалсан үргэлжлэл (шинэ дугаар)",
    intentPatch: "Алдаа засвар",
    intentExpand: "Сэдвийг өргөтгөх",
    date: "Нийтлэх огноо",
    kind: "Контентын төрөл",
    visual: "Үзэх контент (тоглуулах)",
    training: "Зөвхөн сургалтын архив",
    publish: "Видеог нийтийн фийдэд шууд нийтлэх үү?",
    publishOn: "Шинжилгээ дуусмагц нүүр фийдэд гарна.",
    publishOff: "Хувийн хэвээр — зөвхөн оюуныг сургахад ашиглана.",
  },
  ko: {
    title: "이 마인드를 어디에 저장할까요?",
    sub: "먼저 대상 프로젝트를 선택하세요 — 이 영상에서 추출된 모든 내용이 그곳에 저장됩니다.",
    newOpt: "새 마인드 프로젝트 만들기",
    newSub: "이 영상을 위한 새 프로젝트를 시작합니다.",
    existingOpt: "기존 프로젝트에 추가 / 업데이트",
    existingSub: "이미 보유한 프로젝트에 이 영상을 추가합니다.",
    name: "프로젝트 이름",
    namePlaceholder: "예: 모닝 팟캐스트 시즌 2",
    choose: "프로젝트 선택",
    none: "아직 프로젝트가 없습니다 — 새로 생성됩니다.",
    intent: "업데이트 의도",
    intentContinuation: "시간순 연속 (새 에피소드)",
    intentPatch: "오류 수정 / 패치",
    intentExpand: "주제 확장",
    date: "콘텐츠 공개일",
    kind: "콘텐츠 유형",
    visual: "시각 콘텐츠 (재생 가능)",
    training: "학습 전용 아카이브",
    publish: "영상을 공개 피드에 바로 게시할까요?",
    publishOn: "분석이 끝나는 즉시 홈 피드에 표시됩니다.",
    publishOff: "비공개로 유지 — 마인드 학습에만 사용됩니다.",
  },
};

export function ProjectTargetPicker({
  lang,
  value,
  onChange,
}: {
  lang: Lang;
  value: ProjectTarget;
  onChange: (t: ProjectTarget) => void;
}) {
  const t = pickCopy(copy, lang);
  const { userId } = useAuth();
  const [touchedPublish, setTouchedPublish] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["my-projects", userId],
    queryFn: () => listMyProjects(userId as string),
    enabled: Boolean(userId),
  });

  const set = (patch: Partial<ProjectTarget>) => onChange({ ...value, ...patch });

  // Default publish state follows the content type until the creator overrides it.
  useEffect(() => {
    if (touchedPublish) return;
    const shouldPublish = value.contentKind === "VISUAL_CONTENT";
    if (value.publishToFeed !== shouldPublish) onChange({ ...value, publishToFeed: shouldPublish });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.contentKind, touchedPublish]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-sm font-semibold text-foreground">{t.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(
          [
            ["new", t.newOpt, t.newSub, FolderPlus],
            ["existing", t.existingOpt, t.existingSub, Layers],
          ] as const
        ).map(([mode, label, sub, Icon]) => (
          <button
            key={mode}
            type="button"
            onClick={() => set({ mode })}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
              value.mode === mode ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
            }`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${value.mode === mode ? "text-primary" : "text-muted-foreground"}`} />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>
            </span>
          </button>
        ))}
      </div>

      {value.mode === "new" ? (
        <label className="mt-4 block">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.name}</span>
          <input
            value={value.newTitle}
            onChange={(e) => set({ newTitle: e.target.value.slice(0, 120) })}
            placeholder={t.namePlaceholder}
            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </label>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.choose}</span>
            {isLoading ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </p>
            ) : projects.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t.none}</p>
            ) : (
              <select
                value={value.projectId ?? ""}
                onChange={(e) => set({ projectId: e.target.value || null })}
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </label>

          <fieldset>
            <legend className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.intent}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(
                [
                  ["continuation", t.intentContinuation],
                  ["patch", t.intentPatch],
                  ["expand", t.intentExpand],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => set({ intent: id })}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    value.intent === id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.date}</span>
            <input
              type="date"
              value={value.publishDate}
              onChange={(e) => set({ publishDate: e.target.value })}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
            />
          </label>
        </div>
      )}

      <fieldset className="mt-4">
        <legend className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.kind}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["VISUAL_CONTENT", t.visual],
              ["TRAINING_ONLY", t.training],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => set({ contentKind: id })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                value.contentKind === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <input
          type="checkbox"
          checked={value.publishToFeed}
          onChange={(e) => {
            setTouchedPublish(true);
            set({ publishToFeed: e.target.checked });
          }}
          className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
        />
        <span className="text-xs leading-relaxed text-muted-foreground">
          <span className="block font-medium text-foreground">{t.publish}</span>
          {value.publishToFeed ? t.publishOn : t.publishOff}
        </span>
      </label>
    </div>
  );
}
