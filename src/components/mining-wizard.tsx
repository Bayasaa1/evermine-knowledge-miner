/**
 * Pre-mining assessment. A few quick answers injected straight into the Gemini
 * system prompt so extraction is tailored to the video. The choices shown
 * depend on what the creator is building (robot, gaming, voice, sales,
 * knowledge) and stay collapsed because the defaults are already sensible.
 */
import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { pickCopy, type Lang } from "@/lib/i18n";
import { Localized } from "@/components/localized";
import type { CreationCategory } from "@/lib/creation-category";
import {
  contextsFor,
  defaultAssessmentFor,
  focusesFor,
  wantsSpeakerNames,
  type Assessment,
  type VideoMetadata,
} from "@/lib/mining-jobs";

const copy = {
  en: {
    title: "Tell the AI what to look for",
    sub: "Optional — we already picked answers that fit what you are building.",
    context: "Video type",
    focus: "What matters most",
    custom: "Anything else the AI should know",
    customPlaceholder: "e.g. Focus on how the arm picks up the cup.",
    speaker: "Whose voice is the Mind?",
    speakerPlaceholder: "Host: Batbold, Guest: Elon Musk",
    speakerHint: "Only the host shapes how your Mind talks. Guests stay as knowledge.",
    start: "Start mining",
    autoTitle: "Filled in from the link",
    autoSub: "Edit only if something looks wrong.",
    fetching: "Reading video details…",
    fTitle: "Title",
    fDesc: "Description (given to the AI)",
    fDate: "Published",
    fDur: "Length",
    mode: "How should the AI read this video?",
    modeAuto: "Decide for me",
    modeAutoHint: "Talking videos use the subtitles, anything visual gets watched.",
    modeFast: "Read the subtitles",
    modeFastHint: "Seconds instead of minutes, and it works with any of your AI keys. Best for podcasts, interviews and talks. If the video has no subtitles it is watched instead.",
    modeWatch: "Watch the video",
    modeWatchHint: "Needed when what you see matters — hands, robots, gameplay, cooking. Uses your Gemini key and takes longer.",
  },
  mn: {
    title: "AI юуг хайхыг хэлж өг",
    sub: "Заавал биш — таны сонголтод тохирсон хариултыг аль хэдийн сонгосон.",
    context: "Видеоны төрөл",
    focus: "Хамгийн чухал нь",
    custom: "AI-д мэдэх ёстой өөр зүйл",
    customPlaceholder: "жишээ нь: Гар аягыг хэрхэн авч байгааг анхаараарай.",
    speaker: "Оюуны дуу хоолой хэн бэ?",
    speakerPlaceholder: "Хөтлөгч: Батболд, Зочин: Elon Musk",
    speakerHint: "Зөвхөн хөтлөгч Оюуны ярианы хэв маягийг бүрдүүлнэ. Зочид зөвхөн мэдлэг болно.",
    start: "Шинжилгээ эхлүүлэх",
    autoTitle: "Холбоосоос бөглөгдсөн",
    autoSub: "Буруу зүйл байвал л засна уу.",
    fetching: "Видеоны мэдээллийг уншиж байна…",
    fTitle: "Нэр",
    fDesc: "Тайлбар (AI-д өгнө)",
    fDate: "Нийтэлсэн",
    fDur: "Урт",
    mode: "AI энэ видеог яаж унших вэ?",
    modeAuto: "Надад тохируулж өг",
    modeAutoHint: "Ярианы видео хадмалыг ашиглана, харагдах зүйл чухал бол үзнэ.",
    modeFast: "Хадмалыг унших",
    modeFastHint: "Минут биш секунд, таны ямар ч түлхүүртэй ажиллана. Подкаст, ярилцлага, лекцэд тохиромжтой. Хадмал байхгүй бол видеог үзнэ.",
    modeWatch: "Видеог үзэх",
    modeWatchHint: "Харагдах зүйл чухал үед — гар, робот, тоглоом, хоол. Gemini түлхүүр ашиглах ба удаан.",
  },
  ko: {
    title: "AI가 무엇을 찾을지 알려주세요",
    sub: "선택 사항 — 만들려는 것에 맞는 답을 이미 골라 두었습니다.",
    context: "영상 종류",
    focus: "가장 중요한 것",
    custom: "AI가 알아야 할 다른 내용",
    customPlaceholder: "예: 팔이 컵을 잡는 방식에 집중해 주세요.",
    speaker: "마인드의 목소리는 누구인가요?",
    speakerPlaceholder: "호스트: 바트볼드, 게스트: Elon Musk",
    speakerHint: "호스트만 마인드의 말투를 만듭니다. 게스트는 지식으로만 남습니다.",
    start: "분석 시작",
    autoTitle: "링크에서 자동 입력됨",
    autoSub: "잘못된 부분만 수정하세요.",
    fetching: "영상 정보를 불러오는 중…",
    fTitle: "제목",
    fDesc: "설명 (AI에 전달)",
    fDate: "게시일",
    fDur: "길이",
    mode: "AI가 이 영상을 어떻게 읽을까요?",
    modeAuto: "알아서 정해주세요",
    modeAutoHint: "말하는 영상은 자막을 쓰고, 화면이 중요하면 영상을 봅니다.",
    modeFast: "자막 읽기",
    modeFastHint: "몇 분이 아니라 몇 초, 어떤 키로도 됩니다. 팟캐스트·인터뷰·강연에 적합합니다. 자막이 없으면 영상을 봅니다.",
    modeWatch: "영상 보기",
    modeWatchHint: "손, 로봇, 게임, 요리처럼 화면이 중요할 때 필요합니다. Gemini 키를 쓰고 더 오래 걸립니다.",
  },
};

