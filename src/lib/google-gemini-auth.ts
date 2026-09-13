/**
 * Detects whether the current Evermind account was authenticated with Google.
 * This token is never used for Gemini API calls: Google sign-in and a Gemini
 * developer API key are separate permissions.
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

/** True when the current Evermind session came from Google sign-in. */
export async function hasGeminiOauth(): Promise<boolean> {
  return (await getGeminiAccessToken()) !== null;
}

export function clearGeminiTokenCache(): void {
  cachedToken = null;
}
