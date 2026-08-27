/**
 * Keeps device-local data (IndexedDB keys, cached tokens, drafts) namespaced per
 * signed-in account so two people sharing a browser never see each other's minds.
 */

const SCOPE_KEY = "evermind.uid";

/** Remembers which account owns the local data currently on this device. */
export function setLocalScope(userId: string | null): void {
  if (typeof window === "undefined") return;
  if (userId) window.localStorage.setItem(SCOPE_KEY, userId);
  else window.localStorage.removeItem(SCOPE_KEY);
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

/** Clears sensitive session-scoped values on sign-out. Mined vaults stay on disk. */
export function clearUserScopedLocalData(): void {
  if (typeof window === "undefined") return;
  const drop: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const k = window.localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("sb-") || k.startsWith("evermind.session") || k === SCOPE_KEY) drop.push(k);
  }
  drop.forEach((k) => window.localStorage.removeItem(k));
  window.sessionStorage.clear();
}
