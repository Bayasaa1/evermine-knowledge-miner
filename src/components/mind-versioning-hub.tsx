/**
 * Mind Versioning & Creator Hub — high-visibility home for every mined Mind:
 * full version history with release notes, rollback / delete of a bad update,
 * stored-data-type cards and the JSON Surgical Editor.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Brain,
  Clock,
  FileJson,
  History,
  Loader2,
  Move3d,
  RotateCcw,
  Smile,
  Trash2,
  AudioLines,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pickCopy, type Lang } from "@/lib/i18n";
import {
  deleteMindVersion,
  listMindVersions,
  rollbackMindVersion,
  saveMindVersion,
  type MindVersion,
} from "@/lib/mind-versions.functions";
import { dataTypeCards, type MindPayload } from "@/lib/mind-json";
import { JsonSurgicalEditor } from "@/components/json-surgical-editor";

const C = {
  title: { en: "Mind Versioning & Creator Hub", mn: "Оюун Хувилбар ба Бүтээгчийн Төв", ko: "마인드 버전 & 크리에이터 허브" },
  subtitle: {
    en: "Every mined Mind, every version, every release note — with one-click rollback.",
    mn: "Олборлосон оюун бүр, хувилбар бүр, тэмдэглэл бүр — нэг товшилтоор буцаана.",
    ko: "모든 마인드, 모든 버전, 모든 릴리스 노트 — 원클릭 롤백.",
  },
  signIn: { en: "Sign in to see your Mind versions.", mn: "Хувилбаруудаа харахын тулд нэвтэрнэ үү.", ko: "버전을 보려면 로그인하세요." },
  empty: { en: "No Minds saved yet — mine a video to create v1.0.", mn: "Одоогоор хадгалсан оюун алга — видео олборлож v1.0 үүсгэнэ үү.", ko: "저장된 마인드가 없습니다 — 영상을 마이닝해 v1.0을 만드세요." },
  current: { en: "Current", mn: "Одоогийн", ko: "현재" },
  rollback: { en: "Rollback", mn: "Буцаах", ko: "롤백" },
  del: { en: "Delete update", mn: "Шинэчлэлт устгах", ko: "업데이트 삭제" },
  edit: { en: "Open JSON editor", mn: "JSON засварлагч нээх", ko: "JSON 편집기 열기" },
  notes: { en: "Release notes", mn: "Хувилбарын тэмдэглэл", ko: "릴리스 노트" },
  noNotes: { en: "No release notes for this version.", mn: "Энэ хувилбарт тэмдэглэл алга.", ko: "이 버전에는 릴리스 노트가 없습니다." },
  knowledgeGraph: { en: "Knowledge Graph", mn: "Мэдлэгийн Граф", ko: "지식 그래프" },
  voiceEmbeddings: { en: "Voice Embeddings", mn: "Дуу Хоолойн Багц", ko: "음성 임베딩" },
  emotionTimeline: { en: "Emotion Timeline", mn: "Сэтгэл Хөдлөлийн Цуваа", ko: "감정 타임라인" },
  vlaTrajectories: { en: "VLA Trajectories", mn: "VLA Хөдөлгөөн", ko: "VLA 궤적" },
  rolled: { en: "Rolled back", mn: "Буцаалаа", ko: "롤백되었습니다" },
  deleted: { en: "Update deleted", mn: "Шинэчлэлт устгагдлаа", ko: "업데이트가 삭제되었습니다" },
} as const;

const ICONS = {
  knowledgeGraph: Brain,
  voiceEmbeddings: AudioLines,
  emotionTimeline: Smile,
  vlaTrajectories: Move3d,
} as const;

export function MindVersioningHub({ lang, signedIn }: { lang: Lang; signedIn: boolean }) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const load = useServerFn(listMindVersions);
  const rollbackFn = useServerFn(rollbackMindVersion);
  const deleteFn = useServerFn(deleteMindVersion);
  const saveFn = useServerFn(saveMindVersion);
  const [editing, setEditing] = useState<MindVersion | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["mind-versions", userId],
    queryFn: () => load(),
    enabled: signedIn && Boolean(userId),
  });

  const groups = useMemo(() => {
    const map = new Map<string, MindVersion[]>();
    for (const v of data ?? []) {
      const list = map.get(v.vaultId) ?? [];
      list.push(v);
      map.set(v.vaultId, list);
    }
    return [...map.values()].map((list) => list.sort((a, b) => b.versionNum - a.versionNum));
  }, [data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["mind-versions"] });
    await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
  };

  const rollback = useMutation({
    mutationFn: (versionId: string) => rollbackFn({ data: { versionId } }),
    onSuccess: async () => { toast.success(t("rolled")); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (versionId: string) => deleteFn({ data: { versionId } }),
    onSuccess: async () => { toast.success(t("deleted")); await refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!signedIn) {
    return <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{t("signIn")}</p>;
  }

  return (
    <section className="min-w-0 space-y-5">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> …
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        groups.map((versions) => {
          const head = versions[0]!;
          const active = versions.find((v) => v.isActive) ?? head;
          const cards = dataTypeCards((active.payload ?? {}) as MindPayload);
          return (
            <article key={head.vaultId} className="min-w-0 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="min-w-0 truncate text-base font-semibold text-foreground">{head.title}</h3>
                <Button size="sm" variant="outline" onClick={() => setEditing(active)}>
                  <FileJson className="mr-1.5 h-3.5 w-3.5" /> {t("edit")}
                </Button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {cards.map((c) => {
                  const Icon = ICONS[c.key as keyof typeof ICONS];
                  return (
                    <div key={c.key} className="rounded-lg border border-border bg-muted/40 p-3">
                      <Icon className="mb-1.5 h-4 w-4 text-primary" />
                      <p className="text-lg font-semibold text-foreground">{c.count}</p>
                      <p className="text-xs text-muted-foreground">{pickCopy(C[c.key as keyof typeof C], lang)}</p>
                    </div>
                  );
                })}
              </div>

              <ul className="mt-4 space-y-2">
                {versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={v.isActive ? "default" : "secondary"}>{v.version}</Badge>
                        {v.isActive ? <span className="text-xs text-primary">{t("current")}</span> : null}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> {new Date(v.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{t("notes")}: </span>
                        {v.releaseNotes || t("noNotes")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!v.isActive ? (
                        <Button size="sm" variant="secondary" disabled={rollback.isPending} onClick={() => rollback.mutate(v.id)}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> {t("rollback")}
                        </Button>
                      ) : null}
                      {versions.length > 1 ? (
                        <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(v.id)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("del")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          );
        })
      )}

      {editing ? (
        <JsonSurgicalEditor
          lang={lang}
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          title={editing.title}
          payload={(editing.payload ?? {}) as MindPayload}
          onSave={async (next, notes) => {
            await saveFn({
              data: {
                vaultId: editing.vaultId,
                title: editing.title,
                payload: next as never,
                releaseNotes: notes,
                mindId: editing.mindId,
              },
            });
            await refresh();
          }}
        />
      ) : null}
    </section>
  );
}
