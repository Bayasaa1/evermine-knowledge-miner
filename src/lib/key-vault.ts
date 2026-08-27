/**
 * Central teardown for every device-local API key vault.
 *
 * Called on sign-out and on account switch so a second account on the same
 * browser can never inherit the previous account's keys, tokens or engine stack.
 */
import { clearApiKey, purgeLegacyApiKeys } from "./keystore";
import { clearStack, purgeLegacyStack } from "./engines";
import { clearGeminiTokenCache } from "./google-gemini-auth";

/** Wipes the currently scoped account's keys plus all in-memory token caches. */
export async function clearActiveKeyVault(): Promise<void> {
  clearGeminiTokenCache();
  await Promise.all([clearApiKey(), clearStack()]);
}

/** Drops in-memory caches only — used when the active account changes. */
export function resetKeyCaches(): void {
  clearGeminiTokenCache();
}

/** Removes the old shared (un-scoped) vaults left by earlier versions of the app. */
export async function purgeLegacyKeyVaults(): Promise<void> {
  await Promise.all([purgeLegacyApiKeys(), purgeLegacyStack()]);
}
