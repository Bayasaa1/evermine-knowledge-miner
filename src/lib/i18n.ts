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

  step1Title: "Upload knowledge",
  step1Sub: "Paste a YouTube link or a Google Drive video. We analyse it directly — no converting, no splitting.",
  step2Title: "Select AI engine",
  step2Sub: "Start free, or plug in premium voice and avatar engines at the provider's own price.",
  step3Title: "Set subscription price",
  step3Sub: "Charge a monthly price for full access to your AI clone. You keep 80%.",

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
  tipEngine: "Tip: the free stack costs nothing and works everywhere. Upgrade any time.",
  tipPrice: "Tip: most creators start at $15/month and raise the price as their mind grows.",

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
  errNoKey: "Add a Gemini API key first so we can analyse your video.",
  retry: "Retry",

  diagTitle: "AI Assistant Diagnostics",
  diagThinking: "Working out what happened…",
  diagProblem: "Problem",
  diagFix: "Fix",
  diagTryAgain: "Try again",
  diagFallbackStep: "Check your link or file, then start the analysis again.",

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

  step1Title: "Мэдлэгээ оруулах",
  step1Sub: "YouTube линк эсвэл Google Drive бичлэгээ буулгана уу. Хөрвүүлэх, хуваах шаардлагагүй.",
  step2Title: "AI хөдөлгүүр сонгох",
  step2Sub: "Үнэгүй хувилбараар эхлэх эсвэл нийлүүлэгчийн үнээр премиум хоолой, аватар холбоно.",
  step3Title: "Захиалгын үнэ тогтоох",
  step3Sub: "AI клоны бүрэн эрхийг сараар зарна. Танд 80% ноогдоно.",

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
  tipEngine: "Зөвлөгөө: Үнэгүй багц ямар ч зардалгүй ажиллана. Хүссэн үедээ сайжруулж болно.",
  tipPrice: "Зөвлөгөө: Ихэнх бүтээгч сард $15-оос эхэлж, оюун ухаан нь өсөх тусам үнээ нэмдэг.",

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
  errNoKey: "Эхлээд Gemini API түлхүүрээ нэмнэ үү.",
  retry: "Дахин оролдох",

  diagTitle: "AI туслахын оношилгоо",
  diagThinking: "Юу болсныг тодруулж байна…",
  diagProblem: "Асуудал",
  diagFix: "Шийдэл",
  diagTryAgain: "Дахин оролдох",
  diagFallbackStep: "Линк эсвэл файлаа шалгаад дахин задлах товчийг дарна уу.",

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
