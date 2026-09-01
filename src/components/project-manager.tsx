import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, FolderPlus, GraduationCap, Loader2, Plus, Trash2, Video } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { youtubeId } from "@/lib/import-sources";
import {
  addProjectContent,
  createProject,
  deleteProject,
  deleteProjectContent,
  listMyProjects,
  listProjectContent,
  updateProject,
  type ContentKind,
  type Project,
  type ProjectContent,
} from "@/lib/projects";
import { pickCopy, type Lang } from "@/lib/i18n";

const copy = {
  en: {
    title: "Projects",
    subtitle: "Create unlimited projects. Each holds playable feed videos and training-only material.",
    signIn: "Sign in to manage your projects.",
    newProject: "New project",
    projectName: "Project name",
    create: "Create",
    published: "Public",
    hidden: "Hidden",
    addContent: "Add content",
    url: "YouTube link",
    clipTitle: "Title",
    visual: "Visual content (public feed)",
    training: "Training only (brain, not in feed)",
    add: "Add",
    empty: "No projects yet — create your first one.",
    noContent: "No content in this project yet.",
    badUrl: "That is not a valid YouTube link.",
    added: "Content added",
    removed: "Removed",
    createdMsg: "Project created",
    deleteConfirm: "Delete this project and all of its content?",
  },
  mn: {
    title: "Төслүүд",
    subtitle: "Хязгааргүй төсөл үүсгээрэй. Төсөл бүр нийтийн видео болон сургалтын материалыг агуулна.",
    signIn: "Төслөө удирдахын тулд нэвтэрнэ үү.",
    newProject: "Шинэ төсөл",
    projectName: "Төслийн нэр",
    create: "Үүсгэх",
    published: "Нийтийн",
    hidden: "Нуусан",
    addContent: "Контент нэмэх",
    url: "YouTube холбоос",
    clipTitle: "Гарчиг",
    visual: "Үзэх контент (нийтийн фийд)",
    training: "Зөвхөн сургалт (фийдэд харагдахгүй)",
    add: "Нэмэх",
    empty: "Одоогоор төсөл алга — эхнийхээ үүсгээрэй.",
    noContent: "Энэ төсөлд контент алга.",
    badUrl: "Буруу YouTube холбоос байна.",
    added: "Контент нэмэгдлээ",
    removed: "Устгагдлаа",
    createdMsg: "Төсөл үүслээ",
    deleteConfirm: "Энэ төслийг бүх контенттой нь устгах уу?",
  },
  ko: {
    title: "프로젝트",
    subtitle: "무제한 프로젝트를 만드세요. 각 프로젝트는 공개 영상과 학습 전용 자료를 담습니다.",
    signIn: "프로젝트를 관리하려면 로그인하세요.",
    newProject: "새 프로젝트",
    projectName: "프로젝트 이름",
    create: "만들기",
    published: "공개",
    hidden: "숨김",
    addContent: "콘텐츠 추가",
    url: "YouTube 링크",
    clipTitle: "제목",
    visual: "비주얼 콘텐츠 (공개 피드)",
    training: "학습 전용 (피드에 표시 안 됨)",
    add: "추가",
    empty: "아직 프로젝트가 없습니다 — 첫 프로젝트를 만들어보세요.",
    noContent: "이 프로젝트에는 콘텐츠가 없습니다.",
    badUrl: "유효한 YouTube 링크가 아닙니다.",
    added: "콘텐츠가 추가되었습니다",
    removed: "삭제되었습니다",
    createdMsg: "프로젝트가 생성되었습니다",
    deleteConfirm: "이 프로젝트와 모든 콘텐츠를 삭제할까요?",
  },
} as const;

/** Creator-side hub for unlimited Projects and their two content types. */
export function ProjectManager({ lang = "en" }: { lang?: Lang }) {
  const t = pickCopy(copy, lang);
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setProjects([]);
      return;
    }
    setProjects(await listMyProjects(user.id));
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) {
    return (
      <section className="rounded-[12px] border border-border bg-card p-5 text-sm text-muted-foreground">
        {t.signIn}
      </section>
    );
  }

  const create = async () => {
    setBusy(true);
    const { error } = await createProject(user.id, { title: name });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    setName("");
    toast.success(t.createdMsg);
    void load();
  };

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-foreground">{t.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t.subtitle}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-card p-4">
        <FolderPlus className="h-4 w-4 text-primary" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.projectName}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || !name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {t.create}
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.empty}</p>
      ) : (
        projects.map((p) => <ProjectCard key={p.id} project={p} t={t} onChanged={() => void load()} />)
      )}
    </section>
  );
}

function ProjectCard({
  project,
  t,
  onChanged,
}: {
  project: Project;
  t: (typeof copy)["en"];
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [items, setItems] = useState<ProjectContent[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ContentKind>("VISUAL_CONTENT");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setItems(await listProjectContent(project.id));
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!user) return;
    const vid = youtubeId(url);
    if (!vid) {
      toast.error(t.badUrl);
      return;
    }
    setBusy(true);
    const error = await addProjectContent(user.id, {
      projectId: project.id,
      kind,
      youtubeId: vid,
      sourceUrl: url.trim(),
      title,
    });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    setUrl("");
    setTitle("");
    toast.success(t.added);
    void load();
  };

  const visual = items.filter((i) => i.kind === "VISUAL_CONTENT");
  const training = items.filter((i) => i.kind === "TRAINING_ONLY");

  return (
    <article className="rounded-[12px] border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{project.title}</h3>
        <button
          type="button"
          onClick={async () => {
            await updateProject(project.id, { published: !project.published });
            onChanged();
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground"
        >
          {project.published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {project.published ? t.published : t.hidden}
        </button>
        <button
          type="button"
          aria-label="Delete project"
          onClick={async () => {
            if (!window.confirm(t.deleteConfirm)) return;
            await deleteProject(project.id);
            onChanged();
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 space-y-2 rounded-xl border border-border bg-muted/40 p-3">
        <p className="text-[11px] font-semibold text-muted-foreground">{t.addContent}</p>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t.url}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.clipTitle}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ContentKind)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="VISUAL_CONTENT">{t.visual}</option>
            <option value="TRAINING_ONLY">{t.training}</option>
          </select>
          <button
            type="button"
            onClick={() => void add()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {t.add}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t.noContent}</p>
      ) : (
        <ul className="space-y-1.5">
          {[...visual, ...training].map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
              {item.kind === "VISUAL_CONTENT" ? (
                <Video className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <GraduationCap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{item.title}</span>
              <span className="text-[10px] text-muted-foreground">
                {item.kind === "VISUAL_CONTENT" ? t.visual : t.training}
              </span>
              <button
                type="button"
                aria-label="Remove content"
                onClick={async () => {
                  await deleteProjectContent(item.id);
                  toast.success(t.removed);
                  void load();
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
