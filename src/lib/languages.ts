export type LangCode = "en" | "mn" | "zh" | "ko" | "es";

export const LANGUAGES: Record<
  LangCode,
  { code: LangCode; name: string; native: string; flag: string; speechLang: string }
> = {
  en: { code: "en", name: "English", native: "English", flag: "EN", speechLang: "en-US" },
  mn: { code: "mn", name: "Mongolian", native: "Монгол", flag: "MN", speechLang: "mn-MN" },
  zh: { code: "zh", name: "Chinese", native: "中文", flag: "ZH", speechLang: "zh-CN" },
  ko: { code: "ko", name: "Korean", native: "한국어", flag: "KO", speechLang: "ko-KR" },
  es: { code: "es", name: "Spanish", native: "Español", flag: "ES", speechLang: "es-ES" },
};

export const LANG_LIST = Object.values(LANGUAGES);

export function isLangCode(value: unknown): value is LangCode {
  return typeof value === "string" && value in LANGUAGES;
}
