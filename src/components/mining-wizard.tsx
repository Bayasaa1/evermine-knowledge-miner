/**
 * Pre-mining assessment. Three quick answers that are injected straight into
 * the Gemini system prompt so extraction is tailored to the video.
 */
import { useState } from "react";
import { ClipboardList, Sparkles } from "lucide-react";
import { pickCopy, type Lang } from "@/lib/i18n";
import {
  DEFAULT_ASSESSMENT,
  PRIMARY_FOCUSES,
  VIDEO_CONTEXTS,
  type Assessment,
  type VideoMetadata,
} from "@/lib/mining-jobs";

const copy = {
  en: {
    title: "Before we mine — 3 quick questions",
    sub: "Your answers steer the AI so it extracts what actually matters to you.",
    context: "1. Video context",
    focus: "2. Primary focus",
    custom: "3. Custom analysis instructions",
    customPlaceholder: "e.g. Focus on the defensive shape and the coach's tactical calls.",
    speaker: "Speaker identity — who is the Mind Owner / Host?",
    speakerPlaceholder: "Host: Batbold, Guest: Elon Musk",
    speakerHint: "Guest answers stay contextual knowledge; only the host shapes the Mind Vault identity.",
    start: "Start mining",
    autoTitle: "Auto-filled from YouTube",
    autoSub: "We pulled this straight from the link — edit only if something is off.",
    fetching: "Reading video details…",
    fTitle: "Video title",
    fDesc: "Description (fed to the AI as context)",
    fDate: "Published",
    fDur: "Duration",
  },
  mn: {
    title: "Шинжилгээний өмнө — 3 богино асуулт",
    sub: "Таны хариулт AI-д яг хэрэгтэй мэдээллийг задлан авахад чиглүүлнэ.",
    context: "1. Видеоны төрөл",
    focus: "2. Гол анхаарах зүйл",
    custom: "3. Нэмэлт зааварчилгаа",
    customPlaceholder: "жишээ нь: Хамгаалалтын бүтэц, дасгалжуулагчийн шийдвэрт анхаараарай.",
    speaker: "Ярианы эзэн — Mind эзэмшигч / хөтлөгч хэн бэ?",
    speakerPlaceholder: "Хөтлөгч: Батболд, Зочин: Elon Musk",
    speakerHint: "Зочны яриа зөвхөн нөхцөл байдлын мэдлэг болно; зөвхөн хөтлөгч Mind-ийн зан чанарыг бүрдүүлнэ.",
    start: "Шинжилгээ эхлүүлэх",
    autoTitle: "YouTube-оос автоматаар бөглөгдсөн",
    autoSub: "Холбоосоос шууд татсан — буруу зүйл байвал л засна уу.",
    fetching: "Видеоны мэдээллийг уншиж байна…",
    fTitle: "Видеоны нэр",
    fDesc: "Тайлбар (AI-д нөхцөл болгон өгнө)",
    fDate: "Нийтэлсэн огноо",
    fDur: "Үргэлжлэх хугацаа",
  },
  ko: {
    title: "분석 전 — 3가지 빠른 질문",
    sub: "답변에 맞춰 AI가 정말 중요한 내용만 골라 추출합니다.",
    context: "1. 영상 맥락",
    focus: "2. 주요 초점",
    custom: "3. 추가 분석 지침",
    customPlaceholder: "예: 수비 대형과 코치의 전술 지시에 집중해 주세요.",
    speaker: "화자 식별 — 마인드 소유자 / 호스트는 누구인가요?",
    speakerPlaceholder: "호스트: 바트볼드, 게스트: Elon Musk",
    speakerHint: "게스트 발언은 맥락 지식으로만 저장되고, 호스트만 마인드 정체성을 형성합니다.",
    start: "분석 시작",
    autoTitle: "YouTube에서 자동 입력됨",
    autoSub: "링크에서 바로 가져왔습니다 — 잘못된 부분만 수정하세요.",
    fetching: "영상 정보를 불러오는 중…",
    fTitle: "영상 제목",
    fDesc: "설명 (AI 컨텍스트로 전달)",
    fDate: "게시일",
    fDur: "재생 시간",
  },
};

export function MiningWizard({
  lang,
  value,
  onChange,
  onStart,
  busy,
  meta,
  metaLoading,
}: {
  lang: Lang;
  value?: Assessment;
  onChange?: (a: Assessment) => void;
  onStart: (a: Assessment) => void;
  busy?: boolean;
  meta?: VideoMetadata | null;
  metaLoading?: boolean;
}) {
  const t = pickCopy(copy, lang);
  const [local, setLocal] = useState<Assessment>(value ?? DEFAULT_ASSESSMENT);
  const state = value ?? local;

  const update = (patch: Partial<Assessment>) => {
    const next = { ...state, ...patch };
    setLocal(next);
    onChange?.(next);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ClipboardList className="h-4 w-4 text-primary" /> {t.title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>

      {(metaLoading || meta) && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {metaLoading ? t.fetching : t.autoTitle}
          </p>
          {meta && (
            <>
              <p className="mt-1 text-xs text-muted-foreground">{t.autoSub}</p>
              <div className="mt-3 flex gap-3">
                {meta.thumbnail && (
                  <img
                    src={meta.thumbnail}
                    alt={meta.title}
                    loading="lazy"
                    className="h-16 w-28 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{t.fTitle}</span>
                    <input
                      value={state.sourceTitle}
                      onChange={(e) => update({ sourceTitle: e.target.value.slice(0, 300) })}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{t.fDate}</span>
                      <input
                        value={state.sourcePublishedAt}
                        onChange={(e) => update({ sourcePublishedAt: e.target.value.slice(0, 64) })}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{t.fDur}</span>
                      <input
                        value={state.sourceDurationLabel}
                        onChange={(e) => update({ sourceDurationLabel: e.target.value.slice(0, 32) })}
                        className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/60"
                      />
                    </label>
                  </div>
                </div>
              </div>
              <label className="mt-2 block">
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{t.fDesc}</span>
                <textarea
                  value={state.sourceDescription}
                  onChange={(e) => update({ sourceDescription: e.target.value.slice(0, 4000) })}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/60"
                />
              </label>
            </>
          )}
        </div>
      )}

      <fieldset className="mt-4">
        <legend className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.context}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {VIDEO_CONTEXTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => update({ videoContext: c })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                state.videoContext === c
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.focus}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRIMARY_FOCUSES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => update({ primaryFocus: f })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                state.primaryFocus === f
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </fieldset>

      {state.videoContext === "Podcast" && (
        <label className="mt-4 block">
          <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.speaker}</span>
          <input
            value={state.speakerIdentity}
            onChange={(e) => update({ speakerIdentity: e.target.value.slice(0, 300) })}
            placeholder={t.speakerPlaceholder}
            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <span className="mt-1 block text-xs text-muted-foreground">{t.speakerHint}</span>
        </label>
      )}

      <label className="mt-4 block">
        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.custom}</span>
        <textarea
          value={state.customInstructions}
          onChange={(e) => update({ customInstructions: e.target.value.slice(0, 2000) })}
          rows={3}
          placeholder={t.customPlaceholder}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
        />
      </label>

      <button
        type="button"
        onClick={() => onStart(state)}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <Sparkles className="h-4 w-4" /> {t.start}
      </button>
    </div>
  );
}
