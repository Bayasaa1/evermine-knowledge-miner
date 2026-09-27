/**
 * Dynamic i18n for the guided Evermind studio. English + Mongolian ship today;
 * the dictionary shape is flat so new locales can be added without code changes.
 */
import { useCallback, useSyncExternalStore } from "react";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/languages";
import {
  getCachedTranslation,
  requestTranslation,
  subscribeTranslations,
  translationVersion,
} from "@/lib/dynamic-translate";

/** The active display language. Always one of the 20 supported locales. */
export type Lang = LangCode;

export const LANG_LABELS = Object.fromEntries(
  Object.values(LANGUAGES).map((l) => [l.code, l.native]),
) as Record<Lang, string>;

export type Dict = Record<string, string>;

const en: Dict = {
  appName: "Evermind",
  tagline: "A life becomes a mind",
  guided: "Guided setup",
  advanced: "Advanced dashboard",
  language: "Language",

  step: "Step",
  of: "of",
  next: "Continue",
  back: "Back",
  done: "Finish",

  step1Title: "What are you creating today?",
  step1Sub: "Your choice sets the video analysis and AI options for this mind.",
  step2Title: "Sign in or sign up",
  step2Sub: "Create your private account before saving projects and keys.",
  step3Title: "Add the required AI key",
  step3Sub: "Gemini reads the video. Optional specialist AIs can improve reasoning, but may add time or cost.",
  step5Title: "Access and pricing",
  step5Sub: "Choose free access or offer 1-month, 3-month, 1-year, and lifetime subscriptions.",

  sourceYoutube: "YouTube link",
  sourceDrive: "Google Drive link",
  sourceFile: "Upload a file",
  urlPlaceholder: "https://youtube.com/watch?v=…",
  drivePlaceholder: "https://drive.google.com/file/d/…",
  sourceLink: "Bilibili / VK / Rutube / video link",
  linkPlaceholder: "bilibili.com/video/BV… · vkvideo.ru/video… · rutube.ru/video/… · …/video.mp4",
  postedAtLabel: "Also posted on Bilibili, VK or Rutube? Paste that link so the feed plays it there (optional)",
  errPlatformUpload: "Bilibili, VK and Rutube don't let AI read their videos directly. Use \"Upload a file\" with your video and paste this link there — the feed will play it from that site.",
  chooseFile: "Choose video",
  analyze: "Analyse video",
  analyzing: "Analysing video…",
  cancel: "Cancel",

  limitsTitle: "What you can mine",
  limitYoutube: "YouTube: public links only. Gemini free tier allows up to 8 total hours per day.",
  limitDrive: "Google Drive / file upload: MP4 or MOV, max 2GB.",
  limitLangs: "Languages: native recognition for English, Mongolian and all global languages.",

  tipSource: "Tip: start with one short public video. Upload long or private files directly.",
  tipGoogle: "Tip: Google sign-in protects your Evermind account; a Gemini API key is added separately in step 3.",
  tipPrice: "Tip: most creators start free to grow an audience, then switch on a $5–$20/month subscription.",

  errFileSize: "File size exceeds limit (Max 2GB). Please upload a smaller video.",
  errFileType: "Unsupported format. Please upload an MP4 or MOV video.",
  errUrlPrivate: "YouTube link not found or not public. Gemini accepts public YouTube videos only.",
  errUrlDrive: "That Google Drive link isn't shareable. Set it to 'Anyone with the link'.",
  errUrlInvalid: "That link doesn't look right. Paste a full YouTube or Google Drive video URL.",
  errTooLong: "That video could not be read. Please try another link.",
  errNetwork: "Network connection lost. Please try again.",
  errKey: "Your API key was rejected. Please check it and try again.",
  errQuota: "Your AI quota is used up. Add another key or wait for the reset.",
  errGeneric: "Something went wrong while analysing this video. Please try again.",
  errNoKey: "Add and test your own Gemini API key in step 3 before mining.",
  errNoTarget: "Choose a persona and a saved project before starting mining.",
  errSafety:
    "Google's AI safety filters stopped this analysis. Pick another clip or trim out sensitive, adult or violent moments — retrying the same footage won't help.",
  retry: "Retry",

  termsLink: "Terms & Privacy",

  diagTitle: "AI Assistant Diagnostics",
  diagThinking: "Working out what happened…",
  diagProblem: "Problem",
  diagFix: "Fix",
  diagTryAgain: "Try again",
  diagFallbackStep: "Check your link or file, then start the analysis again.",

  errAssistantHint: "Analysis failed. Click the AI Assistant in the bottom-left for instant diagnosis.",

  botFab: "AI Assistant",
  botTitle: "System Diagnostic Assistant",
  botSubtitle: "Ask about any error — I'll explain it and how to fix it.",
  botPlaceholder: "Why did my video fail?…",
  botEmpty: "No errors captured yet. Ask me anything about the app.",
  botNewError: "captured — ask me what went wrong.",
  botThinking: "Diagnosing…",
  botClear: "Clear captured errors",
  botClose: "Close",
  botErrorContext: "Recent errors I can see",

  stopMining: "STOP / CANCEL MINING",
  stopRequested: "Stop requested — finishing the current checkpoint safely.",
  queueTitle: "Queued videos",
  terminalTitle: "Live mining terminal",

  ready: "Ready",
  complete: "Complete",
  successTitle: "Your mind is growing",
  successBody: "The knowledge from this video is now part of your AI clone.",
};

