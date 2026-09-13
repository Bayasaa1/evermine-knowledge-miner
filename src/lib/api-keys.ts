/**
 * Client-side credential picker. Every API call the app makes carries the
 * user's own AI access from their device vault. Google sign-in authenticates
 * the Evermind account; it does not grant Gemini API access.
 */
import { loadApiKeys } from "@/lib/keystore";

/** First healthy Gemini key in the signed-in account's vault, if any. */
export async function bestGeminiKey(): Promise<string | null> {
  try {
    const keys = await loadApiKeys();
    const fresh = keys.filter((k) => k.state === "ok" || (k.state === "exhausted" && isNextDay(k.exhaustedAt)));
    return fresh[0]?.value ?? null;
  } catch {
    return null;
  }
}

function isNextDay(exhaustedAt?: number): boolean {
  if (!exhaustedAt) return false;
  const reset = new Date(exhaustedAt);
  reset.setUTCHours(24, 0, 0, 0); // Gemini's free tier resets at Pacific midnight ≈ next UTC day boundary-ish
  return Date.now() > reset.getTime();
}

/** Credentials to merge into an API request body. */
export async function credentialPayload(): Promise<{ apiKey?: string }> {
  const key = await bestGeminiKey();
  return key ? { apiKey: key } : {};
}

/** True when this browser has any working AI access of its own. */
export async function hasAnyCredential(): Promise<boolean> {
  return !!(await bestGeminiKey());
}
