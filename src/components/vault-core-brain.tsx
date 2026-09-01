/**
 * Core Brain — the AI knowledge visualizer for one Project.
 *
 * Shows how every mined video incrementally expands the underlying `.json.md`
 * core brain (knowledge graph, voice embeddings, emotion trajectory, VLA), lets
 * the creator inspect the raw JSON, erase bad chunks and attach FAQ patches.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AudioLines, Brain, Code2, FileJson, Loader2, Move3d, Smile } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JsonSurgicalEditor } from "@/components/json-surgical-editor";
import { chunkBuckets, dataTypeCards, type MindPayload } from "@/lib/mind-json";
import { listMindVersions, saveMindVersion, type MindVersion } from "@/lib/mind-versions.functions";
import { pickCopy, type Lang } from "@/lib/i18n";

const C = {
  title: { en: "Core Brain", mn: "Гол Тархи", ko: "코어 브레인" },
  desc: {
    en: "Every mined video expands this brain. Inspect the raw JSON, erase bad chunks, attach FAQ patches.",
    mn: "Олборлосон видео бүр энэ тархийг тэлнэ. Түүхий JSON-г шалгаж, муу хэсгийг устгаж, FAQ нөхөөс залгана.",
    ko: "마이닝된 모든 영상이 이 브레인을 확장합니다. 원본 JSON 검사, 청크 삭제, FAQ 패치를 지원합니다.",
  },
  empty: {
    en: "No brain data yet — mine a video in Creator Studio to grow this Core Brain.",
    mn: "Тархины өгөгдөл алга — Creator Studio дээр видео олборлож эхлүүлээрэй.",
    ko: "아직 브레인 데이터가 없습니다 — Creator Studio에서 영상을 마이닝하세요.",
  },
  knowledgeGraph: { en: "Knowledge Graph", mn: "Мэдлэгийн Граф", ko: "지식 그래프" },
  voiceEmbeddings: { en: "Voice Embeddings", mn: "Дуу Хоолойн Багц", ko: "음성 임베딩" },
  emotionTimeline: { en: "Emotion Trajectory", mn: "Сэтгэл Хөдлөлийн Зам", ko: "감정 궤적" },
  vlaTrajectories: { en: "VLA Trajectories", mn: "VLA Хөдөлгөөн", ko: "VLA 궤적" },
  growth: { en: "Incremental growth", mn: "Алхам алхмаар тэлэлт", ko: "점진적 성장" },
  chunks: { en: "5-minute chunks", mn: "5 минутын хэсгүүд", ko: "5분 청크" },
  raw: { en: "Raw .json.md", mn: "Түүхий .json.md", ko: "원본 .json.md" },
  hideRaw: { en: "Hide raw", mn: "Нуух", ko: "숨기기" },
  edit: { en: "Chunk Eraser & FAQ patches", mn: "Хэсэг устгах ба FAQ нөхөөс", ko: "청크 삭제 및 FAQ 패치" },
  saved: { en: "Core Brain patched", mn: "Гол тархи засагдлаа", ko: "코어 브레인이 패치되었습니다" },
} as const;

const ICONS = {
  knowledgeGraph: Brain,
  voiceEmbeddings: AudioLines,
  emotionTimeline: Smile,
  vlaTrajectories: Move3d,
} as const;

export function VaultCoreBrain({ lang, mindIds }: { lang: Lang; mindIds: string[] }) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const queryClient = useQueryClient();
  const load = useServerFn(listMindVersions);
  const saveFn = useServerFn(saveMindVersion);
  const [editing, setEditing] = useState<MindVersion | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["mind-versions"], queryFn: () => load() });

  const versions = useMemo(() => {
    const rows = data ?? [];
    const scoped = mindIds.length > 0 ? rows.filter((v) => mindIds.includes(v.mindId)) : rows;
    const list = scoped.length > 0 ? scoped : rows;
    // one active version per vault, newest first
    const byVault = new Map<string, MindVersion>();
    for (const v of list) {
      const current = byVault.get(v.vaultId);
      if (!current || v.versionNum > current.versionNum) byVault.set(v.vaultId, v);
    }
    return [...byVault.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [data, mindIds]);

  const totals = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const v of versions) {
      for (const card of dataTypeCards((v.payload ?? {}) as MindPayload)) {
        sum[card.key] = (sum[card.key] ?? 0) + card.count;
      }
    }
    return sum;
  }, [versions]);

  const patch = useMutation({
    mutationFn: async (input: { version: MindVersion; payload: MindPayload; notes: string }) => {
      await saveFn({
        data: {
          vaultId: input.version.vaultId,
          title: input.version.title,
          payload: input.payload as never,
          releaseNotes: input.notes,
          mindId: input.version.mindId,
        },
      });
    },
    onSuccess: async () => {
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["mind-versions"] });
      await queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> …
      </div>
    );
  }

  if (versions.length === 0) {
    return <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <section className="min-w-0 space-y-4">
      <header>
        <h3 className="text-base font-semibold text-foreground">{t("title")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("desc")}</p>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(Object.keys(ICONS) as (keyof typeof ICONS)[]).map((key) => {
          const Icon = ICONS[key];
          return (
            <div key={key} className="rounded-xl border border-border bg-card p-3">
              <Icon className="mb-1.5 h-4 w-4 text-primary" />
              <p className="text-lg font-semibold text-foreground">{totals[key] ?? 0}</p>
              <p className="text-xs text-muted-foreground">{pickCopy(C[key], lang)}</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("growth")}</p>
        {versions.map((v, i) => {
          const payload = (v.payload ?? {}) as MindPayload;
          const cards = dataTypeCards(payload);
          const buckets = chunkBuckets(payload);
          const contribution = cards.reduce((n, c) => n + c.count, 0);
          return (
            <article key={v.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                  {versions.length - i}
                </span>
                <h4 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{v.title}</h4>
                <Badge variant="secondary">{v.version}</Badge>
                <Badge variant="outline">+{contribution}</Badge>
              </div>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, Math.round((contribution / Math.max(1, Object.values(totals).reduce((a, b) => a + b, 0))) * 100))}%` }}
                />
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {t("chunks")}: {buckets.length}
                {buckets.length > 0 ? ` · ${buckets[0]!.label} → ${buckets[buckets.length - 1]!.label}` : ""}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(v)}>
                  <FileJson className="mr-1.5 h-3.5 w-3.5" /> {t("edit")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowRaw((s) => !s)}>
                  <Code2 className="mr-1.5 h-3.5 w-3.5" /> {showRaw ? t("hideRaw") : t("raw")}
                </Button>
              </div>

              {showRaw ? (
                <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(v.payload, null, 2)}
                </pre>
              ) : null}
            </article>
          );
        })}
      </div>

      {editing ? (
        <JsonSurgicalEditor
          lang={lang}
          open={!!editing}
          onOpenChange={(o) => { if (!o) setEditing(null); }}
          title={editing.title}
          payload={(editing.payload ?? {}) as MindPayload}
          onSave={async (next, notes) => {
            await patch.mutateAsync({ version: editing, payload: next as MindPayload, notes });
          }}
        />
      ) : null}
    </section>
  );
}