const mn: Dict = {
  appName: "Evermind",
  tagline: "Амьдрал оюун болно",
  guided: "Алхам алхмаар тохируулга",
  advanced: "Дэлгэрэнгүй самбар",
  language: "Хэл",

  step: "Алхам",
  of: "/",
  next: "Үргэлжлүүлэх",
  back: "Буцах",
  done: "Дуусгах",

  step1Title: "Өнөөдөр юу бүтээх вэ?",
  step1Sub: "Сонголт нь видео шинжилгээ болон AI сонголтыг тохируулна.",
  step2Title: "Нэвтрэх эсвэл бүртгүүлэх",
  step2Sub: "Төсөл, түлхүүрээ хадгалахын өмнө хувийн бүртгэл үүсгэнэ үү.",
  step3Title: "Шаардлагатай AI түлхүүр нэмэх",
  step3Sub: "Gemini видеог уншина. Нэмэлт AI нь дүгнэлтийг сайжруулж болох ч хугацаа, зардал нэмнэ.",
  step5Title: "Хандалт ба үнэ",
  step5Sub: "Үнэгүй эсвэл 1 сар, 3 сар, 1 жил, насан туршийн захиалга сонгоно уу.",

  sourceYoutube: "YouTube линк",
  sourceDrive: "Google Drive линк",
  sourceFile: "Файл оруулах",
  urlPlaceholder: "https://youtube.com/watch?v=…",
  drivePlaceholder: "https://drive.google.com/file/d/…",
  sourceLink: "Bilibili / VK / Rutube / видео линк",
  linkPlaceholder: "bilibili.com/video/BV… · vkvideo.ru/video… · rutube.ru/video/… · …/video.mp4",
  postedAtLabel: "Bilibili, VK эсвэл Rutube дээр тавьсан уу? Тэр линкийг оруулбал фийдэд тэндээс тоглоно (заавал биш)",
  errPlatformUpload: "Bilibili, VK, Rutube нь AI-д видеогоо шууд уншуулдаггүй. \"Файл оруулах\"-аар видеогоо оруулаад энэ линкийг тэнд буулгана уу — фийдэд тэр сайтаас тоглоно.",
  chooseFile: "Бичлэг сонгох",
  analyze: "Бичлэг задлах",
  analyzing: "Бичлэгийг задалж байна…",
  cancel: "Цуцлах",

  limitsTitle: "Юу олборлож болох вэ",
  limitYoutube: "YouTube: зөвхөн Public линк. Gemini үнэгүй түвшин өдөрт нийт 8 цаг хүртэл.",
  limitDrive: "Google Drive / файл: MP4 эсвэл MOV, дээд тал нь 2GB.",
  limitLangs: "Хэл: Англи, Монгол болон дэлхийн бүх хэлийг төрөлх байдлаар таньдаг.",

  tipSource: "Зөвлөгөө: нэг богино public видеоноос эхэл. Урт эсвэл private файлыг шууд оруулна уу.",
  tipGoogle: "Зөвлөгөө: Google нэвтрэлт Evermind бүртгэлийг хамгаална; Gemini түлхүүрийг 3-р алхамд тусад нь нэмнэ.",
  tipPrice: "Зөвлөгөө: Ихэнх бүтээгч эхлээд үнэгүй эхэлж, дараа нь сард $5–$20 захиалга нэмдэг.",

  errFileSize: "Бичлэгийн хэмжээ хэтэрсэн байна (Дээд тал нь 2GB). Багахан бичлэг оруулна уу.",
  errFileType: "Дэмжигдэхгүй формат. MP4 эсвэл MOV бичлэг оруулна уу.",
  errUrlPrivate: "YouTube линк олдсонгүй эсвэл public биш байна. Gemini зөвхөн public YouTube видео хүлээн авна.",
  errUrlDrive: "Энэ Google Drive линк нээлттэй биш байна. 'Anyone with the link' болгоно уу.",
  errUrlInvalid: "Линк буруу байна. YouTube эсвэл Google Drive-ийн бүтэн хаягийг оруулна уу.",
  errTooLong: "Энэ бичлэгийг уншиж чадсангүй. Өөр холбоос оруулна уу.",
  errNetwork: "Сүлжээ тасарлаа. Дахин оролдоно уу.",
  errKey: "API түлхүүр татгалзагдлаа. Шалгаад дахин оролдоно уу.",
  errQuota: "AI хязгаар дууслаа. Өөр түлхүүр нэмэх эсвэл сэргэхийг хүлээнэ үү.",
  errGeneric: "Бичлэгийг задлах үед алдаа гарлаа. Дахин оролдоно уу.",
  errNoKey: "Олборлохоос өмнө 3-р алхамд өөрийн Gemini API түлхүүрийг нэмж шалгана уу.",
  errNoTarget: "Олборлохын өмнө persona болон хадгалсан төслөө сонгоно уу.",
  errSafety:
    "Google-ийн AI аюулгүй байдлын шүүлтүүр энэ задалгааг зогсоолоо. Өөр хэсэг сонгох буюу эмзэг, насанд хүрэгчдийн, хүчирхийллийн агуулгыг хасна уу — ижил бичлэгийг дахин оролдох нь тус болохгүй.",
  retry: "Дахин оролдох",

  termsLink: "Үйлчилгээний нөхцөл ба Нууцлал",

  diagTitle: "AI туслахын оношилгоо",
  diagThinking: "Юу болсныг тодруулж байна…",
  diagProblem: "Асуудал",
  diagFix: "Шийдэл",
  diagTryAgain: "Дахин оролдох",
  diagFallbackStep: "Линк эсвэл файлаа шалгаад дахин задлах товчийг дарна уу.",

  errAssistantHint: "Задалгаа амжилтгүй боллоо. Зүүн доод булан дахь AI туслахаас шууд оношлогоо аваарай.",

  botFab: "AI туслах",
  botTitle: "Системийн оношлогооны туслах",
  botSubtitle: "Алдааны талаар асуугаарай — шалтгаан, засах аргыг тайлбарлая.",
  botPlaceholder: "Яагаад бичлэг амжилтгүй болсон бэ?…",
  botEmpty: "Одоогоор алдаа бүртгэгдээгүй байна. Аппын талаар юу ч асууж болно.",
  botNewError: "бүртгэгдлээ — юу болсныг асуугаарай.",
  botThinking: "Оношилж байна…",
  botClear: "Алдааны түүхийг цэвэрлэх",
  botClose: "Хаах",
  botErrorContext: "Миний харж буй сүүлийн алдаанууд",

  stopMining: "ЗОГСООХ / ЦУЦЛАХ",
  stopRequested: "Зогсоох хүсэлт хүлээн авлаа — одоогийн хэсгийг аюулгүй дуусгаж байна.",
  queueTitle: "Дараалалд буй бичлэгүүд",
  terminalTitle: "Шууд задалгааны терминал",

  ready: "Бэлэн",
  complete: "Дууссан",
  successTitle: "Таны оюун ухаан өсч байна",
  successBody: "Энэ бичлэгийн мэдлэг таны AI клоны нэг хэсэг боллоо.",
};

