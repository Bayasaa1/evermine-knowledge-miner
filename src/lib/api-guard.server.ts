/**
 * Server-only guard for the paid AI endpoints.
 *
 * Every route that spends platform AI credits must (a) prove the caller is a
 * signed-in Evermind user and (b) stay inside a per-user request budget, so a
 * scripted caller cannot drain the shared AI balance.
 */
import { createClient } from "@supabase/supabase-js";

export type ApiUser = { userId: string };

const WINDOW_MS = 60_000;
/** Requests allowed per user per minute, per endpoint. */
const DEFAULT_LIMIT = 20;

const buckets = new Map<string, number[]>();

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Best-effort per-user sliding window. Returns a 429 Response when exceeded. */
export function rateLimit(scope: string, userId: string, limit = DEFAULT_LIMIT): Response | null {
  const now = Date.now();
  const key = `${scope}:${userId}`;
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return jsonError("Too many requests — please slow down and try again in a minute.", 429);
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
  return null;
}

/**
 * Validates the request's Supabase bearer token and rejects banned accounts.
 * Returns the user on success, or a Response to return straight to the caller.
 */
export async function requireApiUser(request: Request): Promise<ApiUser | Response> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return jsonError("Authentication is not configured", 500);

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.split(".").length !== 3) {
    return jsonError("Sign in to use this feature.", 401);
  }

  // User-scoped client: every query runs as the caller, so RLS applies.
  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return jsonError("Sign in to use this feature.", 401);

  const { data: banned } = await supabase.rpc("is_banned", { _user_id: userId });
  if (banned) return jsonError("This account has been suspended.", 403);
  return { userId };
}

/**
 * Ban enforcement for createServerFn handlers that already went through
 * requireSupabaseAuth. Throws when the account is suspended.
 */
export async function assertNotBanned(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> },
  userId: string,
): Promise<void> {
  const { data } = await supabase.rpc("is_banned", { _user_id: userId });
  if (data) throw new Error("This account has been suspended.");
}

/** Auth + rate limit in one call. Returns a Response when the request must stop. */
export async function guardApi(
  request: Request,
  scope: string,
  limit?: number,
): Promise<ApiUser | Response> {
  const user = await requireApiUser(request);
  if (user instanceof Response) return user;
  const limited = rateLimit(scope, user.userId, limit);
  return limited ?? user;
}
