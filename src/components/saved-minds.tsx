/**
 * Saved Minds — the persona-scoped list of mined Core Brains.
 *
 * Strict isolation: a mind only appears under the persona (and project) it was
 * mined for, so switching personas never dumps another identity's material into
 * view. Every entry supports full CRUD: inspect the Core Brain JSON, rename or
 * re-assign it, and delete it together with its version history.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import type { SourcePayload } from "@/lib/source-vault.functions";

import { CloudCheck, Columns3, Eye, Gavel, Loader2, Pencil, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { MindExplorer } from "@/components/mind-explorer";
import { MindAuditor } from "@/components/mind-auditor";
import { ResultCompare } from "@/components/result-compare";
import type { MindPayload } from "@/lib/mind-json";
import { saveMindVersion } from "@/lib/mind-versions.functions";

import { listVaults, updateVault, type VaultRow } from "@/lib/cloud-vault.functions";
import { listMiningJobs } from "@/lib/mining-jobs.functions";
import { jobProgress, type MiningJob } from "@/lib/mining-jobs";
import { permanentlyDeleteVideo } from "@/lib/content-delete.functions";
import { listPersonas, type Persona } from "@/lib/personas";
import { listProjectsByPersona, type Project } from "@/lib/projects";
import { useAuth } from "@/hooks/use-auth";
import { pickCopy, type Lang } from "@/lib/i18n";

export function SavedMinds({
  lang,
  forcedPersona,
}: {
  lang: Lang;
  /** When set, the list is locked to this persona and the filter chips hide. */
  forcedPersona?: { id: string | null; name: string } | null | undefined;
}) {
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const fetchVaults = useServerFn(listVaults);
  const saveVault = useServerFn(updateVault);
  const removeVideo = useServerFn(permanentlyDeleteVideo);
  const saveVersion = useServerFn(saveMindVersion);

  const locked = forcedPersona !== undefined;
  const [picked, setPicked] = useState<string | null>(null);
  const personaId = locked ? (forcedPersona?.id ?? null) : picked;
  const setPersonaId = setPicked;
  const [inspect, setInspect] = useState<VaultRow | null>(null);
  const [editing, setEditing] = useState<VaultRow | null>(null);
  /** Mined row currently open in the Auditor, with its saved video row. */
  const [auditing, setAuditing] = useState<{ row: VaultRow; sourceId: string | null } | null>(null);
  /** Mined row currently open in the side-by-side AI result comparison. */
  const [comparing, setComparing] = useState<VaultRow | null>(null);

  /** Saved source rows ticked for batch mining. */
  const [selected, setSelected] = useState<string[]>([]);
  /** Which card (or "batch") has its small mining setup panel open. */
  const [setupId, setSetupId] = useState<string | null>(null);

  const t = {
    title: pickCopy({ en: "Saved Minds", mn: "Хадгалсан оюунууд", ko: "저장된 마인드" }, lang),
    all: pickCopy({ en: "All personas", mn: "Бүх дүр", ko: "모든 페르소나" }, lang),
    empty: pickCopy(
      {
        en: "Nothing saved for this persona yet — mine a video in Creator Studio.",
        mn: "Энэ дүрд хадгалсан зүйл алга — Creator Studio дээр видео олборлоно уу.",
        ko: "이 페르소나에 저장된 항목이 없습니다 — 크리에이터 스튜디오에서 영상을 마이닝하세요.",
      },
      lang,
    ),
    view: pickCopy({ en: "Core Brain", mn: "Гол тархи", ko: "코어 브레인" }, lang),
    auditor: pickCopy({ en: "Auditor", mn: "Аудитор", ko: "감사관" }, lang),
    compare: pickCopy({ en: "Compare", mn: "Харьцуулах", ko: "비교" }, lang),

    edit: pickCopy({ en: "Edit", mn: "Засах", ko: "편집" }, lang),
    del: pickCopy({ en: "Delete", mn: "Устгах", ko: "삭제" }, lang),
    confirm: pickCopy(
      {
        en: "Delete this Mind and its entire version history?",
        mn: "Энэ оюун болон бүх хувилбарын түүхийг устгах уу?",
        ko: "이 마인드와 모든 버전 기록을 삭제할까요?",
      },
      lang,
    ),
    saved: pickCopy({ en: "Saved", mn: "Хадгаллаа", ko: "저장됨" }, lang),
    deleted: pickCopy({ en: "Deleted", mn: "Устгалаа", ko: "삭제됨" }, lang),
    name: pickCopy({ en: "Name", mn: "Нэр", ko: "이름" }, lang),
    persona: pickCopy({ en: "Persona", mn: "Дүр", ko: "페르소나" }, lang),
    project: pickCopy({ en: "Project", mn: "Төсөл", ko: "프로젝트" }, lang),
    minedSection: pickCopy({ en: "Mined videos", mn: "Олборлосон видео", ko: "마이닝된 영상" }, lang),
    pendingSection: pickCopy(
      { en: "Saved, not mined yet", mn: "Хадгалсан, хараахан олборлоогүй", ko: "저장됨, 아직 마이닝 안 함" },
      lang,
    ),
    notFiled: pickCopy({ en: "Not filed", mn: "Бүртгэгдээгүй", ko: "미분류" }, lang),
    setupMine: pickCopy({ en: "Set up & mine", mn: "Тохируулж олборлох", ko: "설정 후 마이닝" }, lang),
    none: pickCopy({ en: "Unassigned", mn: "Хуваарилаагүй", ko: "미지정" }, lang),
    save: pickCopy({ en: "Save", mn: "Хадгалах", ko: "저장" }, lang),
    close: pickCopy({ en: "Close", mn: "Хаах", ko: "닫기" }, lang),
    mine: pickCopy({ en: "Mine", mn: "Олборлох", ko: "마이닝" }, lang),
    mined: pickCopy({ en: "Mined", mn: "Олборлосон", ko: "마이닝 완료" }, lang),
    pending: pickCopy({ en: "Ready to mine", mn: "Олборлоход бэлэн", ko: "마이닝 대기" }, lang),
    mining: pickCopy({ en: "Mining now", mn: "Одоо олборлож байна", ko: "마이닝 중" }, lang),
    queued: pickCopy({ en: "Queued", mn: "Дараалалд", ko: "대기열" }, lang),
    paused: pickCopy({ en: "Paused", mn: "Түр зогссон", ko: "일시중지" }, lang),
    saves: pickCopy({ en: "saves", mn: "хадгалалт", ko: "저장본" }, lang),
    selectAll: pickCopy({ en: "Select all", mn: "Бүгдийг сонгох", ko: "전체 선택" }, lang),
    clear: pickCopy({ en: "Clear", mn: "Цэвэрлэх", ko: "해제" }, lang),
    picked: pickCopy({ en: "picked", mn: "сонгосон", ko: "선택됨" }, lang),
    mineSelected: pickCopy({ en: "Mine selected", mn: "Сонгосныг олборлох", ko: "선택 항목 마이닝" }, lang),
    batchHint: pickCopy(
      {
        en: "They mine one after another. In the next step you can give each video its own AI — for example Groq on three and Gemini on five.",
        mn: "Тэдгээр нь ээлжлэн олборлогдоно. Дараагийн алхамд видео бүрт өөр AI өгч болно — жишээ нь гурав нь Groq, тав нь Gemini.",
        ko: "하나씩 차례로 마이닝됩니다. 다음 단계에서 영상마다 다른 AI를 지정할 수 있습니다 — 예: 3개는 Groq, 5개는 Gemini.",
      },
      lang,
    ),


  };

  const { data: personas = [] } = useQuery<Persona[]>({
    queryKey: ["personas", userId],
    queryFn: () => (userId ? listPersonas(userId) : Promise.resolve([])),
    enabled: Boolean(userId),
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["persona-projects", userId, personaId],
    queryFn: () => (userId ? listProjectsByPersona(userId, personaId) : Promise.resolve([])),
    enabled: Boolean(userId),
  });

  const { data: vaults = [], isLoading } = useQuery<VaultRow[]>({
    // Owner id first: saved Minds of one account can never render under another.
    queryKey: ["cloud-vaults", userId, locked ? `locked:${personaId ?? "master"}` : personaId],
    queryFn: () =>
      fetchVaults({
        data: locked || personaId ? { scoped: true, personaId } : {},
      }),
    enabled: isAuthenticated && Boolean(userId),
    refetchOnMount: "always",
  });

  /** Live mining jobs, so a video that is already being mined never invites another run. */
  const fetchJobs = useServerFn(listMiningJobs);
  const { data: jobs = [] } = useQuery<MiningJob[]>({
    queryKey: ["mining-jobs", userId, "saved-minds"],
    queryFn: () => fetchJobs({}),
    enabled: isAuthenticated && Boolean(userId),
    refetchInterval: 8000,
    staleTime: 4000,
  });

  /** youtube id -> the newest job that is still in flight for that video. */
  const activeJobs = useMemo(() => {
    const live = new Set(["queued", "running", "paused", "paused_quota"]);
    const map = new Map<string, MiningJob>();
    for (const j of jobs) {
      if (!live.has(j.status)) continue;
      const id = j.sourceUrl.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)?.[1];
      if (!id || map.has(id)) continue;
      map.set(id, j);
    }
    return map;
  }, [jobs]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });

  const patch = useMutation({
    mutationFn: (input: { id: string; title?: string; personaId?: string | null; projectId?: string | null }) =>
      saveVault({ data: input }),
    onSuccess: async () => {
      toast.success(t.saved);
      setEditing(null);
      await refresh();
    },
    onError: (e: unknown) => toast.error(String(e)),
  });

  const drop = useMutation({
    mutationFn: (input: { vaultIds: string[]; youtubeId?: string }) => removeVideo({ data: input }),
    onSuccess: async () => {
      toast.success(t.deleted);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["mind-versions"] });
      await queryClient.invalidateQueries({ queryKey: ["project-content"] });
      await queryClient.invalidateQueries({ queryKey: ["graph-content"] });
      await queryClient.invalidateQueries({ queryKey: ["graph-vaults"] });
      await queryClient.invalidateQueries({ queryKey: ["subtitle-health"] });
      await queryClient.invalidateQueries({ queryKey: ["mining-jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["home-feed"] });
    },
    onError: (e: unknown) => toast.error(String(e)),
  });

  /**
   * One card per video. A video normally leaves several rows behind (the saved
   * source, plus one row per mining run), so they are folded into a single
   * entry keyed by the YouTube id — or the title when no id is available.
   */
  const groups = useMemo(() => {
    const youtubeId = (text: string | undefined | null): string | null => {
      if (!text) return null;
      const m =
        text.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) ??
        text.match(/^([\w-]{11})$/);
      return m?.[1] ?? null;
    };
    const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, " ");
    const idOf = (v: VaultRow): string | null => {
      const payload = (v.payload ?? {}) as Record<string, unknown>;
      const video = (payload['video'] ?? {}) as Record<string, unknown>;
      const source = (payload['source'] ?? {}) as Record<string, unknown>;
      return (
        youtubeId(typeof video['videoId'] === "string" ? video['videoId'] : null) ??
        youtubeId(typeof video['url'] === "string" ? video['url'] : null) ??
        youtubeId(typeof source['label'] === "string" ? source['label'] : null)
      );
    };
    const labelOf = (v: VaultRow): string => {
      const payload = (v.payload ?? {}) as Record<string, unknown>;
      const source = (payload['source'] ?? {}) as Record<string, unknown>;
      const video = (payload['video'] ?? {}) as Record<string, unknown>;
      return typeof video['title'] === "string" && video['title']
        ? video['title']
        : typeof source['label'] === "string" && source['label']
          ? source['label']
          : v.title;
    };

    // Rows that know their YouTube id teach the others: a mined row often only
    // carries the video title, so titles are mapped back onto the same video.
    const alias = new Map<string, string>();
    for (const v of vaults) {
      const id = idOf(v);
      if (!id) continue;
      alias.set(norm(v.title), id);
      alias.set(norm(labelOf(v)), id);
    }

    const keyOf = (v: VaultRow): string => {
      const id = idOf(v) ?? alias.get(norm(labelOf(v))) ?? alias.get(norm(v.title));
      if (id) return `yt:${id}`;
      return `t:${norm(labelOf(v))}`;
    };

    const map = new Map<string, VaultRow[]>();
    for (const v of vaults) {
      const k = keyOf(v);
      const list = map.get(k);
      if (list) list.push(v);
      else map.set(k, [v]);
    }

    return [...map.values()].map((rows) => {
      const source = rows.find((r) => r.kind === "source") ?? null;
      const mined = rows.find((r) => r.kind !== "source") ?? null;
      const primary = source ?? rows[0]!;
      const videoId = idOf(primary) ?? undefined;
      const src = source ? (source.payload as unknown as SourcePayload) : null;
      // A card always shows a picture when the video has a YouTube id — rows
      // that came straight from mining carry no saved thumbnail.
      const thumb = src?.video?.thumbnail || (videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : "");
      const isMined = Boolean(mined) || src?.status === "mined";
      const sourceUrl = src?.video?.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "");
      return {
        rows,
        source,
        mined,
        isMined,
        primary,
        title: source?.title ?? primary.title,
        youtubeId: videoId,
        thumb,
        sourceUrl,
        unfiled: primary.personaId === null,
      };
    });
  }, [vaults]);

  /** Saved source rows that still need mining — the only tickable ones. */
  const mineable = useMemo(
    () =>
      groups
        .filter((g) => g.source && !g.isMined && !(g.youtubeId && activeJobs.has(g.youtubeId)))
        .map((g) => g.source!.id),
    [groups, activeJobs],
  );

  const pendingGroups = useMemo(() => groups.filter((g) => !g.isMined), [groups]);
  const minedGroups = useMemo(() => groups.filter((g) => g.isMined), [groups]);

  if (!isAuthenticated) return null;


  return (
    <section className="rounded-[12px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CloudCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{t.title}</p>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {locked ? (
          <span className="ml-auto rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
            {forcedPersona?.name ?? t.all}
          </span>
        ) : (
          <select
            value={personaId ?? ""}
            onChange={(e) => setPersonaId(e.target.value || null)}
            className="ml-auto rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            aria-label={t.persona}
          >
            <option value="">{t.all}</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {mineable.length > 0 && (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-background p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(selected.length === mineable.length ? [] : mineable)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {selected.length === mineable.length ? t.clear : t.selectAll}
            </button>
            <span className="text-xs text-muted-foreground">
              {selected.length} {t.picked}
            </span>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => setSetupId(setupId === "batch" ? null : "batch")}
              className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {t.mineSelected}
            </button>
          </div>
          <p className="hidden text-[11px] text-muted-foreground sm:block">{t.batchHint}</p>
          {setupId === "batch" && selected.length > 0 ? (
            <MineSetup
              lang={lang}
              userId={userId ?? ""}
              personaId={personaId}
              sources={groups
                .filter((g) => g.source && selected.includes(g.source.id))
                .map((g) => ({
                  url: g.sourceUrl,
                  title: g.title,
                  projectId: g.primary.projectId,
                  payload: g.source ? (g.source.payload as unknown as SourcePayload) : null,
                }))}
              onDone={() => {
                setSetupId(null);
                setSelected([]);
                void refresh();
                void queryClient.invalidateQueries({ queryKey: ["mining-jobs"] });
              }}
            />
          ) : null}
        </div>
      )}

      {groups.length > 0 ? (
        <div className="mt-3 space-y-5">
          {[
            { key: "pending", label: t.pendingSection, list: pendingGroups },
            { key: "mined", label: t.minedSection, list: minedGroups },
          ]
            .filter((s) => s.list.length > 0)
            .map((section) => (
              <div key={section.key}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label} ({section.list.length})
                </p>
                <ul className="space-y-2">
                  {section.list.map((g) => {
                    const v = g.primary;
                    const src = g.source ? (g.source.payload as unknown as SourcePayload) : null;
                    const video = src?.video;
                    const mined = g.isMined;
                    const openRow = g.mined ?? v;
                    const sourceId = g.source?.id ?? null;
                    const ticked = sourceId ? selected.includes(sourceId) : false;
                    const job = g.youtubeId ? activeJobs.get(g.youtubeId) : undefined;
                    const busy = Boolean(job) && !mined;
                    const jobLabel = job
                      ? job.status === "queued"
                        ? t.queued
                        : job.status === "running"
                          ? `${t.mining} ${jobProgress(job)}%`
                          : t.paused
                      : "";
                    return (
                      <li key={v.id} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-start gap-2">
                          {!mined && !busy && sourceId && (
                            <input
                              type="checkbox"
                              checked={ticked}
                              onChange={() =>
                                setSelected((prev) =>
                                  prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId],
                                )
                              }
                              aria-label={t.mine}
                              className="mt-1 h-4 w-4 shrink-0 accent-primary"
                            />
                          )}

                          {g.thumb ? (
                            <img
                              src={g.thumb}
                              alt=""
                              loading="lazy"
                              className="h-12 w-20 shrink-0 rounded-md bg-muted object-cover"
                            />
                          ) : (
                            <span className="h-12 w-20 shrink-0 rounded-md bg-muted" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 break-words text-sm font-medium leading-snug text-foreground">{g.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {[video?.channel, video?.durationLabel].filter(Boolean).join(" · ")}
                              {video ? " · " : ""}
                              <span className={mined ? "text-emerald-500" : busy ? "text-primary" : "text-amber-500"}>
                                {mined ? t.mined : busy ? jobLabel : t.pending}
                              </span>
                              {g.rows.length > 1 ? ` · ${g.rows.length} ${t.saves}` : ""}
                              {g.unfiled && personaId ? (
                                <span className="text-amber-500"> · {t.notFiled}</span>
                              ) : null}
                            </p>
                            {video?.description && (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{video.description}</p>
                            )}
                          </div>
                        </div>

                        {/* Actions live on their own wrapped row so nothing overflows on phones. */}
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {busy ? (
                            <Link
                              to="/mining"
                              className="inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary"
                            >
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {jobLabel}
                            </Link>
                          ) : !mined ? (
                            <button
                              type="button"
                              disabled={!g.sourceUrl}
                              onClick={() => setSetupId(setupId === v.id ? null : v.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                              {t.setupMine}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setInspect(openRow)}
                                title={t.view}
                                aria-label={t.view}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t.view}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setAuditing({ row: openRow, sourceId })}
                                title={t.auditor}
                                aria-label={t.auditor}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <Gavel className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t.auditor}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setComparing(openRow)}
                                title={t.compare}
                                aria-label={t.compare}
                                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <Columns3 className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">{t.compare}</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setEditing(v)}
                            title={t.edit}
                            aria-label={t.edit}
                            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={drop.isPending}
                            onClick={() => {
                              if (window.confirm(t.confirm)) {
                                drop.mutate({ vaultIds: g.rows.map((r) => r.id), ...(g.youtubeId ? { youtubeId: g.youtubeId } : {}) });
                              }
                            }}
                            title={t.del}
                            aria-label={t.del}
                            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {setupId === v.id && !mined ? (
                          <MineSetup
                            lang={lang}
                            userId={userId ?? ""}
                            personaId={personaId}
                            sources={[{ url: g.sourceUrl, title: g.title, projectId: v.projectId, payload: src }]}
                            onDone={() => {
                              setSetupId(null);
                              void refresh();
                              void queryClient.invalidateQueries({ queryKey: ["mining-jobs"] });
                            }}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
        </div>
      ) : (
        !isLoading && <p className="mt-3 text-sm text-muted-foreground">{t.empty}</p>
      )}

      {inspect && (
        <MindExplorer
          lang={lang}
          open={!!inspect}
          onOpenChange={(o) => { if (!o) setInspect(null); }}
          title={inspect.title}
          payload={(inspect.payload ?? {}) as MindPayload}
          onSave={async (next, notes) => {
            await saveVersion({
              data: {
                vaultId: inspect.id,
                title: inspect.title,
                payload: next as never,
                releaseNotes: notes,
              },
            });
            await refresh();
            await queryClient.invalidateQueries({ queryKey: ["mind-versions"] });
          }}
        />
      )}

      {auditing && (
        <MindAuditor
          lang={lang}
          open={!!auditing}
          onOpenChange={(o) => { if (!o) setAuditing(null); }}
          vaultId={auditing.row.id}
          title={auditing.row.title}
          // Always the freshest copy, so a new audit appears immediately.
          payload={((vaults.find((v) => v.id === auditing.row.id) ?? auditing.row).payload ?? {}) as MindPayload}
          sourceId={auditing.sourceId}
          onChanged={refresh}
        />
      )}

      {comparing && (
        <ResultCompare
          lang={lang}
          open={!!comparing}
          onOpenChange={(o) => { if (!o) setComparing(null); }}
          vaultId={comparing.id}
          title={comparing.title}
          payload={((vaults.find((v) => v.id === comparing.id) ?? comparing).payload ?? {}) as MindPayload}
          onChanged={refresh}
        />
      )}




      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              patch.mutate({
                id: editing.id,
                title: String(form.get("title") ?? ""),
                personaId: (String(form.get("persona") ?? "") || null) as string | null,
                projectId: (String(form.get("project") ?? "") || null) as string | null,
              });
            }}
            className="w-full max-w-md space-y-3 rounded-[12px] border border-border bg-card p-4"
          >
            <p className="text-sm font-semibold text-foreground">{t.edit}</p>
            <label className="block text-xs text-muted-foreground">
              {t.name}
              <input
                name="title"
                defaultValue={editing.title}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              {t.persona}
              <select
                name="persona"
                defaultValue={editing.personaId ?? ""}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">{t.none}</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              {t.project}
              <select
                name="project"
                defaultValue={editing.projectId ?? ""}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">{t.none}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
              >
                {t.close}
              </button>
              <button
                type="submit"
                disabled={patch.isPending}
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
              >
                {t.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

/**
 * The small setup box on a saved (not yet mined) video: what kind of mind to
 * build, which AI key runs it, and which persona and project it is filed under.
 * Pressing Start queues the job right here — no trip through Creator Studio.
 */
function MineSetup({
  lang,
  userId,
  personaId,
  sources,
  onDone,
}: {
  lang: Lang;
  userId: string;
  personaId: string | null;
  sources: { url: string; title: string; projectId: string | null; payload: SourcePayload | null }[];
  onDone: () => void;
}) {
  const startMining = useServerFn(startMiningJobs);
  const keyStatus = useServerFn(getUserAiKeyStatus);

  const c = {
    type: pickCopy({ en: "What to build", mn: "Юу бүтээх вэ", ko: "무엇을 만들까요" }, lang),
    ai: pickCopy({ en: "Which AI", mn: "Аль AI", ko: "어떤 AI" }, lang),
    newest: pickCopy({ en: "Newest key", mn: "Хамгийн сүүлийн түлхүүр", ko: "최신 키" }, lang),
    persona: pickCopy({ en: "Persona", mn: "Дүр", ko: "페르소나" }, lang),
    project: pickCopy({ en: "Project", mn: "Төсөл", ko: "프로젝트" }, lang),
    newProject: pickCopy({ en: "New project…", mn: "Шинэ төсөл…", ko: "새 프로젝트…" }, lang),
    projectName: pickCopy({ en: "Project name", mn: "Төслийн нэр", ko: "프로젝트 이름" }, lang),
    start: pickCopy({ en: "Start mining", mn: "Олборлож эхлэх", ko: "마이닝 시작" }, lang),
    pickPersona: pickCopy({ en: "Pick a persona", mn: "Дүр сонгоно уу", ko: "페르소나를 선택하세요" }, lang),
    queued: pickCopy({ en: "Mining started", mn: "Олборлолт эхэллээ", ko: "마이닝이 시작되었습니다" }, lang),
  };

  const [category, setCategory] = useState<string>("knowledge");
  const [tail, setTail] = useState("");
  const [persona, setPersona] = useState<string>(personaId ?? "");
  const [project, setProject] = useState<string>(sources[0]?.projectId ?? "");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: personas = [] } = useQuery<Persona[]>({
    queryKey: ["personas", userId],
    queryFn: () => listPersonas(userId),
    enabled: Boolean(userId),
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["persona-projects", userId, persona || null],
    queryFn: () => listProjectsByPersona(userId, persona || null),
    enabled: Boolean(userId),
  });

  const { data: keys = [] } = useQuery({
    queryKey: ["ai-key-status", userId],
    queryFn: () => keyStatus(),
    enabled: Boolean(userId),
  });
  const geminiKeys = keys.filter((k) => k.provider === "gemini");

  const start = async () => {
    if (!persona) {
      toast.error(c.pickPersona);
      return;
    }
    setBusy(true);
    try {
      let target = project;
      if (!target || target === "__new") {
        const { project: made, error } = await createProject(userId, {
          title: newName.trim() || sources[0]?.title || "New project",
          personaId: persona,
          creatorName: personas.find((p) => p.id === persona)?.name ?? "",
        });
        if (error || !made) throw new Error(error ?? "Could not create that project");
        target = made.id;
      }
      const { bestGeminiKey } = await import("@/lib/api-keys");
      const localKey = tail ? null : await bestGeminiKey();
      for (const s of sources) {
        const video = s.payload?.video;
        await startMining({
          data: {
            url: s.url,
            category,
            personaId: persona,
            projectId: target,
            ...(tail ? { apiKeyTail: tail } : localKey ? { apiKey: localKey } : {}),
            assessment: {
              ...defaultAssessmentFor(category),
              sourceTitle: video?.title ?? s.title,
              sourceDescription: video?.description ?? "",
              sourceChannel: video?.channel ?? "",
              sourceDurationLabel: video?.durationLabel ?? "",
              sourcePublishedAt: video?.publishedAt ?? "",
              outputLanguage: lang,
            },
          },
        });
      }
      toast.success(c.queued);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary";

  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 sm:grid-cols-2">
      <label className="block text-[11px] text-muted-foreground">
        {c.type}
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mt-1 ${field}`}>
          {ACTIVE_CATEGORIES.map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[key][lang === "mn" || lang === "ko" ? lang : "en"].title}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-[11px] text-muted-foreground">
        {c.ai}
        <select value={tail} onChange={(e) => setTail(e.target.value)} className={`mt-1 ${field}`}>
          <option value="">{c.newest}</option>
          {geminiKeys.map((k) => (
            <option key={k.tail} value={k.tail}>
              Gemini ···{k.tail}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-[11px] text-muted-foreground">
        {c.persona}
        <select
          value={persona}
          onChange={(e) => { setPersona(e.target.value); setProject(""); }}
          className={`mt-1 ${field}`}
        >
          <option value="">{c.pickPersona}</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>

      <label className="block text-[11px] text-muted-foreground">
        {c.project}
        <select value={project} onChange={(e) => setProject(e.target.value)} className={`mt-1 ${field}`}>
          <option value="__new">{c.newProject}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </label>

      {(!project || project === "__new") && (
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={c.projectName}
          className={`${field} sm:col-span-2`}
        />
      )}

      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {c.start} {sources.length > 1 ? `(${sources.length})` : ""}
      </button>
    </div>
  );
}