const ko: Dict = {
  appName: "Evermind",
  tagline: "하나의 삶이 하나의 마인드가 됩니다",
  guided: "단계별 설정",
  advanced: "고급 대시보드",
  language: "언어",

  step: "단계",
  of: "/",
  next: "계속",
  back: "뒤로",
  done: "완료",

  step1Title: "오늘은 무엇을 만들까요?",
  step1Sub: "선택에 따라 영상 분석 방식과 AI 옵션이 설정됩니다.",
  step2Title: "로그인 또는 가입",
  step2Sub: "프로젝트와 키를 저장하기 전에 개인 계정을 만드세요.",
  step3Title: "필수 AI 키 추가",
  step3Sub: "Gemini가 영상을 읽습니다. 선택 AI는 추론을 개선하지만 시간이나 비용이 늘 수 있습니다.",
  step5Title: "접근 권한 및 가격",
  step5Sub: "무료 또는 1개월, 3개월, 1년, 평생 구독을 선택하세요.",

  sourceYoutube: "YouTube 링크",
  sourceDrive: "Google Drive 링크",
  sourceFile: "파일 업로드",
  urlPlaceholder: "https://youtube.com/watch?v=…",
  drivePlaceholder: "https://drive.google.com/file/d/…",
  sourceLink: "Bilibili / VK / Rutube / 영상 링크",
  linkPlaceholder: "bilibili.com/video/BV… · vkvideo.ru/video… · rutube.ru/video/… · …/video.mp4",
  postedAtLabel: "Bilibili, VK, Rutube에도 올렸나요? 링크를 넣으면 피드에서 그 사이트로 재생됩니다 (선택)",
  errPlatformUpload: "Bilibili, VK, Rutube는 AI가 영상을 직접 읽을 수 없습니다. \"파일 업로드\"로 영상을 올리고 이 링크를 함께 붙여넣으세요 — 피드에서 그 사이트로 재생됩니다.",
  chooseFile: "영상 선택",
  analyze: "영상 분석",
  analyzing: "영상을 분석하는 중…",
  cancel: "취소",

  limitsTitle: "마이닝 가능한 항목",
  limitYoutube: "YouTube: 공개 링크만 가능. Gemini 무료 등급은 하루 총 8시간까지입니다.",
  limitDrive: "Google Drive / 파일 업로드: MP4 또는 MOV, 최대 2GB.",
  limitLangs: "언어: 한국어, 영어, 몽골어를 비롯한 전 세계 언어를 원어 그대로 인식합니다.",

  tipSource: "팁: 짧은 공개 영상 하나로 시작하세요. 긴 영상이나 비공개 파일은 직접 업로드하세요.",
  tipGoogle: "팁: Google 로그인은 Evermind 계정을 보호하며 Gemini API 키는 3단계에서 별도로 추가합니다.",
  tipPrice: "팁: 대부분의 창작자는 무료로 시작해 팬을 모은 뒤 월 $5–$20 구독으로 전환합니다.",

  errFileSize: "파일 크기가 제한을 초과했습니다 (최대 2GB). 더 작은 영상을 업로드해 주세요.",
  errFileType: "지원하지 않는 형식입니다. MP4 또는 MOV 영상을 업로드해 주세요.",
  errUrlPrivate: "YouTube 링크가 없거나 공개 상태가 아닙니다. Gemini는 공개 YouTube 영상만 받습니다.",
  errUrlDrive: "이 Google Drive 링크는 공유되지 않았습니다. '링크가 있는 모든 사용자'로 설정해 주세요.",
  errUrlInvalid: "링크 형식이 올바르지 않습니다. 전체 YouTube 또는 Google Drive 주소를 붙여넣어 주세요.",
  errTooLong: "이 영상을 읽지 못했습니다. 다른 링크를 사용해 주세요.",
  errNetwork: "네트워크 연결이 끊어졌습니다. 다시 시도해 주세요.",
  errKey: "API 키가 거부되었습니다. 확인 후 다시 시도해 주세요.",
  errQuota: "AI 사용량이 모두 소진되었습니다. 다른 키를 추가하거나 초기화를 기다려 주세요.",
  errGeneric: "영상을 분석하는 중 문제가 발생했습니다. 다시 시도해 주세요.",
  errNoKey: "마이닝 전에 3단계에서 본인의 Gemini API 키를 추가하고 테스트하세요.",
  errNoTarget: "마이닝을 시작하기 전에 페르소나와 저장된 프로젝트를 선택하세요.",
  errSafety:
    "Google AI 안전 필터가 이 분석을 중단했습니다. 다른 장면을 선택하거나 민감·성인·폭력적인 부분을 잘라내 주세요 — 같은 영상을 다시 시도해도 통과되지 않습니다.",
  retry: "다시 시도",

  termsLink: "이용약관 및 개인정보 처리방침",

  diagTitle: "AI 어시스턴트 진단",
  diagThinking: "무슨 일이 있었는지 파악하는 중…",
  diagProblem: "문제",
  diagFix: "해결 방법",
  diagTryAgain: "다시 시도",
  diagFallbackStep: "링크나 파일을 확인한 뒤 분석을 다시 시작하세요.",

  errAssistantHint: "분석에 실패했습니다. 왼쪽 아래 AI 어시스턴트를 눌러 즉시 진단을 받아보세요.",

  botFab: "AI 어시스턴트",
  botTitle: "시스템 진단 어시스턴트",
  botSubtitle: "어떤 오류든 물어보세요 — 원인과 해결 방법을 알려드립니다.",
  botPlaceholder: "왜 영상 분석이 실패했나요?…",
  botEmpty: "아직 기록된 오류가 없습니다. 앱에 대해 무엇이든 물어보세요.",
  botNewError: "기록됨 — 무엇이 잘못됐는지 물어보세요.",
  botThinking: "진단 중…",
  botClear: "기록된 오류 지우기",
  botClose: "닫기",
  botErrorContext: "확인 가능한 최근 오류",

  stopMining: "채굴 중지 / 취소",
  stopRequested: "중지 요청됨 — 현재 체크포인트를 안전하게 마무리하는 중입니다.",
  queueTitle: "대기 중인 영상",
  terminalTitle: "실시간 마이닝 터미널",

  ready: "준비 완료",
  complete: "완료",
  successTitle: "당신의 마인드가 자라고 있습니다",
  successBody: "이 영상의 지식이 이제 당신의 AI 클론의 일부가 되었습니다.",
};