export function MiningWizard({
  lang,
  category = "knowledge",
  value,
  onChange,
  onStart,
  startLabel,
  busy,
  meta,
  metaLoading,
  hideStart,
}: {
  /** Step 1 only collects rules; no button. */
  hideStart?: boolean;
  lang: Lang;
  /** What the creator is building — drives which choices are offered. */
  category?: CreationCategory;
  value?: Assessment;
  onChange?: (a: Assessment) => void;
  onStart: (a: Assessment) => void;
  /** Overrides the primary button label (step 2 saves instead of mining). */
  startLabel?: string;
  busy?: boolean;
  meta?: VideoMetadata | null;
  metaLoading?: boolean;
}) {
  const t = pickCopy(copy, lang);
  const [local, setLocal] = useState<Assessment>(value ?? defaultAssessmentFor(category));
  const state = value ?? local;
  const contexts = contextsFor(category);
  const focuses = focusesFor(category);

  const update = (patch: Partial<Assessment>) => {
    const next = { ...state, ...patch };
    setLocal(next);
    onChange?.(next);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      {(metaLoading || meta) && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
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
            </>
          )}
        </div>
      )}

      {/* Reading the subtitles instead of watching is the single biggest
          difference in speed and cost, so it is asked up front. */}
      <fieldset className="mt-4">
        <legend className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.mode}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["auto", t.modeAuto],
              ["fast", t.modeFast],
              ["watch", t.modeWatch],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => update({ miningMode: value })}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                (state.miningMode ?? "auto") === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {(state.miningMode ?? "auto") === "fast"
            ? t.modeFastHint
            : (state.miningMode ?? "auto") === "watch"
              ? t.modeWatchHint
              : t.modeAutoHint}
        </p>
      </fieldset>

      {/* Everything below is optional fine-tuning, so it starts closed. */}
      <details className="group mt-4 rounded-xl border border-border bg-background/40 p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground">
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          {t.title}
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            <Localized text={state.videoContext} /> · <Localized text={state.primaryFocus} />
          </span>
        </summary>

        <p className="mt-2 text-xs text-muted-foreground">{t.sub}</p>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.context}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {contexts.map((c) => (
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
                <Localized text={c} />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{t.focus}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {focuses.map((f) => (
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
                <Localized text={f} />
              </button>
            ))}
          </div>
        </fieldset>

        {(true || wantsSpeakerNames(state.videoContext)) && (
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
      </details>

      {!hideStart && <button
        type="button"
        onClick={() => onStart(state)}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <Sparkles className="h-4 w-4" /> {startLabel ?? t.start}
      </button>}
    </div>
  );
}

/* ---------------- Native video progress pills ---------------- */
export type NativeStage = "idle" | "upload" | "extract" | "mine" | "done";
const PILL_ORDER: Exclude<NativeStage, "idle">[] = ["upload", "extract", "mine", "done"];
const pillCopy = {
  en: { upload: "Uploading video...", extract: "Extracting frames & audio...", mine: "AI Mining Core Brain...", done: "Published to Feed!" },
  mn: { upload: "Видео хуулж байна...", extract: "Кадр, дуу салгаж байна...", mine: "AI Core Brain майнинг...", done: "Фийдэд нийтлэгдлээ!" },
  ko: { upload: "영상 업로드 중...", extract: "프레임·오디오 추출 중...", mine: "AI 코어 브레인 마이닝...", done: "피드에 게시됨!" },
};

/** Step-by-step status pills for an uploaded or recorded video. */
export function NativeMiningPills({ lang, stage }: { lang: Lang; stage: NativeStage }) {
  const t = pickCopy(pillCopy, lang);
  const at = stage === "idle" ? -1 : PILL_ORDER.indexOf(stage);
  return (
    <div className="flex flex-wrap gap-2">
      {PILL_ORDER.map((s, i) => (
        <span
          key={s}
          className={`rounded-full border px-3 py-1 text-xs ${
            i < at || stage === "done"
              ? "border-primary bg-primary/10 text-primary"
              : i === at
                ? "animate-pulse border-primary text-foreground"
                : "border-border text-muted-foreground"
          }`}
        >
          {t[s]}
        </span>
      ))}
    </div>
  );
}
