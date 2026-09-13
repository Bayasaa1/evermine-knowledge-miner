/**
 * Step 2a — pick the destination Project before any link is pasted.
 * Creators either start a brand new Mind Project or append to an existing one
 * (with an explicit intent + publication date), and decide right here whether
 * the video also lands on the public feed.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Layers, Loader2, Plus, UserRound } from "lucide-react";

import { pickCopy, type Lang } from "@/lib/i18n";
import { createProject, listMyProjects, type ContentKind } from "@/lib/projects";
import { toast } from "sonner";
import { createPersona, listPersonas } from "@/lib/personas";
import { useAuth } from "@/hooks/use-auth";

export type UpdateIntent = "continuation" | "patch" | "expand";

export type ProjectTarget = {
  personaId: string | null;
  mode: "new" | "existing";
  projectId: string | null;
  newTitle: string;
  intent: UpdateIntent;
  publishDate: string;
  contentKind: ContentKind;
  publishToFeed: boolean;
};

export const DEFAULT_TARGET: ProjectTarget = {
  personaId: null,
  mode: "new",
  projectId: null,
  newTitle: "",
  intent: "continuation",
  publishDate: new Date().toISOString().slice(0, 10),
  contentKind: "VISUAL_CONTENT",
  publishToFeed: true,
};

/** Step 2 is strictly hierarchical: persona -> project -> link. */
export function isTargetReady(t: ProjectTarget): boolean {
  if (!t.personaId) return false;
  // Typing a project name does not create a project. The creator must press
  // Save project first; mining only accepts the resulting persisted id.
  return t.mode === "existing" && Boolean(t.projectId);
}