export const DICTS: Partial<Record<Lang, Dict>> = { en, mn, ko };

/**
 * Picks a component-local copy map entry for the active locale, falling back to
 * English so a partially translated map never renders an empty UI.
 */
export function pickCopy<C extends { en: unknown }>(copy: C, lang: Lang): C["en"] {
  return ((copy as Record<string, unknown>)[lang] ?? copy.en) as C["en"];
}

const STORAGE_KEY = "evermind-lang";

export function isLang(v: unknown): v is Lang {
  return isLangCode(v);
}

/* ------------------------------------------------------------------ *
 * Global language store — one source of truth for every tab and view. *
 * Synchronises instantly across components and across browser tabs.   *
 * ------------------------------------------------------------------ */

let current: Lang = "en";
const langListeners = new Set<() => void>();
let hydrated = false;

function notifyLang() {
  for (const l of langListeners) l();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isLang(stored) && stored !== current) {
    // Applied after hydration, never during it: swapping the language while
    // React is matching the server HTML makes the whole tree mismatch and be
    // thrown away, which is what made pages flash and re-render on open.
    const next = stored;
    queueMicrotask(() => {
      if (current === next) return;
      current = next;
      document.documentElement.lang = next;
      document.documentElement.dir = LANGUAGES[next].rtl ? "rtl" : "ltr";
      notifyLang();
    });
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    if (isLang(e.newValue) && e.newValue !== current) {
      current = e.newValue;
      document.documentElement.lang = current;
      document.documentElement.dir = LANGUAGES[current].rtl ? "rtl" : "ltr";
      notifyLang();
    }
  });
}

