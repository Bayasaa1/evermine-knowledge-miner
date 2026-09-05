import { idbGet, idbSet, idbDelete, STORES } from "./store";
import { scopedKey, whenScopeReady } from "./user-scope";

// API keys are stored per signed-in account. Switching accounts switches vaults;
// no account ever reads another's keys.
const KEY_ID = () => scopedKey("gemini-api-key");
const KEYS_ID = () => scopedKey("gemini-api-keys");
const LEGACY_KEY_ID = "gemini-api-key";
const LEGACY_KEYS_ID = "gemini-api-keys";

export type ApiKeyEntry = {
  id: string;
  /** The raw Gemini API key — never leaves this device. */
  value: string;
  label: string;
  /** "ok" | "invalid" | "exhausted" (429 / quota) */
  state: "ok" | "invalid" | "exhausted";
  /** Epoch ms when the key hit its quota, so the UI can show a cooldown. */
  exhaustedAt?: number;
};

export function maskKey(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function makeKeyEntry(value: string, label?: string): ApiKeyEntry {
  return {
    id: `k_${Math.random().toString(36).slice(2, 10)}`,
    value: value.trim(),
    label: label?.trim() || maskKey(value.trim()),
    state: "ok",
  };
}

function normalize(raw: unknown): ApiKeyEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((k) => {
      const e = (k ?? {}) as Record<string, unknown>;
      const value = typeof e['value'] === "string" ? e['value'].trim() : "";
      if (!value) return null;
      const state = e['state'];
      return {
        id: typeof e['id'] === "string" ? e['id'] : `k_${Math.random().toString(36).slice(2, 10)}`,
        value,
        label: typeof e['label'] === "string" && e['label'] ? e['label'] : maskKey(value),
        state: state === "invalid" || state === "exhausted" ? state : "ok",
        ...(typeof e['exhaustedAt'] === "number" ? { exhaustedAt: e['exhaustedAt'] } : {}),
      } as ApiKeyEntry;
    })
    .filter((k): k is ApiKeyEntry => k !== null);
}

/** Loads the signed-in account's key pool. Never falls back to another account's keys. */
export async function loadApiKeys(): Promise<ApiKeyEntry[]> {
  await whenScopeReady();
  const list = normalize(await idbGet<unknown>(STORES.SETTINGS, KEYS_ID()));
  if (list.length > 0) return list;
  const legacy = await idbGet<string>(STORES.SETTINGS, KEY_ID());
  if (legacy) {
    const migrated = [makeKeyEntry(legacy, "Key 1")];
    await saveApiKeys(migrated);
    return migrated;
  }
  return [];
}

export async function saveApiKeys(keys: ApiKeyEntry[]): Promise<void> {
  await whenScopeReady();
  await idbSet(STORES.SETTINGS, KEYS_ID(), keys);
  await idbSet(STORES.SETTINGS, KEY_ID(), keys[0]?.value ?? "");
}

export async function saveApiKey(key: string): Promise<void> {
  await whenScopeReady();
  await idbSet(STORES.SETTINGS, KEY_ID(), key);
}

export async function loadApiKey(): Promise<string | null> {
  await whenScopeReady();
  return await idbGet<string>(STORES.SETTINGS, KEY_ID());
}

export async function clearApiKey(): Promise<void> {
  await idbDelete(STORES.SETTINGS, KEY_ID());
  await idbDelete(STORES.SETTINGS, KEYS_ID());
}

/** Purges the pre-isolation shared key records that leaked across accounts. */
export async function purgeLegacyApiKeys(): Promise<void> {
  await idbDelete(STORES.SETTINGS, LEGACY_KEY_ID);
  await idbDelete(STORES.SETTINGS, LEGACY_KEYS_ID);
}
