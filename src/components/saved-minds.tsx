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

import { CloudCheck, Eye, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { MindExplorer } from "@/components/mind-explorer";
import type { MindPayload } from "@/lib/mind-json";
import { saveMindVersion } from "@/lib/mind-versions.functions";
import { listVaults, updateVault, type VaultRow } from "@/lib/cloud-vault.functions";
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
    none: pickCopy({ en: "Unassigned", mn: "Хуваарилаагүй", ko: "미지정" }, lang),
    save: pickCopy({ en: "Save", mn: "Хадгалах", ko: "저장" }, lang),
    close: pickCopy({ en: "Close", mn: "Хаах", ko: "닫기" }, lang),
    mine: pickCopy({ en: "Mine", mn: "Олборлох", ko: "마이닝" }, lang),
    mined: pickCopy({ en: "Mined", mn: "Олборлосон", ko: "마이닝 완료" }, lang),
    pending: pickCopy({ en: "Ready to mine", mn: "Олборлоход бэлэн", ko: "마이닝 대기" }, lang),
    saves: pickCopy({ en: "saves", mn: "хадгалалт", ko: "저장본" }, lang),


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
    queryKey: ["cloud-vaults", locked ? `locked:${personaId ?? "master"}` : personaId],
    queryFn: () =>
      fetchVaults({
        data: locked || personaId ? { scoped: true, personaId } : {},
      }),
    enabled: isAuthenticated,
    refetchOnMount: "always",
  });

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
      return { rows, source, mined, primary, title: source?.title ?? primary.title, youtubeId: idOf(primary) ?? undefined };
    });
  }, [vaults]);

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
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2.5">
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
            onClick={() => {
              window.localStorage.setItem("evermind.mine-batch", JSON.stringify(selected));
              void navigate({ to: "/creator" });
            }}
            className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {t.mineSelected}
          </button>
          <p className="w-full text-[11px] text-muted-foreground">{t.batchHint}</p>
        </div>
      )}

      {groups.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {groups.map((g) => {
            const v = g.primary;
            const src = g.source ? (g.source.payload as unknown as SourcePayload) : null;
            const video = src?.video;
            const mined = Boolean(g.mined) || src?.status === "mined";
            const openRow = g.mined ?? v;
            const sourceId = g.source?.id ?? null;
            const ticked = sourceId ? selected.includes(sourceId) : false;
            return (
            <li key={v.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start gap-2">
                {!mined && sourceId && (
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

                {video?.thumbnail && (
                  <img
                    src={video.thumbnail}
                    alt=""
                    loading="lazy"
                    className="h-12 w-20 shrink-0 rounded-md object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{g.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[video?.channel, video?.durationLabel].filter(Boolean).join(" · ")}
                    {video ? " · " : ""}
                    <span className={mined ? "text-emerald-500" : "text-amber-500"}>
                      {mined ? t.mined : t.pending}
                    </span>
                    {g.rows.length > 1 ? ` · ${g.rows.length} ${t.saves}` : ""}
                  </p>
                  {video?.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{video.description}</p>
                  )}
                </div>
                {!mined ? (
                  <Link
                    to="/creator"
                    className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    {t.mine}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setInspect(openRow)}
                    title={t.view}
                    className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(v)}
                  title={t.edit}
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
                  className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
            );
          })}
        </ul>


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
