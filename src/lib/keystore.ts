import { idbGet, idbSet, idbDelete, STORES } from "./store";

const KEY_ID = "gemini-api-key";

export async function saveApiKey(key: string): Promise<void> {
  await idbSet(STORES.SETTINGS, KEY_ID, key);
}

export async function loadApiKey(): Promise<string | null> {
  return await idbGet<string>(STORES.SETTINGS, KEY_ID);
}

export async function clearApiKey(): Promise<void> {
  await idbDelete(STORES.SETTINGS, KEY_ID);
}
