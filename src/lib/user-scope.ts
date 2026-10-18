/**
 * Keeps device-local data (IndexedDB keys, cached tokens, drafts) namespaced per
 * signed-in account so two people sharing a browser never see each other's minds.
 */

const SCOPE_KEY = "evermind.uid";
const LEGACY_PREFIX = "evermine.";
const BRAND_PREFIX = "evermind.";

/**
 * One-time rename of pre-rebrand ("evermine.*") local keys so existing users keep
 * their language, role and category preferences after the Evermind rename.
 */
export function migrateLegacyBrandKeys(): void {
  if (typeof window === "undefined") return;
  try {
    const legacy: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith(LEGACY_PREFIX) || k === "evermine-lang")) legacy.push(k);
    }
    for (const k of legacy) {
      const value = window.localStorage.getItem(k);
      const next = k === "evermine-lang" ? "evermind-lang" : `${BRAND_PREFIX}${k.slice(LEGACY_PREFIX.length)}`;
      if (value !== null && window.localStorage.getItem(next) === null) {
        window.localStorage.setItem(next, value);
      }
      window.localStorage.removeItem(k);
    }
  } catch {
    /* storage disabled — nothing to migrate */
  }
}

/** Remembers which account owns the local data currently on this device. */
export function setLocalScope(userId: string | null): void {
  if (typeof window === "undefined") return;
  if (userId) window.localStorage.setItem(SCOPE_KEY, userId);
  else window.localStorage.removeItem(SCOPE_KEY);
}

/**
 * Account-scope readiness gate.
 *
 * On a page reload the signed-in account id is only known after Supabase
 * restores the session. Anything that reads device-local per-account data
 * (API keys, engine stack, miner choice) must wait for that, otherwise it
 * reads the "anon:" vault and looks like the app forgot the saved key.
 */
let scopeResolved = false;
let releaseScope: () => void = () => undefined;
const scopeGate = new Promise<void>((resolve) => {
  releaseScope = resolve;
});

/** Called by the app shell once the session (or its absence) is known. */
export function markScopeResolved(): void {
  scopeResolved = true;
  releaseScope();
}

export async function whenScopeReady(): Promise<void> {
  if (typeof window === "undefined" || scopeResolved) return;
  await Promise.race([scopeGate, new Promise<void>((r) => window.setTimeout(r, 4000))]);
}

export function getLocalScope(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SCOPE_KEY);
}

/** Prefixes a storage key with the active account id. */
export function scopedKey(key: string): string {
  const uid = getLocalScope();
  return uid ? `${uid}:${key}` : `anon:${key}`;
}

/**
 * Clears every session-bound value on sign-out or account switch: the Supabase
 * session, cached identity, and any legacy brand keys. The leaving account's own
 * device data is erased outright, and ownerless leftovers are erased too so the
 * next person to sign in can never inherit them.
 */
export function clearUserScopedLocalData(): void {
  if (typeof window === "undefined") return;
  const leaving = getLocalScope();
  const drop: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (
      k.startsWith("sb-") ||
      k.startsWith("evermind.session") ||
      k.startsWith("evermine.session") ||
      k === SCOPE_KEY
    ) {
      drop.push(k);
    }
  }
  drop.forEach((k) => window.localStorage.removeItem(k));
  // Non-user timestamp only: preserve the module refresh circuit breaker.
  const moduleReload = window.sessionStorage.getItem("evermind:module-reload");
  window.sessionStorage.clear();
  if (moduleReload) window.sessionStorage.setItem("evermind:module-reload", moduleReload);
  void purgeDeviceData(leaving);
}

/**
 * Deletes the browser-stored records owned by one account, plus every ownerless
 * ("anon:") record. Nothing from a previous visitor is ever handed on.
 */
export async function purgeDeviceData(userId: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  const { idbKeys, idbDelete, STORES } = await import("./store");
  for (const store of [STORES.SETTINGS, STORES.SESSION]) {
    const keys = await idbKeys(store);
    for (const key of keys) {
      if (key.startsWith("anon:") || (userId && key.startsWith(`${userId}:`))) {
        await idbDelete(store, key);
      }
    }
  }
}
