/**
 * Display-layer translation cache.
 *
 * The mined Core Brain JSON is always stored in English in the database. This
 * module translates English source strings into the viewer's active language
 * only at render time, batching requests and caching results in localStorage so
 * the same string is never translated twice.
 */
import { LANGUAGES, type LangCode } from "@/lib/languages";
import { translateTexts } from "@/lib/translate.functions";

type Cache = Record<string, string>;

const memory = new Map<LangCode, Cache>();
const pending = new Map<LangCode, Set<string>>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

const storageKey = (lang: LangCode) => `evermind-i18n-cache:${lang}`;

function loadCache(lang: LangCode): Cache {
  const hit = memory.get(lang);
  if (hit) return hit;
  let parsed: Cache = {};
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey(lang)) : null;
    if (raw) parsed = JSON.parse(raw) as Cache;
  } catch {
    parsed = {};
  }
  memory.set(lang, parsed);
  return parsed;
}

function persist(lang: LangCode) {
  try {
    window.localStorage.setItem(storageKey(lang), JSON.stringify(loadCache(lang)));
  } catch {
    /* quota or unavailable — memory cache still works */
  }
}

function emit() {
  version += 1;
  for (const l of listeners) l();
}

export function subscribeTranslations(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function translationVersion(): number {
  return version;
}

/** Returns the cached translation, or null when it has not been fetched yet. */
export function getCachedTranslation(text: string, lang: LangCode): string | null {
  if (!text) return "";
  return loadCache(lang)[text] ?? null;
}

async function flush() {
  timer = null;
  const jobs = [...pending.entries()];
  pending.clear();
  for (const [lang, set] of jobs) {
    const queued = [...set].filter((t) => !inflight.has(`${lang}:${t}`));
    const texts = queued.slice(0, 40);
    // Anything over one batch stays queued instead of being silently dropped —
    // that is why long pages used to stay half-translated.
    const rest = queued.slice(40);
    if (rest.length) {
      const keep = pending.get(lang) ?? new Set<string>();
      for (const t of rest) keep.add(t);
      pending.set(lang, keep);
    }
    if (!texts.length) continue;
    for (const t of texts) inflight.add(`${lang}:${t}`);
    try {
      const res = await translateTexts({
        data: { texts, target: lang, targetName: LANGUAGES[lang].name, domain: "AI video-mining app UI" },
      });
      const cache = loadCache(lang);
      res.texts.forEach((out, i) => {
        const src = texts[i]!;
        cache[src] = out;
      });
      persist(lang);
      emit();
    } catch {
      /* keep the original text */
    } finally {
      for (const t of texts) inflight.delete(`${lang}:${t}`);
    }
  }
  if (pending.size && !timer) timer = setTimeout(flush, 200);
}

/** Queues a string for translation into `lang`. Safe to call in render. */
export function requestTranslation(text: string, lang: LangCode): void {
  if (typeof window === "undefined") return;
  if (!text) return;
  if (text.length > 3000) return;
  if (loadCache(lang)[text] != null) return;
  if (inflight.has(`${lang}:${text}`)) return;
  const set = pending.get(lang) ?? new Set<string>();
  set.add(text);
  pending.set(lang, set);
  if (!timer) timer = setTimeout(flush, 180);
}

/** Clears every cached translation (used on logout / account switch). */
export function clearTranslationCache(): void {
  memory.clear();
  pending.clear();
  inflight.clear();
  try {
    for (const code of Object.keys(LANGUAGES)) window.localStorage.removeItem(storageKey(code as LangCode));
  } catch {
    /* ignore */
  }
  emit();
}
