/**
 * Client-side credential picker. Every API call the app makes carries the
 * user's own AI access: first a healthy Gemini key from their device vault,
 * otherwise their Google sign-in token. Nothing ever rides on shared platform
 * credit.
 */
import { loadApiKeys } from "@/lib/keystore";
import { getGeminiAccessToken } from "@/lib/google-gemini-auth";

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

/** The Google session token, when the user signed in with the Gemini scope. */
export async function googleToken(): Promise<string | null> {
  try {
    return await getGeminiAccessToken();
  } catch {
    return null;
  }
}

/** Credentials to merge into an API request body. */
export async function credentialPayload(): Promise<{ apiKey?: string; googleToken?: string }> {
  const [key, token] = await Promise.all([bestGeminiKey(), googleToken()]);
  return {
    ...(key ? { apiKey: key } : {}),
    ...(token ? { googleToken: token } : {}),
  };
}

/** True when this browser has any working AI access of its own. */
export async function hasAnyCredential(): Promise<boolean> {
  const [key, token] = await Promise.all([bestGeminiKey(), googleToken()]);
  return !!(key || token);
}