export function getLang(): Lang {
  return current;
}

export function setGlobalLang(l: Lang) {
  if (!isLang(l) || l === current) return;
  current = l;
  try {
    window.localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
    document.documentElement.dir = LANGUAGES[l].rtl ? "rtl" : "ltr";
  } catch {
    /* storage unavailable */
  }
  notifyLang();
}

function subscribeLang(cb: () => void) {
  hydrate();
  langListeners.add(cb);
  return () => langListeners.delete(cb);
}

/**
 * Active locale + translator, shared globally. Strings missing from a hand
 * written dictionary are streamed through the dynamic translation layer, so
 * every one of the 20 languages renders natively without a static dictionary.
 */
export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string } {
  const lang = useSyncExternalStore(
    subscribeLang,
    () => current,
    () => "en" as Lang,
  );
  useSyncExternalStore(subscribeTranslations, translationVersion, () => 0);

  const setLang = useCallback((l: Lang) => setGlobalLang(l), []);
  const t = useCallback((key: string) => tr(lang, key), [lang]);

  return { lang, setLang, t };
}

export function tr(lang: Lang, key: string): string {
  const local = DICTS[lang]?.[key];
  if (local) return local;
  const source = DICTS.en?.[key] ?? key;
  if (lang === "en") return source;
  const cached = getCachedTranslation(source, lang);
  if (cached) return cached;
  requestTranslation(source, lang);
  return source;
}

