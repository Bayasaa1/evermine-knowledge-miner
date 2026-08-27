/**
 * Browser fetch helper that attaches the signed-in user's Supabase bearer
 * token. The paid AI endpoints reject anonymous callers, so every client call
 * to /api/* must go through here.
 */
import { supabase } from "@/integrations/supabase/client";

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  } catch {
    /* unauthenticated — the endpoint will answer 401 */
  }
  return fetch(path, { ...init, headers });
}
