/**
 * Dynamic i18n for the guided Evermine studio. English + Mongolian ship today;
 * the dictionary shape is flat so new locales can be added without code changes.
 */
import { useCallback, useEffect, useState } from "react";

export type Lang = "en" | "mn";

export const LANG_LABELS: Record<Lang, string> = { en: "English", mn: "Монгол" };

export type Dict = Record<string, string>;

const en: Dict = {
  appName: "Evermine",
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

  limitsTitle: "What you can upload",
  limitYoutube: "YouTube: public or unlisted links, up to 2 hours.",
  limitDrive: "Google Drive / file upload: MP4 or MOV, max 2GB.",
  limitLangs: "Languages: native recognition for English, Mongolian and all global languages.",

  tipSource: "Tip: an unlisted link works fine — it just cannot be private.",
  tipGoogle: "Tip: signing in with Google automatically gives Evermine access to your free-tier Gemini API. You can revoke it any time from your Google account.",
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
  errSafety:
    "Google's AI safety filters stopped this analysis. Pick another clip or trim out sensitive, adult or violent moments — retrying the same footage won't help.",
  retry: "Retry",

  termsNotice:
    "Free tier notice: analysis runs on Google Gemini. On the free tier Google may review submitted content to improve their models, so avoid private or confidential footage.",
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

  ready: "Ready",
  complete: "Complete",
  successTitle: "Your mind is growing",
  successBody: "The knowledge from this video is now part of your AI clone.",
};

const mn: Dict = {
  appName: "Evermine",
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

  limitsTitle: "Юу оруулах боломжтой вэ",
  limitYoutube: "YouTube: Public эсвэл Unlisted линк, 2 цаг хүртэл.",
  limitDrive: "Google Drive / файл: MP4 эсвэл MOV, дээд тал нь 2GB.",
  limitLangs: "Хэл: Англи, Монгол болон дэлхийн бүх хэлийг төрөлх байдлаар таньдаг.",

  tipSource: "Зөвлөгөө: Unlisted линк тохирно — зөвхөн Private байж болохгүй.",
  tipGoogle: "Зөвлөгөө: Google-ээр нэвтрэхэд таны үнэгүй Gemini API Evermine-д автоматаар холбогдоно. Google бүртгэлээсээ хүссэн үедээ хүчингүй болгож болно.",
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
  errSafety:
    "Google-ийн AI аюулгүй байдлын шүүлтүүр энэ задалгааг зогсоолоо. Өөр хэсэг сонгох буюу эмзэг, насанд хүрэгчдийн, хүчирхийллийн агуулгыг хасна уу — ижил бичлэгийг дахин оролдох нь тус болохгүй.",
  retry: "Дахин оролдох",

  termsNotice:
    "Үнэгүй багцын мэдэгдэл: задалгаа Google Gemini дээр ажиллана. Үнэгүй багцад Google илгээсэн агуулгыг загвараа сайжруулахад ашиглаж болзошгүй тул хувийн, нууц бичлэг оруулахаас зайлсхийнэ үү.",
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

  ready: "Бэлэн",
  complete: "Дууссан",
  successTitle: "Таны оюун ухаан өсч байна",
  successBody: "Энэ бичлэгийн мэдлэг таны AI клоны нэг хэсэг боллоо.",
};

export const DICTS: Record<Lang, Dict> = { en, mn };

const STORAGE_KEY = "evermine-lang";

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "mn";
}

/** Reads/writes the active locale, shared across the app through localStorage. */
export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: (key: string) => string } {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (isLang(stored)) setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l;
    } catch {
      /* storage unavailable */
    }
  }, []);

  const t = useCallback((key: string) => DICTS[lang][key] ?? DICTS.en[key] ?? key, [lang]);

  return { lang, setLang, t };
}

export function tr(lang: Lang, key: string): string {
  return DICTS[lang][key] ?? DICTS.en[key] ?? key;
}
