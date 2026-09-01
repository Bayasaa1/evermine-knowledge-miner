/**
 * Unified Vault Hub — Personas → Projects → Content / Core Brain / Analytics.
 *
 * Every signed-in creator can run several personas (Gamer, Finance, Personal…).
 * Each persona owns projects, each project holds VISUAL_CONTENT (public feed)
 * and TRAINING_ONLY material, all feeding one Core Brain whose growth and
 * monetization show up in the same dashboard.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  BarChart3,
  Brain,
  Check,
  ChevronRight,
  Coins,
  Eye,
  EyeOff,
  FolderPlus,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Smile,
  Star,
  Tag,
  Trash2,
  UserSquare2,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import {
  invalidatePersonaChain,
  personaProjectsKey,
  projectContentKey,
  usePersonas,
} from "@/hooks/use-personas";
import { pickCopy, type Lang } from "@/lib/i18n";
import { createPersona, deletePersona, personaHandle } from "@/lib/personas";
import {
  createProject,
  deleteProject,
  deleteProjectContent,
  listProjectContent,
  listProjectsByPersona,
  projectStats,
  updateProject,
  updateProjectContent,
  type ContentKind,
  type Project,
  type ProjectStats,
  type ProjectContent,
} from "@/lib/projects";
import { listMiningJobs } from "@/lib/mining-jobs.functions";
import { youtubeId } from "@/lib/import-sources";
import { VaultCoreBrain } from "@/components/vault-core-brain";
import { MindReviews } from "@/components/mind-reviews";

const C = {
  personas: { en: "Your Personas", mn: "Таны Персонууд", ko: "내 페르소나" },
  personasDesc: {
    en: "Run several identities from one account — each keeps its own projects, brain and feed.",
    mn: "Нэг бүртгэлээс олон биет ажиллуулна — тус бүр өөрийн төсөл, тархи, фийдтэй.",
    ko: "하나의 계정으로 여러 정체성을 운영하세요 — 각각 자체 프로젝트, 브레인, 피드를 가집니다.",
  },
  master: { en: "Master account", mn: "Үндсэн бүртгэл", ko: "마스터 계정" },
  newPersona: { en: "Persona name (e.g. Finance Persona)", mn: "Персоны нэр", ko: "페르소나 이름" },
  avatarUrl: { en: "Avatar image URL (optional)", mn: "Зургийн холбоос (заавал биш)", ko: "아바타 이미지 URL (선택)" },
  create: { en: "Create persona", mn: "Персон үүсгэх", ko: "페르소나 만들기" },
  active: { en: "Active", mn: "Идэвхтэй", ko: "활성" },
  activate: { en: "Set active", mn: "Идэвхжүүлэх", ko: "활성화" },
  open: { en: "Open projects", mn: "Төслүүд нээх", ko: "프로젝트 열기" },
  projects: { en: "Projects", mn: "Төслүүд", ko: "프로젝트" },
  back: { en: "Back", mn: "Буцах", ko: "뒤로" },
  newProject: { en: "New project name", mn: "Шинэ төслийн нэр", ko: "새 프로젝트 이름" },
  createProject: { en: "Create project", mn: "Төсөл үүсгэх", ko: "프로젝트 만들기" },
  noProjects: { en: "No projects for this persona yet.", mn: "Энэ персонд төсөл алга.", ko: "이 페르소나에는 아직 프로젝트가 없습니다." },
  published: { en: "Public", mn: "Нийтийн", ko: "공개" },
  hidden: { en: "Hidden", mn: "Нуусан", ko: "숨김" },
  visual: { en: "Visual content", mn: "Үзэх контент", ko: "비주얼 콘텐츠" },
  training: { en: "Training only", mn: "Зөвхөн сургалт", ko: "학습 전용" },
  coreBrain: { en: "Core Brain", mn: "Гол Тархи", ko: "코어 브레인" },
  analytics: { en: "Analytics & Reviews", mn: "Аналитик ба Сэтгэгдэл", ko: "분석 및 리뷰" },
  noContent: { en: "No videos in this list yet.", mn: "Энэ жагсаалтад видео алга.", ko: "이 목록에 영상이 없습니다." },
  mined: { en: "Mined", mn: "Олборлосон", ko: "마이닝됨" },
  chunksLabel: { en: "5-min chunks", mn: "5 мин хэсэг", ko: "5분 청크" },
  topics: { en: "Topics", mn: "Сэдэв", ko: "주제" },
  emotions: { en: "Emotion points", mn: "Сэтгэл хөдлөл", ko: "감정 포인트" },
  del: { en: "Delete video", mn: "Видео устгах", ko: "영상 삭제" },
  remine: { en: "Re-mine", mn: "Дахин олборлох", ko: "재마이닝" },
  remineHint: {
    en: "Link copied — paste it into Creator Studio to re-mine this video.",
    mn: "Холбоос хуулагдлаа — Creator Studio дээр буулгаж дахин олборлоно уу.",
    ko: "링크가 복사되었습니다 — Creator Studio에 붙여넣어 다시 마이닝하세요.",
  },
  editMeta: { en: "Edit metadata", mn: "Мэдээлэл засах", ko: "메타데이터 편집" },
  save: { en: "Save", mn: "Хадгалах", ko: "저장" },
  cancel: { en: "Cancel", mn: "Болих", ko: "취소" },
  titleField: { en: "Title", mn: "Гарчиг", ko: "제목" },
  descField: { en: "Description", mn: "Тайлбар", ko: "설명" },
  tagsField: { en: "Tags (comma separated)", mn: "Шошго (таслалаар)", ko: "태그 (쉼표 구분)" },
  moveTo: { en: "Move to", mn: "Зөөх", ko: "이동" },
  views: { en: "Views", mn: "Үзэлт", ko: "조회수" },
  earnings: { en: "Earnings", mn: "Орлого", ko: "수익" },
  tokens: { en: "Token usage", mn: "Токен зарцуулалт", ko: "토큰 사용량" },
  rating: { en: "Avg. rating", mn: "Дундаж үнэлгээ", ko: "평균 평점" },
  removed: { en: "Removed", mn: "Устгагдлаа", ko: "삭제되었습니다" },
  saved: { en: "Saved", mn: "Хадгалагдлаа", ko: "저장되었습니다" },
  createdMsg: { en: "Project created", mn: "Төсөл үүслээ", ko: "프로젝트가 생성되었습니다" },
  deleteProjectConfirm: {
    en: "Delete this project and all of its content?",
    mn: "Энэ төслийг бүх контенттой нь устгах уу?",
    ko: "이 프로젝트와 모든 콘텐츠를 삭제할까요?",
  },
  signIn: { en: "Sign in to open your vaults.", mn: "Сангаа нээхийн тулд нэвтэрнэ үү.", ko: "볼트를 열려면 로그인하세요." },
} as const;

type Tab = "VISUAL_CONTENT" | "TRAINING_ONLY" | "brain" | "analytics";

export function VaultHub({ lang = "en" }: { lang?: Lang }) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const queryClient = useQueryClient();
  const { userId, isAuthenticated, personas, activePersonaId, setActive, isLoading } = usePersonas();
  // Which persona's workspace is on screen — defaults to the globally active one.
  const [viewing, setViewing] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [avatar, setAvatar] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedId = viewing === undefined ? activePersonaId : viewing;
  const selected = personas.find((p) => p.id === selectedId) ?? null;
  const selectedName = selected?.name ?? t("master");

  if (!isAuthenticated || !userId) {
    return <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("signIn")}</p>;
  }

  const add = async () => {
    setBusy(true);
    const { persona, error } = await createPersona(userId, {
      name: draft,
      handle: personaHandle(draft),
      avatarUrl: avatar || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    setDraft("");
    setAvatar("");
    setShowCreate(false);
    if (persona) {
      await setActive(persona.id);
      setViewing(persona.id);
    }
    await invalidatePersonaChain(queryClient);
    toast.success(t("saved"));
  };

  const chip = (id: string | null, name: string, handle: string, avatarUrl?: string | null) => {
    const isViewing = selectedId === id;
    const isActive = activePersonaId === id;
    return (
      <button
        key={id ?? "master"}
        type="button"
        onClick={async () => {
          setViewing(id);
          if (!isActive) await setActive(id);
        }}
        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
          isViewing ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
        }`}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <UserSquare2 className="h-3.5 w-3.5" />
        )}
        <span className="max-w-[10rem] truncate">{name}</span>
        <span className="hidden text-[10px] font-normal opacity-70 sm:inline">{handle}</span>
        {isActive ? <Check className="h-3 w-3" /> : null}
      </button>
    );
  };

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t("personas")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("personasDesc")}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> {t("create")}
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          {chip(null, t("master"), "@master")}
          {personas.map((p) => chip(p.id, p.name, p.handle, p.avatar_url))}
        </div>

        {selected ? (
          <button
            type="button"
            onClick={async () => {
              const error = await deletePersona(selected.id);
              if (error) {
                toast.error(error);
                return;
              }
              setViewing(null);
              await invalidatePersonaChain(queryClient);
              toast.success(t("removed"));
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> {selected.name}
          </button>
        ) : null}

        {showCreate ? (
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("newPersona")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <input
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder={t("avatarUrl")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={!draft.trim() || busy}
              onClick={() => void add()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {t("create")}
            </button>
          </div>
        ) : null}
      </header>

      <PersonaWorkspace
        key={selectedId ?? "master"}
        lang={lang}
        userId={userId}
        personaId={selectedId}
        personaName={selectedName}
      />
    </section>
  );
}

function PersonaCard({
  lang,
  name,
  handle,
  avatarUrl,
  isActive,
  onOpen,
  onActivate,
  onDelete,
}: {
  lang: Lang;
  name: string;
  handle: string;
  avatarUrl?: string | null;
  isActive: boolean;
  onOpen: () => void;
  onActivate: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 text-left">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserSquare2 className="h-5 w-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{handle}</span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onActivate()}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
            isActive ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
          }`}
        >
          {isActive ? <Check className="h-3 w-3" /> : null}
          {isActive ? t("active") : t("activate")}
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground"
        >
          {t("open")}
        </button>
        {onDelete ? (
          <button
            type="button"
            aria-label={`Delete ${name}`}
            onClick={() => void onDelete()}
            className="ml-auto text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function PersonaWorkspace({
  lang,
  userId,
  personaId,
  personaName,
}: {
  lang: Lang;
  userId: string;
  personaId: string | null;
  personaName: string;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: personaProjectsKey(userId, personaId),
    queryFn: () => listProjectsByPersona(userId, personaId),
    refetchOnMount: "always",
  });

  const load = useCallback(
    () => queryClient.invalidateQueries({ queryKey: personaProjectsKey(userId, personaId) }),
    [queryClient, userId, personaId],
  );

  const open = projects.find((p) => p.id === openId) ?? null;

  const create = async () => {
    setBusy(true);
    const { error } = await createProject(userId, {
      title: name,
      personaId,
      creatorName: personaName,
    });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    setName("");
    toast.success(t("createdMsg"));
    void load();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        {open ? (
          <button type="button" onClick={() => setOpenId(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
          </button>
        ) : null}
        <p className="min-w-0 truncate text-sm font-semibold text-foreground">
          {personaName}
          {open ? <span className="text-muted-foreground"> / {open.title}</span> : null}
        </p>
      </div>

      {open ? (
        <ProjectWorkspace lang={lang} project={open} onChanged={() => void load()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
            <FolderPlus className="h-4 w-4 text-primary" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("newProject")}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy || !name.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {t("createProject")}
            </button>
          </div>

          {projects.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("noProjects")}</p>
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-4">
                  <button type="button" onClick={() => setOpenId(p.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold text-foreground">{p.title}</span>
                    <ProjectCardStats lang={lang} project={p} />
                  </button>
                  <button
                    type="button"
                    onClick={async () => { await updateProject(p.id, { published: !p.published }); void load(); }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground"
                  >
                    {p.published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {p.published ? t("published") : t("hidden")}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete project"
                    onClick={async () => {
                      if (!window.confirm(t("deleteProjectConfirm"))) return;
                      await deleteProject(p.id);
                      void load();
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** Live rating / earnings / views summary shown on each project card. */
function ProjectCardStats({ lang, project }: { lang: Lang; project: Project }) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const { data } = useQuery<ProjectStats>({
    queryKey: ["project-stats", project.id],
    queryFn: () => projectStats(project),
  });
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Eye className="h-3 w-3" /> {(data?.views ?? project.view_count).toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-1">
        <Coins className="h-3 w-3" /> {(data?.earnings ?? 0).toFixed(2)} {project.currency || "USD"}
      </span>
      <span className="inline-flex items-center gap-1">
        <Star className="h-3 w-3" /> {data?.rating ? `${data.rating.toFixed(1)} (${data.reviewCount})` : "—"}
      </span>
      <span>{new Date(project.updated_at).toLocaleDateString()}</span>
    </span>
  );
}

