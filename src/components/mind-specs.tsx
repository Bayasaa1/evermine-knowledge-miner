import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Clock,
  Cpu,
  Loader2,
  Save,
  Tag,
  Target,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { pickCopy, type Lang } from "@/lib/i18n";

export type MindSpec = {
  id: string;
  user_id: string;
  mind_id: string;
  training_hours: number;
  version: string;
  accuracy_score: number;
  compatibility: string[];
  changelog_notes: string;
  resolved_review_ids: string[];
  last_updated_at: string;
};

type ReviewLite = { id: string; body: string; rating: number; author_name: string };

const copy = {
  en: {
    title: "Mind Specifications & Transparency",
    hours: "Training / development hours",
    updated: "Last updated",
    version: "Current version",
    accuracy: "Accuracy / confidence",
    compat: "Compatibility",
    verified: "Verified",
    hoursValue: (h: number) => `${h.toFixed(1)} hours of video training`,
    changelog: "Changelog & Review Fixes",
    noChangelog: "No release notes published yet for this version.",
    fixes: "Resolved from Verified Reviews",
    noSpec: "No specifications published yet — the creator has not shipped a versioned release.",
    edit: "Publish new version",
    cancel: "Cancel",
    save: "Save release",
    notes: "Release notes",
    notesPlaceholder: "What changed in this version?",
    pickFixes: "Mark reviews resolved by this release",
    noReviews: "No verified reviews to resolve yet.",
    saved: "Specifications published.",
    failed: "Could not save specifications",
  },
  mn: {
    title: "Оюуны үзүүлэлт ба ил тод байдал",
    hours: "Сургалт / хөгжүүлэлтийн цаг",
    updated: "Сүүлд шинэчилсэн",
    version: "Одоогийн хувилбар",
    accuracy: "Нарийвчлал / итгэл",
    compat: "Нийцтэй байдал",
    verified: "Баталгаажсан",
    hoursValue: (h: number) => `${h.toFixed(1)} цагийн видео сургалт`,
    changelog: "Шинэчлэлт ба засварын бүртгэл",
    noChangelog: "Энэ хувилбарт тэмдэглэл нийтлээгүй байна.",
    fixes: "Баталгаажсан үнэлгээнээс шийдэгдсэн",
    noSpec: "Үзүүлэлт хараахан нийтлэгдээгүй байна.",
    edit: "Шинэ хувилбар нийтлэх",
    cancel: "Болих",
    save: "Хадгалах",
    notes: "Хувилбарын тэмдэглэл",
    notesPlaceholder: "Энэ хувилбарт юу өөрчлөгдсөн бэ?",
    pickFixes: "Энэ хувилбараар шийдэгдсэн үнэлгээг тэмдэглэ",
    noReviews: "Шийдвэрлэх үнэлгээ алга.",
    saved: "Үзүүлэлт нийтлэгдлээ.",
    failed: "Үзүүлэлтийг хадгалж чадсангүй",
  },
  ko: {
    title: "마인드 사양 및 투명성",
    hours: "학습 / 개발 시간",
    updated: "마지막 업데이트",
    version: "현재 버전",
    accuracy: "정확도 / 신뢰도",
    compat: "호환성",
    verified: "검증됨",
    hoursValue: (h: number) => `${h.toFixed(1)}시간 분량의 영상 학습`,
    changelog: "변경 이력 및 리뷰 반영",
    noChangelog: "이 버전에는 아직 릴리스 노트가 없습니다.",
    fixes: "검증된 리뷰에서 반영된 사항",
    noSpec: "아직 발행된 사양이 없습니다 — 크리에이터가 버전 릴리스를 게시하지 않았습니다.",
    edit: "새 버전 발행",
    cancel: "취소",
    save: "릴리스 저장",
    notes: "릴리스 노트",
    notesPlaceholder: "이 버전에서 무엇이 바뀌었나요?",
    pickFixes: "이 릴리스로 해결된 리뷰 선택",
    noReviews: "아직 해결할 검증된 리뷰가 없습니다.",
    saved: "사양이 발행되었습니다.",
    failed: "사양을 저장하지 못했습니다",
  },
} as const;

const DEFAULT_COMPAT = ["ROS 2", "Web Voice", "Video Call"];

function bumpVersion(version: string): string {
  const m = /v?(\d+)\.(\d+)/.exec(version || "");
  if (!m) return "v1.1";
  return `v${m[1]}.${Number(m[2]) + 1}`;
}

