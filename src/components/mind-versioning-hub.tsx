/**
 * History & fixes — every saved copy of a mined Mind, with plain-language
 * rollback, delete and the fixing editor. Can show every Mind (hub mode) or a
 * single Mind when a vaultId is passed.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Clock, GitBranch, History, Loader2, RotateCcw, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { pickCopy, type Lang } from "@/lib/i18n";
import {
  deleteMindVersion,
  listMindVersions,
  rollbackMindVersion,
  saveMindBranch,
  type MindVersion,
} from "@/lib/mind-versions.functions";
import { dataTypeCards, type MindPayload } from "@/lib/mind-json";
import { JsonSurgicalEditor } from "@/components/json-surgical-editor";

const C = {
  title: { en: "History & fixes", mn: "Түүх ба засвар", ko: "기록과 수정" },
  subtitle: {
    en: "Every saved copy of your mind. Fix it, or go back to an older copy.",
    mn: "Оюуны чинь хадгалсан хувь бүр. Засах эсвэл хуучин хувь руу буцаана.",
    ko: "마인드의 모든 저장본. 고치거나 예전 것으로 되돌리세요.",
  },
  signIn: { en: "Sign in to see this.", mn: "Үзэхийн тулд нэвтэрнэ үү.", ko: "보려면 로그인하세요." },
  empty: { en: "Nothing saved yet — mine a video first.", mn: "Одоохондоо юу ч алга — эхлээд видео олборлоно уу.", ko: "아직 없습니다 — 먼저 영상을 마이닝하세요." },
  current: { en: "Now in use", mn: "Одоо ашиглаж байна", ko: "현재 사용 중" },
  rollback: { en: "Go back to this version", mn: "Энэ хувилбар руу буцах", ko: "이 버전으로 되돌리기" },
  del: { en: "Delete this copy", mn: "Энэ хувийг устгах", ko: "이 사본 삭제" },
  edit: { en: "Fix this mind", mn: "Энэ оюуныг засах", ko: "이 마인드 고치기" },
  notes: { en: "What changed", mn: "Юу өөрчлөгдсөн", ko: "변경 내용" },
  noNotes: { en: "No note.", mn: "Тэмдэглэл алга.", ko: "메모 없음." },
  learned: { en: "things learned", mn: "сурсан зүйл", ko: "학습 항목" },
  voice: { en: "voice samples", mn: "дуу хоолойн дээж", ko: "음성 샘플" },
  feelings: { en: "feeling moments", mn: "сэтгэлийн мөч", ko: "감정 구간" },
  moves: { en: "movements", mn: "хөдөлгөөн", ko: "동작" },
  saved: { en: "saved", mn: "хадгалсан", ko: "저장" },
  earlier: { en: "Earlier versions", mn: "Өмнөх хувилбарууд", ko: "이전 버전" },
  rolled: { en: "Went back", mn: "Буцлаа", ko: "되돌렸습니다" },
  deleted: { en: "Copy deleted", mn: "Хувь устгагдлаа", ko: "사본이 삭제되었습니다" },
  branches: { en: "Branches", mn: "Салаанууд", ko: "가지" },
  branchSaved: {
    en: "Saved as a new branch. Your mind in use did not change — press \u201cUse this one\u201d when you want to switch.",
    mn: "Шинэ салаа болгон хадгаллаа. Ашиглаж буй оюун чинь өөрчлөгдөөгүй — солихдоо \u201cҮүнийг ашиглах\u201d дарна уу.",
    ko: "새 가지로 저장했습니다. 사용 중인 마인드는 그대로입니다 — 바꾸려면 \u201c이것을 사용\u201d을 누르세요.",
  },
  fixedBranch: { en: "My fix", mn: "Миний засвар", ko: "내 수정" },
  by: { en: "by", mn: "хийсэн:", ko: "작성:" },
} as const;

const LABEL = {
  knowledgeGraph: "learned",
  voiceEmbeddings: "voice",
  emotionTimeline: "feelings",
  vlaTrajectories: "moves",
} as const;

export function MindVersioningHub({
  lang,
  signedIn,
  vaultId,
}: {
  lang: Lang;
  signedIn: boolean;
  /** When set, only this one Mind is shown. */
  vaultId?: string;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const load = useServerFn(listMindVersions);
  const rollbackFn = useServerFn(rollbackMindVersion);
  const deleteFn = useServerFn(deleteMindVersion);
  const saveBranchFn = useServerFn(saveMindBranch);
  const [editing, setEditing] = useState<MindVersion | null>(null);
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["mind-versions", userId],
    queryFn: () => load(),
    enabled: signedIn && Boolean(userId),
  });

  const groups = useMemo(() => {
    const map = new Map<string, MindVersion[]>();
    for (const v of data ?? []) {
      if (vaultId && v.vaultId !== vaultId) continue;
      const list = map.get(v.vaultId) ?? [];
      list.push(v);
      map.set(v.vaultId, list);
    }
    return [...map.values()].map((list) => list.sort((a, b) => b.versionNum - a.versionNum));
  }, [data, vaultId]);

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
          // Only counts above zero are worth a word; empty stats mean nothing.
          const summary = dataTypeCards((active.payload ?? {}) as MindPayload)
            .filter((c) => c.count > 0)
            .map((c) => `${c.count} ${t(LABEL[c.key as keyof typeof LABEL])}`);
          summary.push(`${t("saved")} ${new Date(active.createdAt).toLocaleDateString()}`);
          const older = versions.filter((v) => v.id !== active.id);
          const shown = openHistory[head.vaultId] ? older : [];
          return (
            <article key={head.vaultId} className="min-w-0 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="min-w-0 truncate text-base font-semibold text-foreground">{head.title}</h3>
                <Button size="sm" onClick={() => setEditing(active)}>
                  <Wrench className="mr-1.5 h-3.5 w-3.5" /> {t("edit")}
                </Button>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">{summary.join(" · ")}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                <Badge>{active.version}</Badge>
                <Badge variant="outline" className="gap-1">
                  <GitBranch className="h-3 w-3" /> {active.branchName}
                </Badge>
                {active.createdByEngine ? (
                  <span className="text-xs text-muted-foreground">{t("by")} {active.createdByEngine}</span>
                ) : null}
                <span className="text-xs text-primary">{t("current")}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" /> {new Date(active.createdAt).toLocaleString()}
                </span>
                <p className="w-full text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{t("notes")}: </span>
                  {active.releaseNotes || t("noNotes")}
                </p>
              </div>

              {older.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setOpenHistory((p) => ({ ...p, [head.vaultId]: !p[head.vaultId] }))}
                  className="mt-3 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {t("earlier")} · {t("branches")} ({older.length})
                </button>
              ) : null}

              {shown.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {shown.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{v.version}</Badge>
                          <Badge variant="outline" className="gap-1">
                            <GitBranch className="h-3 w-3" /> {v.branchName}
                          </Badge>
                          {v.createdByEngine ? (
                            <span className="text-xs text-muted-foreground">{t("by")} {v.createdByEngine}</span>
                          ) : null}
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
                        <Button size="sm" variant="secondary" disabled={rollback.isPending} onClick={() => rollback.mutate(v.id)}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> {t("rollback")}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(v.id)}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("del")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
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
            // A fix never overwrites the mind in use: it grows beside it as its
            // own branch, and the creator decides when to switch over.
            await saveBranchFn({
              data: {
                vaultId: editing.vaultId,
                title: editing.title,
                payload: next as never,
                parentVersionId: editing.id,
                branchName: t("fixedBranch"),
                engine: "manual",
                releaseNotes: notes,
                mindId: editing.mindId,
              },
            });
            toast.success(t("branchSaved"));
            await refresh();
          }}
        />
      ) : null}
    </section>
  );
}