function ProjectWorkspace({ lang, project, onChanged }: { lang: Lang; project: Project; onChanged: () => void }) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("VISUAL_CONTENT");

  const { data: items = [], isLoading: loading } = useQuery({
    queryKey: projectContentKey(project.id),
    queryFn: () => listProjectContent(project.id),
    refetchOnMount: "always",
  });

  const load = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: projectContentKey(project.id) });
    await queryClient.invalidateQueries({ queryKey: ["project-stats", project.id] });
  }, [queryClient, project.id]);

  const fetchJobs = useServerFn(listMiningJobs);
  const { data: jobs = [] } = useQuery({ queryKey: ["mining-jobs"], queryFn: () => fetchJobs() });

  const mindIds = useMemo(() => [...new Set(items.map((i) => i.mind_id).filter(Boolean))], [items]);
  const list = items.filter((i) => i.kind === tab);

  const tabs: { key: Tab; label: string; icon: typeof Video }[] = [
    { key: "VISUAL_CONTENT", label: t("visual"), icon: Video },
    { key: "TRAINING_ONLY", label: t("training"), icon: GraduationCap },
    { key: "brain", label: t("coreBrain"), icon: Brain },
    { key: "analytics", label: t("analytics"), icon: BarChart3 },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "brain" ? (
        <VaultCoreBrain lang={lang} mindIds={mindIds} />
      ) : tab === "analytics" ? (
        <ProjectAnalytics lang={lang} project={project} items={items} />
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> …
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("noContent")}</p>
      ) : (
        <ul className="space-y-3">
          {list.map((item) => (
            <VideoCard
              key={item.id}
              lang={lang}
              item={item}
              progress={progressFor(item, jobs)}
              onChanged={() => { void load(); onChanged(); }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type Progress = { percent: number; done: number; total: number };

function progressFor(item: ProjectContent, jobs: { sourceUrl: string; nextIndex: number; totalChunks: number; status: string }[]): Progress {
  const job = jobs.find((j) => {
    const id = youtubeId(j.sourceUrl);
    return (id && id === item.youtube_id) || j.sourceUrl === item.source_url;
  });
  if (!job) {
    const mined = item.timeline.length > 0 || item.emotion_timeline.length > 0;
    return { percent: mined ? 100 : 0, done: 0, total: 0 };
  }
  const total = Math.max(1, job.totalChunks);
  const done = job.status === "done" ? total : Math.min(total, job.nextIndex);
  return { percent: Math.round((done / total) * 100), done, total };
}

function VideoCard({
  lang,
  item,
  progress,
  onChanged,
}: {
  lang: Lang;
  item: ProjectContent;
  progress: Progress;
  onChanged: () => void;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [kind, setKind] = useState<ContentKind>(item.kind);

  const topics = new Set(item.timeline.map((m) => m.label)).size;

  const save = async () => {
    const error = await updateProjectContent(item.id, {
      title,
      description,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      kind,
    });
    if (error) {
      toast.error(error);
      return;
    }
    setEditing(false);
    toast.success(t("saved"));
    onChanged();
  };

  return (
    <li className="min-w-0 rounded-xl border border-border bg-card p-4">
      <div className="flex gap-3">
        <img
          src={`https://i.ytimg.com/vi/${item.youtube_id}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          className="h-16 w-28 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{item.title || item.youtube_id}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.percent}% {t("mined")}
            {progress.total > 0 ? ` · ${progress.done}/${progress.total} ${t("chunksLabel")}` : ""}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
          <Tag className="h-3 w-3" /> {t("topics")}: {topics}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
          <Smile className="h-3 w-3" /> {t("emotions")}: {item.emotion_timeline.length}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
          <Eye className="h-3 w-3" /> {t("views")}: {item.view_count}
        </span>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titleField")}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descField")}
            rows={3}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t("tagsField")}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ContentKind)}
              aria-label={t("moveTo")}
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="VISUAL_CONTENT">{t("visual")}</option>
              <option value="TRAINING_ONLY">{t("training")}</option>
            </select>
            <button type="button" onClick={() => void save()} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
              {t("save")}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" /> {t("editMeta")}
          </button>
          <Link
            to="/creator"
            onClick={() => {
              const url = item.source_url || `https://www.youtube.com/watch?v=${item.youtube_id}`;
              void navigator.clipboard?.writeText(url).catch(() => undefined);
              toast.info(t("remineHint"));
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {t("remine")}
          </Link>
          <button
            type="button"
            onClick={async () => {
              const error = await deleteProjectContent(item.id);
              if (error) {
                toast.error(error);
                return;
              }
              toast.success(t("removed"));
              onChanged();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("del")}
          </button>
        </div>
      )}
    </li>
  );
}

function ProjectAnalytics({ lang, project, items }: { lang: Lang; project: Project; items: ProjectContent[] }) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const views = project.view_count + items.reduce((n, i) => n + i.view_count, 0);
  const signals = items.reduce((n, i) => n + i.timeline.length + i.emotion_timeline.length, 0);
  // Token usage is proportional to mined signals; earnings follow the project price.
  const tokens = signals * 120;
  const earnings = views * (project.price > 0 ? project.price * 0.01 : 0.002);

  const stats = [
    { icon: Eye, label: t("views"), value: views.toLocaleString() },
    { icon: Coins, label: t("earnings"), value: `${earnings.toFixed(2)} ${project.currency || "USD"}` },
    { icon: BarChart3, label: t("tokens"), value: tokens.toLocaleString() },
    { icon: Star, label: t("rating"), value: "—" },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3">
            <Icon className="mb-1.5 h-4 w-4 text-primary" />
            <p className="text-lg font-semibold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <MindReviews mindId={items.find((i) => i.mind_id)?.mind_id || project.id} lang={lang} />
    </div>
  );
}
