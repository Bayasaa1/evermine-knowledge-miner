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
}: {
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
    pickPersona: pickCopy({ en: "Pick a persona first", mn: "Эхлээд дүр сонгоно уу", ko: "먼저 페르소나를 선택하세요" }, lang),
  };

  const [persona, setPersona] = useState("");
  const [project, setProject] = useState("");
  const [newPersonaName, setNewPersonaName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [busy, setBusy] = useState(false);

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

  const confirm = async () => {
    if (!persona) {
      toast.error(c.pickPersona);
      return;
    }
    setBusy(true);
    try {
      let personaId = persona;
      let personaName = personas.find((p) => p.id === persona)?.name ?? "";
      if (persona === "__new") {
        const { persona: made, error } = await createPersona(userId, { name: newPersonaName });
        if (error || !made) throw new Error(error ?? "Could not create that persona");
        personaId = made.id;
        personaName = made.name;
      }
      let projectId = project;
      if (!projectId || projectId === "__new") {
        const { project: made, error } = await createProject(userId, {
          title: newProjectName.trim() || title || "New project",
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
              <option value="__new">{c.newProject}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
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

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
          >
            {c.cancel}
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy || !persona}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {c.file}
          </button>
        </div>
      </div>
    </div>
  );
}