/** Transparency specs, version history and review-fix tracker for a mind. */
export function MindSpecs({
  mindId,
  lang = "en",
  canEdit = false,
}: {
  mindId: string;
  lang?: Lang;
  canEdit?: boolean;
}) {
  const t = pickCopy(copy, lang);
  const { user } = useAuth();
  const [spec, setSpec] = useState<MindSpec | null>(null);
  const [reviews, setReviews] = useState<ReviewLite[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [hours, setHours] = useState("0");
  const [version, setVersion] = useState("v1.0");
  const [accuracy, setAccuracy] = useState("0");
  const [compat, setCompat] = useState(DEFAULT_COMPAT.join(", "));
  const [notes, setNotes] = useState("");
  const [resolved, setResolved] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [{ data: specRow }, { data: reviewRows }] = await Promise.all([
      supabase.from("mind_specs").select("*").eq("mind_id", mindId).maybeSingle(),
      supabase
        .from("mind_reviews")
        .select("id,body,rating,author_name")
        .eq("mind_id", mindId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const s = (specRow as MindSpec | null) ?? null;
    setSpec(s);
    setReviews((reviewRows as ReviewLite[] | null) ?? []);
    if (s) {
      setHours(String(s.training_hours));
      setVersion(s.version);
      setAccuracy(String(s.accuracy_score));
      setCompat((s.compatibility ?? DEFAULT_COMPAT).join(", "));
      setResolved(s.resolved_review_ids ?? []);
    }
  }, [mindId]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [load, user]);

  const resolvedReviews = useMemo(
    () => reviews.filter((r) => (spec?.resolved_review_ids ?? []).includes(r.id)),
    [reviews, spec],
  );

  const startEdit = () => {
    setVersion(spec ? bumpVersion(spec.version) : "v1.0");
    setNotes("");
    setEditing(true);
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    setBusy(true);
    const row = {
      user_id: user.id,
      mind_id: mindId,
      training_hours: Number(hours) || 0,
      version: version.trim() || "v1.0",
      accuracy_score: Math.max(0, Math.min(100, Number(accuracy) || 0)),
      compatibility: compat
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      changelog_notes: notes.trim(),
      resolved_review_ids: resolved,
      last_updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("mind_specs").upsert(row, { onConflict: "mind_id" });
    setBusy(false);
    if (error) {
      toast.error(`${t.failed}: ${error.message}`);
      return;
    }
    toast.success(t.saved);
    setEditing(false);
    await load();
  };

  const stats = [
    {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: t.hours,
      value: spec ? t.hoursValue(Number(spec.training_hours)) : "—",
    },
    {
      icon: <CalendarDays className="h-3.5 w-3.5" />,
      label: t.updated,
      value: spec
        ? new Date(spec.last_updated_at).toLocaleDateString(lang === "mn" ? "mn-MN" : lang === "ko" ? "ko-KR" : "en-US", {
            month: "short",
            year: "numeric",
          })
        : "—",
    },
    { icon: <Tag className="h-3.5 w-3.5" />, label: t.version, value: spec?.version ?? "—" },
    {
      icon: <Target className="h-3.5 w-3.5" />,
      label: t.accuracy,
      value: spec ? `${Number(spec.accuracy_score).toFixed(1)}% ${t.verified}` : "—",
    },
  ];

  return (
    <section className="rounded-[12px] border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BadgeCheck className="h-4 w-4 text-primary" />
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-foreground">{t.title}</h3>
        {canEdit && user && (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            {t.edit}
          </button>
        )}
      </div>

      {!spec && !editing ? (
        <p className="text-xs text-muted-foreground">{t.noSpec}</p>
      ) : (
        <dl className="grid gap-2 sm:grid-cols-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                {s.icon} {s.label}
              </dt>
              <dd className="mt-0.5 text-sm font-semibold text-foreground">{s.value}</dd>
            </div>
          ))}
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 sm:col-span-2">
            <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              <Cpu className="h-3.5 w-3.5" /> {t.compat}
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {(spec?.compatibility ?? DEFAULT_COMPAT).map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground"
                >
                  {c}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {t.changelog}
        {resolvedReviews.length > 0 && (
          <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
            {resolvedReviews.length} fixed
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
            {spec?.changelog_notes || t.noChangelog}
          </p>

          {resolvedReviews.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t.fixes}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {resolvedReviews.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-foreground"
                  >
                    ✅ Fixed: {r.body || `${r.rating}★ feedback from ${r.author_name}`}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {editing && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-[11px] text-muted-foreground">
                  {t.version}
                  <input
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                  />
                </label>
                <label className="text-[11px] text-muted-foreground">
                  {t.hours}
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                  />
                </label>
                <label className="text-[11px] text-muted-foreground">
                  {t.accuracy}
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={accuracy}
                    onChange={(e) => setAccuracy(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                  />
                </label>
              </div>
              <label className="block text-[11px] text-muted-foreground">
                {t.compat}
                <input
                  value={compat}
                  onChange={(e) => setCompat(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </label>
              <label className="block text-[11px] text-muted-foreground">
                {t.notes}
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t.notesPlaceholder}
                  className="mt-1 w-full resize-y rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </label>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t.pickFixes}
                </p>
                {reviews.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{t.noReviews}</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {reviews.map((r) => (
                      <li key={r.id}>
                        <label className="flex items-start gap-2 text-xs text-foreground">
                          <input
                            type="checkbox"
                            checked={resolved.includes(r.id)}
                            onChange={(e) =>
                              setResolved((prev) =>
                                e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id),
                              )
                            }
                            className="mt-0.5"
                          />
                          <span className="min-w-0 flex-1">
                            {r.rating}★ · {r.body || r.author_name}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {t.save}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