/**
 * Content mined from a creator can be in any language (Mongolian speech, Korean
 * titles…). Whatever the source language is, it is shown in the viewer's active
 * language — including English. Only plain Latin text is left alone when the
 * viewer is on English, so we never spend a call translating English→English.
 */
const LATIN_ONLY = /^[\u0000-\u024F\u2000-\u206F\u20A0-\u20BF]*$/u;

function display(text: string | null | undefined, lang: Lang): string {
  if (!text) return "";
  if (lang === "en" && LATIN_ONLY.test(text)) return text;
  const cached = getCachedTranslation(text, lang);
  if (cached) return cached;
  requestTranslation(text, lang);
  return text;
}

export function useDisplayText(text: string | null | undefined): string {
  const { lang } = useLang();
  return display(text, lang);
}

/** Batch variant of {@link useDisplayText}. */
export function useDisplayTexts(texts: (string | null | undefined)[]): string[] {
  const { lang } = useLang();
  return texts.map((text) => display(text, lang));
}

/**
 * Same cached translation path, but into a language the viewer picked for one
 * place (subtitles, spoken voice) instead of the whole app. `"source"` keeps
 * the text exactly as it was mined.
 */
export function useDisplayTextsIn(
  texts: (string | null | undefined)[],
  lang: Lang | "source",
): string[] {
  // Subscribing keeps the caller re-rendering as translations land, exactly
  // like useDisplayTexts does through useLang.
  useSyncExternalStore(subscribeTranslations, translationVersion, () => 0);
  if (lang === "source") return texts.map((t) => t ?? "");
  return texts.map((text) => display(text, lang));
}

export function useDisplayTextIn(text: string | null | undefined, lang: Lang | "source"): string {
  return useDisplayTextsIn([text], lang)[0] ?? "";
}

