/**
 * Zero-key Gemini access via Google OAuth.
 *
 * When a creator signs in with Google we request the Gemini API scope, so the
 * returned Google access token (stored by Supabase as `provider_token` on the
 * session) can call the Gemini API directly — no manual API key, nothing to
 * copy-paste, nothing for the creator to maintain. API keys remain only as a
 * legacy fallback for accounts that signed in another way.
 */
import { supabase } from "@/integrations/supabase/client";

/** Google OAuth scope that authorizes calls to the Gemini API on the user's own free tier. */
export const GEMINI_SCOPE = "https://www.googleapis.com/auth/generativelanguage.retriever";

let cachedToken: string | null = null;

if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedToken = session?.provider_token ?? null;
  });
}

/** Returns the Google access token from the active session, if the user signed in with Google. */
export async function getGeminiAccessToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const { data } = await supabase.auth.getSession();
  cachedToken = data.session?.provider_token ?? null;
  return cachedToken;
}

/** True when the current session can call Gemini without any API key. */
export async function hasGeminiOauth(): Promise<boolean> {
  return (await getGeminiAccessToken()) !== null;
}

export function clearGeminiTokenCache(): void {
  cachedToken = null;
}
