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
/** Retry counter per string so a broken reply is re-tried, then rested. */
const attempts = new Map<string, number>();
/**
 * Lines the engine failed on. They are NOT saved as translations: they simply
 * stop being re-requested for this page session, and come back the moment the
 * viewer changes an engine or key, or reloads the page.
 */
const missed = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let version = 0;
/** Set when the AI balance is exhausted — no further requests are sent. */
let blocked = false;
let noticeShown = false;
/** Told once per session which engine answered when the picked one was resting. */
let skipNoticeShown = false;

/** A key or engine change makes every earlier failure worth retrying. */
if (typeof window !== "undefined") {
  window.addEventListener("evermind:ai-keys-changed", () => {
    missed.clear();
    attempts.clear();
    blocked = false;
    noticeShown = false;
    skipNoticeShown = false;
    emit();
  });
}

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

/**
 * Plain Latin text is the one genuinely free case: asking the engine to turn
 * English into English costs money and changes nothing. Everything else —
 * Mongolian Cyrillic, Korean, Japanese… — is translated like any other pair,
 * English included, because videos are mined in the language they were spoken.
 */
const LATIN_ONLY = /^[\u0000-\u024F\u2000-\u206F\u20A0-\u20BF]*$/u;

/** Returns the cached translation, or null when it has not been fetched yet. */
export function getCachedTranslation(text: string, lang: LangCode): string | null {
  if (!text) return "";
  if (lang === "en" && LATIN_ONLY.test(text)) return text;
  return loadCache(lang)[text] ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function flush() {
  timer = null;
  // Translation runs on the signed-in person's own AI key, so the server
  // function needs a session. Signed-out visitors keep the original text
  // instead of firing an unauthorised call that surfaces as an error.
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      pending.clear();
      inflight.clear();
      return;
    }
  } catch {
    pending.clear();
    return;
  }
  const jobs = [...pending.entries()];
  pending.clear();
  let firstBatch = true;
  for (const [lang, set] of jobs) {
    // Pace batches: firing them back-to-back bursts past the free tier's
    // per-minute limit and produces scary false "quota used up" warnings.
    if (!firstBatch) await sleep(1200);
    firstBatch = false;
    const queued = [...set].filter((t) => !inflight.has(`${lang}:${t}`));
    const texts = queued.slice(0, 16);
    // Anything over one batch stays queued instead of being silently dropped —
    // that is why long pages used to stay half-translated.
    const rest = queued.slice(16);
    if (rest.length) {
      const keep = pending.get(lang) ?? new Set<string>();
      for (const t of rest) keep.add(t);
      pending.set(lang, keep);
    }
    if (!texts.length) continue;
    for (const t of texts) inflight.add(`${lang}:${t}`);
    try {
      const res = await translateTexts({
        data: {
          texts,
          target: lang,
          targetName: LANGUAGES[lang].name,
          domain: "AI video-mining app UI",
        },
      });
      const state = (res as { blocked?: string }).blocked;
      // Say once which engine actually answered when the picked one was resting,
      // instead of letting another engine's complaint speak for it.
      const away = (res as { skipped?: { provider: string; tail: string; reason: string; until: string | null } }).skipped;
      if (away && !skipNoticeShown) {
        skipNoticeShown = true;
        const answered = (res as { provider?: string }).provider ?? "another engine";
        const until = away.until ? new Date(away.until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
        const why =
          away.reason === "rejected"
            ? "was refused by its provider"
            : away.reason === "capped"
              ? "reached its spending cap"
              : "is resting after a limit";
        void import("sonner").then(({ toast }) =>
          toast.message(
            `${away.provider} …${away.tail} ${why}${until ? ` until ${until}` : ""}. ${answered} translated instead.`,
            {
              duration: 10_000,
              action: { label: "Open API Manager", onClick: () => { window.location.href = "/keys"; } },
            },
          ),
        );
      }
      if ((res as { retry?: boolean }).retry) {
        // Re-queue a limited number of times: a broken reply must never be
        // cached as a translation, but it must not loop forever either.
        const keep = pending.get(lang) ?? new Set<string>();
        for (const t of texts) {
          const key = `${lang}:${t}`;
          const tries = (attempts.get(key) ?? 0) + 1;
          attempts.set(key, tries);
          // One retry only: more than that just spends the viewer's quota on
          // an engine that is clearly not answering properly right now. The
          // line is rested, never saved as if it were translated.
          if (tries <= 1) keep.add(t);
          else missed.add(key);
        }
        if (keep.size) pending.set(lang, keep);
        continue;
      }
      const failed = (res as { failed?: string }).failed;
      if (failed) {
        if (!noticeShown) {
          noticeShown = true;
          void import("sonner").then(({ toast }) => toast.error(failed, { duration: 12_000 }));
        }
        continue;
      }
      if (state === "no_key" || state === "quota") {
        // The viewer has no working AI access of their own: stop queueing work
        // and say so once, instead of quietly showing the original language.
        blocked = true;
        // A block is never permanent: a key can be added, enabled or reset
        // while the page stays open, so try again a few minutes later.
        setTimeout(() => {
          blocked = false;
          noticeShown = false;
          // Lines missed during the pause are worth asking for again.
          missed.clear();
          attempts.clear();
          emit();
        }, 5 * 60 * 1000);
        pending.clear();
        for (const t of texts) inflight.delete(`${lang}:${t}`);
        if (!noticeShown) {
          noticeShown = true;
          const goToKeys = () => {
            window.location.href = "/keys";
          };
          const quotaMsg =
            "Translation is paused because the AI chosen for translating reached its limit. It will switch to your next enabled key automatically.";
          void import("sonner").then(({ toast }) =>
            toast.error(
              state === "quota"
                ? quotaMsg
                : "No working AI key for translating yet. Pick one for “Translating” in the API Manager.",
              {
                duration: 12_000,
                // Tapping the action takes the viewer straight to the key setup
                // guide instead of leaving them stuck on untranslated text.
                action: { label: "Open API Manager", onClick: goToKeys },
              },
            ),
          );
        }
        return;
      }
      const cache = loadCache(lang);
      const skipped = new Set((res as { untranslated?: number[] }).untranslated ?? []);
      res.texts.forEach((out, i) => {
        const src = texts[i]!;
        const key = `${lang}:${src}`;
        // A line the engine skipped is never saved as a translation. After a
        // couple of misses it simply rests for this session, and is asked for
        // again after a reload or an engine change.
        if (skipped.has(i)) {
          const tries = (attempts.get(key) ?? 0) + 1;
          attempts.set(key, tries);
          if (tries > 2) missed.add(key);
          return;
        }
        // Cache every genuinely returned string, including ones that come back
        // identical (names, numbers, "OK").
        cache[src] = out;
        attempts.delete(key);
        missed.delete(key);
      });
      persist(lang);
      emit();
    } catch {
      /* keep the original text */
    } finally {
      for (const t of texts) inflight.delete(`${lang}:${t}`);
    }
  }
  if (pending.size && !timer) timer = setTimeout(flush, 1200);
}

/** Queues a string for translation into `lang`. Safe to call in render. */
export function requestTranslation(text: string, lang: LangCode): void {
  if (typeof window === "undefined") return;
  if (lang === "en" && LATIN_ONLY.test(text)) return;
  if (blocked) return;
  if (!text) return;
  if (text.length > 3000) return;
  if (loadCache(lang)[text] != null) return;
  if (missed.has(`${lang}:${text}`)) return;
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
  missed.clear();
  attempts.clear();
  try {
    for (const code of Object.keys(LANGUAGES)) window.localStorage.removeItem(storageKey(code as LangCode));
  } catch {
    /* ignore */
  }
  emit();
}
