/**
 * Client-side credential picker. Every API call the app makes carries the
 * user's own AI access from their device vault. Google sign-in authenticates
 * the Evermind account; it does not grant Gemini API access.
 *
 * When a Gemini key runs out of free quota the picker moves to the next
 * Gemini key automatically. Paid providers are only used when the creator
 * switched them on and their monthly cap still allows it — money is never
 * spent silently.
 */
import { loadApiKeys, saveApiKeys, todayStamp, type ApiKeyEntry } from "@/lib/keystore";

function isFresh(k: ApiKeyEntry): boolean {
  return k.state === "ok" || (k.state === "exhausted" && isNextDay(k.exhaustedAt));
}

/** The highest-ranked healthy Gemini key in the signed-in account's vault. */
export async function bestGeminiKey(): Promise<string | null> {
  try {
    return (await geminiKeyChain())[0]?.value ?? null;
  } catch {
    return null;
  }
}

/** Every healthy Gemini key, in the creator's chosen fallback order. */
export async function geminiKeyChain(): Promise<ApiKeyEntry[]> {
  try {
    return (await loadApiKeys())
      .filter(isFresh)
      .sort((a, b) => (a.rank ?? 9000) - (b.rank ?? 9000) || a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

function isNextDay(exhaustedAt?: number): boolean {
  if (!exhaustedAt) return false;
  const reset = new Date(exhaustedAt);
  reset.setUTCHours(24, 0, 0, 0); // Gemini's free tier resets at Pacific midnight ≈ next UTC day boundary-ish
  return Date.now() > reset.getTime();
}

/** Counts one call against a Gemini key so the key list can show today's usage. */
export async function recordKeyUse(keyValue: string): Promise<void> {
  try {
    const keys = await loadApiKeys();
    const today = todayStamp();
    const next = keys.map((k) =>
      k.value === keyValue
        ? { ...k, usage: { day: today, calls: (k.usage?.day === today ? k.usage.calls : 0) + 1 } }
        : k,
    );
    await saveApiKeys(next);
  } catch {
    /* usage counting is cosmetic, never a blocker */
  }
}

/** Marks a Gemini key as out of free quota so the next call uses the next key. */
export async function markKeyExhausted(keyValue: string): Promise<void> {
  try {
    const keys = await loadApiKeys();
    await saveApiKeys(
      keys.map((k) =>
        k.value === keyValue ? { ...k, state: "exhausted" as const, lastStatus: "limited" as const, exhaustedAt: Date.now() } : k,
      ),
    );
  } catch {
    /* ignore */
  }
}

/** Credentials to merge into an API request body. */
export async function credentialPayload(): Promise<{ apiKey?: string }> {
  const key = await bestGeminiKey();
  if (key) void recordKeyUse(key);
  return key ? { apiKey: key } : {};
}

/** True when this browser has any working AI access of its own. */
export async function hasAnyCredential(): Promise<boolean> {
  return !!(await bestGeminiKey());
}

/**
 * The credentials to try for one job, in the creator's own order: #1 first,
 * then #2 and so on. A Gemini key that is out of quota, or a paid key that is
 * switched off or over its cap, is skipped and the next one takes over.
 */
export async function credentialChain(): Promise<{ provider: string; keyField: string; apiKey: string }[]> {
  try {
    const { rankedCredentials } = await import("@/lib/key-manager");
    const fresh = new Set((await geminiKeyChain()).map((k) => k.value));
    const chain = await rankedCredentials();
    const usable = chain.filter((c) => c.provider !== "gemini" || fresh.has(c.apiKey));
    if (usable.length) return usable.map(({ provider, keyField, apiKey }) => ({ provider, keyField, apiKey }));
  } catch {
    /* provider stack unavailable — fall back to the Gemini chain below */
  }
  return (await geminiKeyChain()).map((k) => ({
    provider: "gemini",
    keyField: "GEMINI_API_KEY",
    apiKey: k.value,
  }));
}
