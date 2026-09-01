/**
 * The 20 languages Evermind speaks. The Core Brain JSON is always stored in
 * English; this catalogue only drives the display / speech layer.
 */
export type LangCode =
  | "en"
  | "mn"
  | "ko"
  | "ja"
  | "zh"
  | "es"
  | "fr"
  | "de"
  | "ru"
  | "pt"
  | "it"
  | "tr"
  | "vi"
  | "th"
  | "id"
  | "hi"
  | "ar"
  | "nl"
  | "pl"
  | "uk";

export type LanguageMeta = {
  code: LangCode;
  name: string;
  native: string;
  flag: string;
  speechLang: string;
  rtl?: boolean;
};

export const LANGUAGES: Record<LangCode, LanguageMeta> = {
  mn: { code: "mn", name: "Mongolian", native: "Монгол", flag: "MN", speechLang: "mn-MN" },
  en: { code: "en", name: "English", native: "English", flag: "EN", speechLang: "en-US" },
  ko: { code: "ko", name: "Korean", native: "한국어", flag: "KO", speechLang: "ko-KR" },
  ja: { code: "ja", name: "Japanese", native: "日本語", flag: "JA", speechLang: "ja-JP" },
  zh: { code: "zh", name: "Chinese (Simplified)", native: "简体中文", flag: "ZH", speechLang: "zh-CN" },
  es: { code: "es", name: "Spanish", native: "Español", flag: "ES", speechLang: "es-ES" },
  fr: { code: "fr", name: "French", native: "Français", flag: "FR", speechLang: "fr-FR" },
  de: { code: "de", name: "German", native: "Deutsch", flag: "DE", speechLang: "de-DE" },
  ru: { code: "ru", name: "Russian", native: "Русский", flag: "RU", speechLang: "ru-RU" },
  pt: { code: "pt", name: "Portuguese", native: "Português", flag: "PT", speechLang: "pt-BR" },
  it: { code: "it", name: "Italian", native: "Italiano", flag: "IT", speechLang: "it-IT" },
  tr: { code: "tr", name: "Turkish", native: "Türkçe", flag: "TR", speechLang: "tr-TR" },
  vi: { code: "vi", name: "Vietnamese", native: "Tiếng Việt", flag: "VI", speechLang: "vi-VN" },
  th: { code: "th", name: "Thai", native: "ไทย", flag: "TH", speechLang: "th-TH" },
  id: { code: "id", name: "Indonesian", native: "Bahasa Indonesia", flag: "ID", speechLang: "id-ID" },
  hi: { code: "hi", name: "Hindi", native: "हिन्दी", flag: "HI", speechLang: "hi-IN" },
  ar: { code: "ar", name: "Arabic", native: "العربية", flag: "AR", speechLang: "ar-SA", rtl: true },
  nl: { code: "nl", name: "Dutch", native: "Nederlands", flag: "NL", speechLang: "nl-NL" },
  pl: { code: "pl", name: "Polish", native: "Polski", flag: "PL", speechLang: "pl-PL" },
  uk: { code: "uk", name: "Ukrainian", native: "Українська", flag: "UK", speechLang: "uk-UA" },
};

export const LANG_LIST = Object.values(LANGUAGES);

export function isLangCode(value: unknown): value is LangCode {
  return typeof value === "string" && value in LANGUAGES;
}
