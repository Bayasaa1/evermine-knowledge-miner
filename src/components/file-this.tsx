/**
 * "File this…" — the picker that asks where an unplaced (or misplaced) video
 * belongs: whose mind it is (persona) and which project holds it. Either side
 * can be created on the spot, so filing never needs a trip elsewhere.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { createPersona, listPersonas, type Persona } from "@/lib/personas";
import { createProject, listProjectsByPersona, type Project } from "@/lib/projects";
import { pickCopy, type Lang } from "@/lib/i18n";

export type FileTarget = { personaId: string; projectId: string };

export function FileThis({
  lang,
  userId,
  title,
  onFile,
  onClose,
  count = 1,
}: {
  /** How many videos this filing moves — shown in the confirm summary. */
  count?: number;
  lang: Lang;
  userId: string;
  /** What is being filed — shown at the top so the question is concrete. */
  title: string;
  onFile: (target: FileTarget) => Promise<void>;
  onClose: () => void;
}) {
  const c = {
    heading: pickCopy({ en: "Where does this go?", mn: "Үүнийг хаана тавих вэ?", ko: "어디에 둘까요?" }, lang),
    whose: pickCopy({ en: "Whose mind is this?", mn: "Энэ чиний оюун уу?", ko: "누구의 마인드인가요?" }, lang),
    newPersona: pickCopy({ en: "New persona…", mn: "Шинэ дүр…", ko: "새 페르소나…" }, lang),
    personaName: pickCopy({ en: "Persona name", mn: "Дүрийн нэр", ko: "페르소나 이름" }, lang),
    which: pickCopy({ en: "Which project?", mn: "Аль төсөлд вэ?", ko: "어느 프로젝트에?" }, lang),
    newProject: pickCopy({ en: "New project…", mn: "Шинэ төсөл…", ko: "새 프로젝트…" }, lang),
    projectName: pickCopy({ en: "Project name", mn: "Төслийн нэр", ko: "프로젝트 이름" }, lang),
    file: pickCopy({ en: "File it", mn: "Бүртгэх", ko: "파일하기" }, lang),
    cancel: pickCopy({ en: "Cancel", mn: "Болих", ko: "취소" }, lang),
    pickProject: pickCopy({ en: "Pick a project or type a new name", mn: "Төсөл сонгох эсвэл шинэ нэр бичнэ үү", ko: "프로젝트를 선택하거나 새 이름을 입력하세요" }, lang),
    needName: pickCopy({ en: "Type a name — nothing is named for you", mn: "Нэр бичнэ үү — автоматаар нэр өгөхгүй", ko: "이름을 입력하세요 — 자동으로 정하지 않습니다" }, lang),
    confirmTitle: pickCopy({ en: "Please check before saving", mn: "Хадгалахаас өмнө шалгана уу", ko: "저장하기 전에 확인하세요" }, lang),
    willMove: pickCopy({ en: "will move to", mn: "шилжинэ:", ko: "이동 위치:" }, lang),
    newTag: pickCopy({ en: "(new)", mn: "(шинэ)", ko: "(새로 만듦)" }, lang),
    back: pickCopy({ en: "Back", mn: "Буцах", ko: "뒤로" }, lang),
    yes: pickCopy({ en: "Yes, move", mn: "Тийм, шилжүүлэх", ko: "네, 이동" }, lang),
    items: pickCopy({ en: "item(s)", mn: "зүйл", ko: "개 항목" }, lang),
    pickPersona: pickCopy({ en: "Pick a persona first", mn: "Эхлээд дүр сонгоно уу", ko: "먼저 페르소나를 선택하세요" }, lang),
  };

  const [persona, setPersona] = useState("");
  const [project, setProject] = useState("");
  const [newPersonaName, setNewPersonaName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);

  const { data: personas = [] } = useQuery<Persona[]>({
    queryKey: ["personas", userId],
    queryFn: () => listPersonas(userId),
    enabled: Boolean(userId),
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["persona-projects", userId, persona || null],
    queryFn: () => listProjectsByPersona(userId, persona || null),
    enabled: Boolean(userId) && Boolean(persona) && persona !== "__new",
  });

  const field =
    "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary";

  const personaLabel =
    persona === "__new" ? `${newPersonaName.trim()} ${c.newTag}` : personas.find((p) => p.id === persona)?.name ?? "";
  const projectLabel =
    persona === "__new" || project === "__new"
      ? `${newProjectName.trim()} ${c.newTag}`
      : projects.find((p) => p.id === project)?.title ?? "";

  /** First press: validate the user's own choices and show the summary. Nothing is saved yet. */
  const toReview = () => {
    if (!persona) return toast.error(c.pickPersona);
    if (persona === "__new" && !newPersonaName.trim()) return toast.error(c.needName);
    const needsNewProject = persona === "__new" || project === "__new";
    if (!needsNewProject && !project) return toast.error(c.pickProject);
    if (needsNewProject && !newProjectName.trim()) return toast.error(c.needName);
    setReview(true);
  };

  const confirm = async () => {
    setBusy(true);
    try {
      let personaId = persona;
      let personaName = personas.find((p) => p.id === persona)?.name ?? "";
      if (persona === "__new") {
        const { persona: made, error } = await createPersona(userId, { name: newPersonaName.trim() });
        if (error || !made) throw new Error(error ?? "Could not create that persona");
        personaId = made.id;
        personaName = made.name;
      }
      let projectId = project;
      if (persona === "__new" || projectId === "__new") {
        const { project: made, error } = await createProject(userId, {
          title: newProjectName.trim(),
          personaId,
          creatorName: personaName,
        });
        if (error || !made) throw new Error(error ?? "Could not create that project");
        projectId = made.id;
      }
      await onFile({ personaId, projectId });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4">
      <div className="w-full max-w-md space-y-3 rounded-[12px] border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{c.heading}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={c.cancel}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block text-xs text-muted-foreground">
          {c.whose}
          <select
            value={persona}
            onChange={(e) => {
              setPersona(e.target.value);
              setProject("");
            }}
            className={field}
          >
            <option value="">—</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="__new">{c.newPersona}</option>
          </select>
        </label>
        {persona === "__new" && (
          <input
            value={newPersonaName}
            onChange={(e) => setNewPersonaName(e.target.value)}
            placeholder={c.personaName}
            className={field}
          />
        )}

        {persona && persona !== "__new" && (
          <label className="block text-xs text-muted-foreground">
            {c.which}
            <select value={project} onChange={(e) => setProject(e.target.value)} className={field}>
              <option value="">—</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
              <option value="__new">{c.newProject}</option>
            </select>
          </label>
        )}
        {(persona === "__new" || project === "__new") && (
          <input
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder={c.projectName}
            className={field}
          />
        )}

        {review && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-xs text-foreground">
            <p className="font-semibold">{c.confirmTitle}</p>
            <p className="mt-1">
              {count} {c.items} {c.willMove} <b>{personaLabel}</b> / <b>{projectLabel}</b>
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={review ? () => setReview(false) : onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
          >
            {review ? c.back : c.cancel}
          </button>
          <button
            type="button"
            onClick={() => (review ? void confirm() : toReview())}
            disabled={busy || !persona}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {review ? c.yes : c.file}
          </button>
        </div>
      </div>
    </div>
  );
}