const copy = {
  en: {
    stepA: "Who is posting this?",
    personaQ: "Pick the name this video is published under.",
    personaSub: "",
    newPersona: "Add a new name",
    personaName: "Name",
    personaPlaceholder: "e.g. Gremix",
    save: "Save",
    cancel: "Cancel",
    noPersona: "No names yet — add your first one.",
    stepB: "Which collection?",
    lockedB: "Pick a name first.",
    stepC: "The video",
    lockedC: "Pick a name and a collection first.",
    title: "Where does this video go?",
    sub: "",
    newOpt: "New collection",
    newSub: "Start a fresh one for this video.",
    existingOpt: "Existing collection",
    existingSub: "Add this video to one you already have.",
    saveProject: "Save collection",
    saveProjectHint: "Saved to your account right away.",
    name: "Collection name",
    namePlaceholder: "e.g. Morning Podcast Season 2",
    choose: "Choose a collection",
    none: "No collections yet — create one first.",
    intent: "Why are you adding it?",
    intentContinuation: "Next episode",
    intentPatch: "Fixing a mistake",
    intentExpand: "More on the same topic",
    date: "Date of the video",
    kind: "Can people watch it?",
    visual: "Yes, playable",
    training: "No, only teaches my Mind",
    publish: "Show this video on the public feed?",
    publishOn: "It appears on the home feed as soon as mining finishes.",
    publishOff: "Stays private — used only to teach your Mind.",
    filed: "Filed under",
    change: "Change",
  },
  mn: {
    stepA: "Хэн нийтэлж байна?",
    personaQ: "Энэ видео аль нэрээр нийтлэгдэхийг сонгоно уу.",
    personaSub: "",
    newPersona: "Шинэ нэр нэмэх",
    personaName: "Нэр",
    personaPlaceholder: "жишээ нь: Gremix",
    save: "Хадгалах",
    cancel: "Болих",
    noPersona: "Нэр алга — эхнийхээ нэмнэ үү.",
    stepB: "Аль цуглуулга руу?",
    lockedB: "Эхлээд нэрээ сонгоно уу.",
    stepC: "Видео",
    lockedC: "Эхлээд нэр, цуглуулгаа сонгоно уу.",
    title: "Энэ видео хаашаа орох вэ?",
    sub: "",
    newOpt: "Шинэ цуглуулга",
    newSub: "Энэ видеонд зориулж шинээр эхлүүлнэ.",
    existingOpt: "Одоо байгаа цуглуулга",
    existingSub: "Байгаа цуглуулгадаа нэмнэ.",
    saveProject: "Цуглуулга хадгалах",
    saveProjectHint: "Бүртгэлд шууд хадгалагдана.",
    name: "Цуглуулгын нэр",
    namePlaceholder: "жишээ нь: Өглөөний подкаст 2-р улирал",
    choose: "Цуглуулга сонгох",
    none: "Цуглуулга алга — эхлээд нэгийг үүсгэнэ үү.",
    intent: "Юуны учир нэмж байна?",
    intentContinuation: "Дараагийн дугаар",
    intentPatch: "Алдаа засах",
    intentExpand: "Ижил сэдвийг нэмж тайлбарлах",
    date: "Видеоны огноо",
    kind: "Хүмүүс үзэж болох уу?",
    visual: "Тийм, үзэж болно",
    training: "Үгүй, зөвхөн Оюуныг сургана",
    publish: "Энэ видеог нийтийн фийдэд харуулах уу?",
    publishOn: "Шинжилгээ дуусмагц нүүр фийдэд гарна.",
    publishOff: "Хувийн хэвээр — зөвхөн Оюуныг сургана.",
    filed: "Хадгалах газар",
    change: "Солих",
  },
  ko: {
    stepA: "누가 올리나요?",
    personaQ: "이 영상을 게시할 이름을 고르세요.",
    personaSub: "",
    newPersona: "새 이름 추가",
    personaName: "이름",
    personaPlaceholder: "예: Gremix",
    save: "저장",
    cancel: "취소",
    noPersona: "이름이 없습니다 — 먼저 추가하세요.",
    stepB: "어떤 모음집에?",
    lockedB: "먼저 이름을 고르세요.",
    stepC: "영상",
    lockedC: "먼저 이름과 모음집을 고르세요.",
    title: "이 영상을 어디에 넣을까요?",
    sub: "",
    newOpt: "새 모음집",
    newSub: "이 영상을 위해 새로 시작합니다.",
    existingOpt: "기존 모음집",
    existingSub: "이미 있는 모음집에 추가합니다.",
    saveProject: "모음집 저장",
    saveProjectHint: "계정에 바로 저장됩니다.",
    name: "모음집 이름",
    namePlaceholder: "예: 모닝 팟캐스트 시즌 2",
    choose: "모음집 선택",
    none: "모음집이 없습니다 — 먼저 만드세요.",
    intent: "왜 추가하나요?",
    intentContinuation: "다음 에피소드",
    intentPatch: "잘못된 부분 수정",
    intentExpand: "같은 주제 더 다루기",
    date: "영상 날짜",
    kind: "사람들이 볼 수 있나요?",
    visual: "네, 재생 가능",
    training: "아니요, 마인드 학습만",
    publish: "이 영상을 공개 피드에 보여줄까요?",
    publishOn: "분석이 끝나는 즉시 홈 피드에 표시됩니다.",
    publishOff: "비공개로 유지 — 마인드 학습에만 사용됩니다.",
    filed: "저장 위치",
    change: "변경",
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
  const queryClient = useQueryClient();
  const [touchedPublish, setTouchedPublish] = useState(false);
  const [creating, setCreating] = useState(false);
  const [personaName, setPersonaName] = useState("");
  const [savingPersona, setSavingPersona] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  /** Collapsed once a persona + collection are chosen; "Change" reopens it. */
  const [expanded, setExpanded] = useState(false);

  const { data: personas = [], isLoading: personasLoading } = useQuery({
    queryKey: ["my-personas", userId],
    queryFn: () => listPersonas(userId as string),
    enabled: Boolean(userId),
  });

  const { data: allProjects = [], isLoading } = useQuery({
    queryKey: ["my-projects", userId],
    queryFn: () => listMyProjects(userId as string),
    enabled: Boolean(userId),
  });

  const set = (patch: Partial<ProjectTarget>) => onChange({ ...value, ...patch });

  // Step 2B only ever lists projects belonging to the persona chosen in 2A.
  const projects = allProjects.filter((p) => (p.persona_id ?? null) === value.personaId);

  // Default publish state follows the content type until the creator overrides it.
  useEffect(() => {
    if (touchedPublish) return;
    const shouldPublish = value.contentKind === "VISUAL_CONTENT";
    if (value.publishToFeed !== shouldPublish) onChange({ ...value, publishToFeed: shouldPublish });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.contentKind, touchedPublish]);

  // Preselect the only persona so single-identity creators aren't blocked.
  useEffect(() => {
    if (!value.personaId && personas.length === 1) set({ personaId: personas[0]!.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, value.personaId]);

  const addPersona = async () => {
    if (!userId || !personaName.trim()) return;
    setSavingPersona(true);
    const { persona } = await createPersona(userId, { name: personaName.trim() });
    setSavingPersona(false);
    if (persona) {
      await queryClient.invalidateQueries({ queryKey: ["my-personas"] });
      setPersonaName("");
      setCreating(false);
      set({ personaId: persona.id, projectId: null });
    }
  };

  /** Writes the new project to the database now and switches the wizard onto it. */
  const saveProject = async () => {
    if (!userId || !value.newTitle.trim()) return;
    setSavingProject(true);
    const persona = personas.find((p) => p.id === value.personaId) ?? null;
    const { project, error } = await createProject(userId, {
      title: value.newTitle.trim(),
      personaId: value.personaId ?? null,
      ...(persona ? { creatorName: persona.name, creatorAvatarUrl: persona.avatar_url } : {}),
    });
    setSavingProject(false);
    if (!project) {
      toast.error(error ?? "Could not save the project");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["my-projects"] });
    onChange({ ...value, mode: "existing", projectId: project.id, newTitle: "" });
    toast.success(t.saveProject);
  };

  const personaChosen = Boolean(value.personaId);

  // Once a destination is picked the whole picker folds into one quiet line,
  // so the video step is not three stacked forms.
  if (isTargetReady(value) && !expanded) {
    const personaName = personas.find((p) => p.id === value.personaId)?.name ?? "";
    const projectName = allProjects.find((p) => p.id === value.projectId)?.title ?? "";
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">{t.filed}:</span>
        <span className="font-medium text-foreground">
          {personaName} › {projectName}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t.change}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="text-sm font-semibold text-foreground">{t.title}</p>

      {/* ---- Who is posting ---- */}
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-primary">{t.stepA}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t.personaQ}</p>

      {personasLoading ? (
        <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {personas.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => set({ personaId: p.id, projectId: null })}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                value.personaId === p.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
              }`}
            >
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.handle}</span>
              </span>
            </button>
          ))}

          {creating ? (
            <div className="rounded-xl border border-primary/50 p-3">
              <input
                value={personaName}
                onChange={(e) => setPersonaName(e.target.value.slice(0, 60))}
                placeholder={t.personaPlaceholder}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={savingPersona || !personaName.trim()}
                  onClick={() => void addPersona()}
                  className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {savingPersona ? "…" : t.save}
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
            >
              <Plus className="h-4 w-4" /> {t.newPersona}
            </button>
          )}
        </div>
      )}
      {!personasLoading && personas.length === 0 && !creating && (
        <p className="mt-2 text-xs text-muted-foreground">{t.noPersona}</p>
      )}

      {/* ---- Step 2B: project (nested under the persona) ---- */}
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-primary">{t.stepB}</p>
      {!personaChosen ? (
        <p className="mt-2 text-xs text-muted-foreground">{t.lockedB}</p>
      ) : (
      <>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">

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
        <div className="mt-4">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.name}</span>
            <input
              value={value.newTitle}
              onChange={(e) => set({ newTitle: e.target.value.slice(0, 120) })}
              placeholder={t.namePlaceholder}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
          {/* Saving now writes the project to the account immediately, so it
              survives a refresh instead of only existing during the wizard. */}
          <button
            type="button"
            disabled={savingProject || !value.newTitle.trim()}
            onClick={() => void saveProject()}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {savingProject ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
            {t.saveProject}
          </button>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{t.saveProjectHint}</p>
        </div>
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
      </>
      )}

      {/* ---- Step 2C: media type & publishing ---- */}
      <p className="mt-6 text-[11px] font-semibold uppercase tracking-widest text-primary">{t.stepC}</p>
      {!isTargetReady(value) ? (
        <p className="mt-2 text-xs text-muted-foreground">{t.lockedC}</p>
      ) : (
      <>
      <fieldset className="mt-3">

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
      </>
      )}
    </div>

  );
}
