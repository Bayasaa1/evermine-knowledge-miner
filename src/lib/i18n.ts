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

  step1Title: "Sign in with Google",
  step1Sub: "One tap links your Google account's free Gemini API — no API keys, no copy-pasting, no setup.",
  step2Title: "Paste your link",
  step2Sub: "Paste a YouTube link or a Google Drive video. We analyse it directly — no converting, no splitting.",
  step3Title: "Monetization control",
  step3Sub: "Keep your AI clone free for everyone, or charge a monthly subscription — switch any time. You keep 80%.",

  sourceYoutube: "YouTube link",
  sourceDrive: "Google Drive link",
  sourceFile: "Upload a file",
  urlPlaceholder: "https://youtube.com/watch?v=…",
  drivePlaceholder: "https://drive.google.com/file/d/…",
  chooseFile: "Choose video",
  analyze: "Analyse video",
  analyzing: "Analysing video…",
  cancel: "Cancel",

  limitsTitle: "What you can mine",
  limitYoutube: "YouTube: public or unlisted links, up to 2 hours.",
  limitDrive: "Google Drive / file upload: MP4 or MOV, max 2GB.",
  limitLangs: "Languages: native recognition for English, Mongolian and all global languages.",

  tipSource: "Tip: an unlisted link works fine — it just cannot be private.",
  tipGoogle: "Tip: signing in with Google automatically gives Evermind access to your free-tier Gemini API. You can revoke it any time from your Google account.",
  tipPrice: "Tip: most creators start free to grow an audience, then switch on a $5–$20/month subscription.",

  errFileSize: "File size exceeds limit (Max 2GB). Please upload a smaller video.",
  errFileType: "Unsupported format. Please upload an MP4 or MOV video.",
  errUrlPrivate: "YouTube link not found or is set to Private. Please set it to Public or Unlisted.",
  errUrlDrive: "That Google Drive link isn't shareable. Set it to 'Anyone with the link'.",
  errUrlInvalid: "That link doesn't look right. Paste a full YouTube or Google Drive video URL.",
  errTooLong: "Video is longer than 2 hours. Please upload a shorter video.",
  errNetwork: "Network connection lost. Please try again.",
  errKey: "Your API key was rejected. Please check it and try again.",
  errQuota: "Your AI quota is used up. Add another key or wait for the reset.",
  errGeneric: "Something went wrong while analysing this video. Please try again.",
  errNoKey: "Sign in with Google (Step 1) first — it links your Gemini API automatically.",
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

  step1Title: "Google-ээр нэвтрэх",
  step1Sub: "Нэг товшилтоор Google бүртгэлийн үнэгүй Gemini API автоматаар холбогдоно — API түлхүүр, тохиргоо огт шаардлагагүй.",
  step2Title: "Линкээ буулгах",
  step2Sub: "YouTube линк эсвэл Google Drive бичлэгээ буулгана уу. Хөрвүүлэх, хуваах шаардлагагүй.",
  step3Title: "Орлогын удирдлага",
  step3Sub: "AI клоноо бүхэнд үнэгүй болгох эсвэл сарын захиалга тогтоох — хүссэн үедээ сольж болно. Танд 80% ноогдоно.",

  sourceYoutube: "YouTube линк",
  sourceDrive: "Google Drive линк",
  sourceFile: "Файл оруулах",
  urlPlaceholder: "https://youtube.com/watch?v=…",
  drivePlaceholder: "https://drive.google.com/file/d/…",
  chooseFile: "Бичлэг сонгох",
  analyze: "Бичлэг задлах",
  analyzing: "Бичлэгийг задалж байна…",
  cancel: "Цуцлах",

  limitsTitle: "Юу олборлож болох вэ",
  limitYoutube: "YouTube: Public эсвэл Unlisted линк, 2 цаг хүртэл.",
  limitDrive: "Google Drive / файл: MP4 эсвэл MOV, дээд тал нь 2GB.",
  limitLangs: "Хэл: Англи, Монгол болон дэлхийн бүх хэлийг төрөлх байдлаар таньдаг.",

  tipSource: "Зөвлөгөө: Unlisted линк тохирно — зөвхөн Private байж болохгүй.",
  tipGoogle: "Зөвлөгөө: Google-ээр нэвтрэхэд таны үнэгүй Gemini API Evermind-д автоматаар холбогдоно. Google бүртгэлээсээ хүссэн үедээ хүчингүй болгож болно.",
  tipPrice: "Зөвлөгөө: Ихэнх бүтээгч эхлээд үнэгүй эхэлж, дараа нь сард $5–$20 захиалга нэмдэг.",

  errFileSize: "Бичлэгийн хэмжээ хэтэрсэн байна (Дээд тал нь 2GB). Багахан бичлэг оруулна уу.",
  errFileType: "Дэмжигдэхгүй формат. MP4 эсвэл MOV бичлэг оруулна уу.",
  errUrlPrivate: "YouTube линк олдсонгүй эсвэл Private тохиргоотой байна. Public эсвэл Unlisted болгоно уу.",
  errUrlDrive: "Энэ Google Drive линк нээлттэй биш байна. 'Anyone with the link' болгоно уу.",
  errUrlInvalid: "Линк буруу байна. YouTube эсвэл Google Drive-ийн бүтэн хаягийг оруулна уу.",
  errTooLong: "Бичлэг 2 цагаас урт байна. Богино бичлэг оруулна уу.",
  errNetwork: "Сүлжээ тасарлаа. Дахин оролдоно уу.",
  errKey: "API түлхүүр татгалзагдлаа. Шалгаад дахин оролдоно уу.",
  errQuota: "AI хязгаар дууслаа. Өөр түлхүүр нэмэх эсвэл сэргэхийг хүлээнэ үү.",
  errGeneric: "Бичлэгийг задлах үед алдаа гарлаа. Дахин оролдоно уу.",
  errNoKey: "Эхлээд 1-р алхамд Google-ээр нэвтэрнэ үү — Gemini API автоматаар холбогдоно.",
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

  step1Title: "Google로 로그인",
  step1Sub: "한 번의 탭으로 Google 계정의 무료 Gemini API가 연결됩니다 — API 키도, 복사·붙여넣기도, 설정도 필요 없습니다.",
  step2Title: "링크 붙여넣기",
  step2Sub: "YouTube 링크나 Google Drive 영상을 붙여넣으세요. 변환이나 분할 없이 바로 분석합니다.",
  step3Title: "수익화 설정",
  step3Sub: "AI 클론을 무료로 공개하거나 월 구독으로 판매하세요 — 언제든 변경할 수 있고, 수익의 80%는 창작자의 몫입니다.",

  sourceYoutube: "YouTube 링크",
  sourceDrive: "Google Drive 링크",
  sourceFile: "파일 업로드",
  urlPlaceholder: "https://youtube.com/watch?v=…",
  drivePlaceholder: "https://drive.google.com/file/d/…",
  chooseFile: "영상 선택",
  analyze: "영상 분석",
  analyzing: "영상을 분석하는 중…",
  cancel: "취소",

  limitsTitle: "마이닝 가능한 항목",
  limitYoutube: "YouTube: 공개 또는 미등록 링크, 최대 2시간.",
  limitDrive: "Google Drive / 파일 업로드: MP4 또는 MOV, 최대 2GB.",
  limitLangs: "언어: 한국어, 영어, 몽골어를 비롯한 전 세계 언어를 원어 그대로 인식합니다.",

  tipSource: "팁: 미등록(Unlisted) 링크도 괜찮습니다 — 비공개만 아니면 됩니다.",
  tipGoogle: "팁: Google로 로그인하면 무료 Gemini API가 Evermind에 자동으로 연결됩니다. Google 계정에서 언제든 해제할 수 있습니다.",
  tipPrice: "팁: 대부분의 창작자는 무료로 시작해 팬을 모은 뒤 월 $5–$20 구독으로 전환합니다.",

  errFileSize: "파일 크기가 제한을 초과했습니다 (최대 2GB). 더 작은 영상을 업로드해 주세요.",
  errFileType: "지원하지 않는 형식입니다. MP4 또는 MOV 영상을 업로드해 주세요.",
  errUrlPrivate: "YouTube 링크를 찾을 수 없거나 비공개 상태입니다. 공개 또는 미등록으로 변경해 주세요.",
  errUrlDrive: "이 Google Drive 링크는 공유되지 않았습니다. '링크가 있는 모든 사용자'로 설정해 주세요.",
  errUrlInvalid: "링크 형식이 올바르지 않습니다. 전체 YouTube 또는 Google Drive 주소를 붙여넣어 주세요.",
  errTooLong: "영상이 2시간을 초과합니다. 더 짧은 영상을 올려주세요.",
  errNetwork: "네트워크 연결이 끊어졌습니다. 다시 시도해 주세요.",
  errKey: "API 키가 거부되었습니다. 확인 후 다시 시도해 주세요.",
  errQuota: "AI 사용량이 모두 소진되었습니다. 다른 키를 추가하거나 초기화를 기다려 주세요.",
  errGeneric: "영상을 분석하는 중 문제가 발생했습니다. 다시 시도해 주세요.",
  errNoKey: "먼저 1단계에서 Google로 로그인하세요 — Gemini API가 자동으로 연결됩니다.",
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

