/**
 * Per-user AI access — the one place every server-side AI call gets its
 * credentials from. Nothing here ever touches the platform's shared AI
 * account: a request runs on the signed-in user's own Gemini key.
 *
 * Resolution order for a request:
 *   1. a key the caller sent with the request (their device vault), or the
 *      key they saved on their account (used by background jobs too)
 *   2. nothing → a typed `no_credential` error the UI turns into the
 *      "paste your free Gemini key" card
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AiRole } from "@/lib/ai-roles";
import { GEMINI_DEFAULT_MODEL, GEMINI_PAID_MODEL } from "@/lib/gemini-models";

export type AiCredential = { kind: "gemini_key"; value: string };

export type AiErrorCode = "no_credential" | "quota" | "rate_minute" | "unsupported_task" | "model_unavailable";

export class UserAiError extends Error {
  code: AiErrorCode;
  httpStatus: number;
  /** Seconds Gemini suggests waiting before a retry (per-minute 429s only). */
  retryAfterSec: number;
  constructor(code: AiErrorCode, message: string, httpStatus = 400, retryAfterSec = 0) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfterSec = retryAfterSec;
  }
}

const NO_CREDENTIAL =
  "This job has no working AI key yet. Open the API Manager and add or enable a key for it.";

/** Creates a request-scoped client that acts as the bearer-token caller (RLS as them). */
export function callerClient(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

const clean = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * The engine the user picked for one job ("who runs what"), or null when they
 * left it on automatic.
 */
export async function roleChoice(
  userId: string,
  role: AiRole,
): Promise<{ provider: string; keyTail: string | null; keyId: string | null; autoFallback: boolean } | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_ai_roles")
      .select("provider, key_tail, key_id, auto_fallback")
      .eq("user_id", userId)
      .eq("role", role)
      .maybeSingle();
    if (!data?.provider) return null;
    return { provider: data.provider, keyTail: data.key_tail ?? null, keyId: data.key_id ?? null, autoFallback: data.auto_fallback ?? true };
  } catch {
    return null;
  }
}

/** Every saved key for one provider, newest first. */
async function savedKeys(userId: string, provider: string): Promise<string[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_ai_keys")
      .select("api_key")
      .eq("user_id", userId)
      .eq("provider", provider)
      .order("updated_at", { ascending: false });
    return ((data ?? []) as { api_key: string }[]).map((r) => clean(r.api_key)).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Why the engine the user picked for a job could not be used this time, so the
 * app can say so in plain words instead of silently reporting whichever other
 * key answered last.
 */
export type SkippedAssigned = {
  provider: string;
  tail: string;
  /** "resting" = cooling down / limit reached, "rejected" = the provider refused the key. */
  reason: "resting" | "rejected" | "capped" | "off";
  until: string | null;
};

export type ResolvedUserKey = {
  id: string;
  provider: string;
  apiKey: string;
  tail: string;
  model: string | null;
  endpoint: string | null;
  autoFallback: boolean;
  /** Set when this is NOT the key the user picked for the job. */
  skippedAssigned?: SkippedAssigned;
};

/** One authoritative resolver used by every AI job. It can only return this user's enabled account keys. */
export async function resolveUserAiKey(userId: string, role: AiRole, skipIds: string[] = []): Promise<ResolvedUserKey> {
  const { ROLE_PROVIDERS } = await import("@/lib/ai-roles");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const choice = await roleChoice(userId, role);
  const allowed = ROLE_PROVIDERS[role];
  const now = new Date().toISOString();
  const query = supabaseAdmin
    .from("user_ai_keys")
    .select("id, provider, api_key, model, endpoint, cost_kind, monthly_limit_usd, spend_usd, enabled, status, cooldown_until, rank, updated_at")
    .eq("user_id", userId)
    .eq("enabled", true)
    .in("provider", allowed)
    .order("rank", { ascending: true })
    .order("updated_at", { ascending: false });
  const { data } = await query;
  // Self-heal: an "exhausted" key whose cooldown has passed is usable again.
  // Also heals rests longer than 20 min left by the old one-hour rule.
  const maxRest = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const healIds = (data ?? [])
    .filter((r) => r.status === "exhausted" && (!r.cooldown_until || r.cooldown_until <= now || r.cooldown_until > maxRest))
    .map((r) => r.id);
  if (healIds.length) {
    await supabaseAdmin.from("user_ai_keys").update({ status: "ok", cooldown_until: null }).in("id", healIds);
  }
  const rows = (data ?? []).map((r) => (healIds.includes(r.id) ? { ...r, status: "ok", cooldown_until: null } : r));
  const unusableReason = (row: (typeof rows)[number]): SkippedAssigned["reason"] | null => {
    if (row.cooldown_until && row.cooldown_until > now) return row.status === "invalid" ? "rejected" : "resting";
    if (row.cost_kind === "paid" && Number(row.monthly_limit_usd) <= Number(row.spend_usd)) return "capped";
    return null;
  };
  // Teams: a job with its own ordered team tries those keys first, in that
  // order (e.g. free Gemini first, then the paid account). When every team key
  // is resting or out of quota, the job still falls back to the account's other
  // compatible keys instead of stopping — unless the user marked the team
  // "only these keys" (exclusive). Keys that another job keeps for itself are
  // never borrowed by automatic picks.
  const { data: roleRows } = await supabaseAdmin
    .from("user_ai_roles")
    .select("role, team_key_ids, exclusive")
    .eq("user_id", userId);
  const roleRow = (roleRows ?? []).find((r) => r.role === role);
  const team = (roleRow?.team_key_ids ?? []) as string[];
  const reserved = new Set(
    (roleRows ?? []).filter((r) => r.role !== role && r.exclusive).flatMap((r) => (r.team_key_ids ?? []) as string[]),
  );
  const teamKeys = team.map((id) => rows.find((row) => row.id === id)).filter((row): row is (typeof rows)[number] => !!row);
  const spareKeys = rows.filter((row) => !reserved.has(row.id) && !team.includes(row.id));
  // "Only for this job" keeps OTHER jobs out of these keys. It must never mean
  // the job itself stops while the account still has a healthy spare: when
  // every key of an exclusive team is resting, the spares take over.
  const teamHealthy = teamKeys.some(
    (row) => !skipIds.includes(row.id) && row.status !== "invalid" && row.status !== "exhausted" && unusableReason(row) === null,
  );
  const pool = team.length
    ? roleRow?.exclusive && !teamHealthy
      ? [...teamKeys, ...spareKeys]
      : roleRow?.exclusive
        ? teamKeys
        : [...teamKeys, ...spareKeys]
    : spareKeys;
  const free = pool.filter((row) => !skipIds.includes(row.id) && unusableReason(row) === null);
  // A key that once failed but has no rest time left is not binned: it simply
  // goes to the back of the queue, so a good key is always tried first and a
  // recovered one can still be used instead of nothing.
  const usable = [
    ...free.filter((row) => row.status !== "invalid" && row.status !== "exhausted"),
    ...free.filter((row) => row.status === "invalid" || row.status === "exhausted"),
  ];
  // The row the user actually picked for this job, usable or not.
  const wanted = (team.length ? pool[0] : null)
    ?? (choice?.keyId ? rows.find((row) => row.id === choice.keyId) : null)
    ?? (choice?.keyTail ? rows.find((row) => row.provider === choice.provider && row.api_key.endsWith(choice.keyTail ?? "")) : null)
    ?? null;
  const wantedHealthy = wanted && !skipIds.includes(wanted.id) && wanted.status !== "invalid" && wanted.status !== "exhausted" && unusableReason(wanted) === null;
  // Respect the user's exact assignment while it is healthy. When they have
  // explicitly enabled automatic fallback (or built a team), move down the
  // list instead of calling a key already marked out.
  const selected = (wantedHealthy ? wanted : null)
    ?? ((!choice || choice.autoFallback || team.length > 1) ? usable[0] : (skipIds.includes(wanted?.id ?? "") ? undefined : wanted));
  if (!selected) throw new UserAiError("no_credential", NO_CREDENTIAL);
  const skippedAssigned: SkippedAssigned | null =
    wanted && wanted.id !== selected.id
      ? {
          provider: wanted.provider,
          tail: wanted.api_key.slice(-4),
          reason: unusableReason(wanted) ?? "off",
          until: wanted.cooldown_until ?? null,
        }
      : null;
  return {
    id: selected.id,
    provider: selected.provider,
    apiKey: selected.api_key,
    tail: selected.api_key.slice(-4),
    model: selected.model,
    endpoint: selected.endpoint,
    autoFallback: team.length > 1 || (choice?.autoFallback ?? true),
    ...(skippedAssigned ? { skippedAssigned } : {}),
  };
}

async function markKeyUnavailable(keyId: string, status: "ok" | "exhausted" | "invalid", cooldownUntil: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("user_ai_keys").update({ status, cooldown_until: cooldownUntil }).eq("id", keyId);
}

/**
 * Runs a Gemini-only job on the user's Mining/vision assignment and moves to
 * the next saved Gemini key when the provider reports a real limit. The role's
 * automatic-switch setting remains authoritative.
 */
/**
 * The Gemini keys that can take a parallel mining lane, in the creator's order:
 * the Mining team when one is set, else every healthy Gemini key not kept for
 * another job.
 */
export async function geminiLaneKeyIds(userId: string, role: AiRole = "mine"): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { data: keys } = await supabaseAdmin
    .from("user_ai_keys")
    .select("id, status, cooldown_until, rank, updated_at")
    .eq("user_id", userId)
    .eq("enabled", true)
    .eq("provider", "gemini")
    .order("rank", { ascending: true })
    .order("updated_at", { ascending: false });
  const healthy = (keys ?? []).filter(
    (k) => k.status !== "invalid" && !(k.cooldown_until && k.cooldown_until > now),
  );
  const { data: roleRows } = await supabaseAdmin
    .from("user_ai_roles")
    .select("role, team_key_ids, exclusive")
    .eq("user_id", userId);
  const roleRow = (roleRows ?? []).find((r) => r.role === role);
  const team = (roleRow?.team_key_ids ?? []) as string[];
  const reserved = new Set(
    (roleRows ?? []).filter((r) => r.role !== role && r.exclusive).flatMap((r) => (r.team_key_ids ?? []) as string[]),
  );
  const spares = healthy.filter((k) => !reserved.has(k.id) && !team.includes(k.id)).map((k) => k.id);
  if (team.length) {
    const teamHealthy = team.filter((id) => healthy.some((k) => k.id === id));
    // An exclusive team keeps its lanes to itself; otherwise spare healthy
    // keys can take a lane too, so a one-key team never means one lane.
    return roleRow?.exclusive ? teamHealthy : [...teamHealthy, ...spares];
  }
  return spares;
}

export async function runGeminiRoleWithFallback<T>(
  userId: string,
  role: "mine" | "face_clone",
  run: (credential: AiCredential, key: ResolvedUserKey) => Promise<T>,
  /** Parallel mining lane: lane N starts on the Nth Gemini key, then falls back as usual. */
  lane?: number,
): Promise<{ value: T; key: ResolvedUserKey }> {
  const skipped: string[] = [];
  let lastError: unknown = new UserAiError("no_credential", NO_CREDENTIAL);
  if (lane !== undefined && lane > 0) {
    const ids = await geminiLaneKeyIds(userId, role).catch(() => [] as string[]);
    const preferred = ids.length > 1 ? ids[lane % ids.length] : undefined;
    if (preferred) {
      try {
        const key = await resolveUserAiKey(userId, role, ids.filter((id) => id !== preferred));
        if (key.id === preferred && key.provider === "gemini") {
          try {
            const value = await run({ kind: "gemini_key", value: key.apiKey }, key);
            await markKeyUnavailable(key.id, "ok", null);
            return { value, key };
          } catch (error) {
            if (!isLimitError(error)) throw error;
            lastError = error;
            const rest = limitCooldown(error);
            await markKeyUnavailable(key.id, rest.status, rest.until);
            skipped.push(key.id);
          }
        }
      } catch (error) {
        if (!(error instanceof UserAiError && error.code === "no_credential")) throw error;
      }
    }
  }
  for (;;) {
    let key: ResolvedUserKey;
    try {
      key = await resolveUserAiKey(userId, role, skipped);
    } catch {
      throw lastError;
    }
    if (key.provider !== "gemini") {
      skipped.push(key.id);
      continue;
    }
    try {
      const value = await run({ kind: "gemini_key", value: key.apiKey }, key);
      await markKeyUnavailable(key.id, "ok", null);
      return { value, key };
    } catch (error) {
      lastError = error;
      if (!isLimitError(error)) throw error;
      const rest = limitCooldown(error);
      await markKeyUnavailable(key.id, rest.status, rest.until);
      skipped.push(key.id);
      if (!key.autoFallback) throw error;
    }
  }
}

/** Returns the key explicitly assigned to a role, even when it is cooling down. */
async function assignedUserAiKey(userId: string, role: AiRole): Promise<ResolvedUserKey | null> {
  const choice = await roleChoice(userId, role);
  if (!choice?.keyId) return null;
  const { ROLE_PROVIDERS } = await import("@/lib/ai-roles");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_ai_keys")
    .select("id, provider, api_key, model, endpoint, enabled")
    .eq("user_id", userId)
    .eq("id", choice.keyId)
    .maybeSingle();
  if (!data?.enabled || !ROLE_PROVIDERS[role].includes(data.provider)) return null;
  return {
    id: data.id,
    provider: data.provider,
    apiKey: data.api_key,
    tail: data.api_key.slice(-4),
    model: data.model,
    endpoint: data.endpoint,
    autoFallback: choice.autoFallback,
  };
}

/**
 * True when the provider said the key itself is wrong (not a limit).
 * 403 is deliberately excluded: providers also use it for model access,
 * region and policy refusals, which say nothing about the key.
 */
function isRejectedKeyError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  return /http 401|invalid api key|invalid_api_key|unauthorized/.test(msg);
}

function isLimitError(error: unknown): boolean {
  return error instanceof UserAiError && (error.code === "quota" || error.code === "rate_minute")
    || error instanceof GeminiHttpError && (error.status === 402 || error.status === 429 || isBusyError(error));
}

/** Gemini "high demand" 503 / 500: the key is fine, the model is momentarily busy. */
function isBusyError(error: unknown): boolean {
  return error instanceof GeminiHttpError && (error.status === 503 || error.status === 500);
}

/** Short rest for a busy key, an hour for a used-up one. */
function limitCooldown(error: unknown): { status: "ok" | "exhausted"; until: string } {
  if (isBusyError(error)) return { status: "ok", until: new Date(Date.now() + 3 * 60 * 1000).toISOString() };
  const minute = error instanceof UserAiError && error.code === "rate_minute";
  if (minute) {
    const ms = Math.max(20, (error as UserAiError).retryAfterSec) * 1000;
    return { status: "ok", until: new Date(Date.now() + ms).toISOString() };
  }
  // Free-tier Gemini 429s are almost always per-minute bursts, not a used-up
  // day: rest briefly and stay "ok" so the key is never shown as dead.
  if (error instanceof GeminiHttpError && error.status === 429) {
    return { status: "ok", until: new Date(Date.now() + 2 * 60 * 1000).toISOString() };
  }
  return { status: "exhausted", until: new Date(Date.now() + 20 * 60 * 1000).toISOString() };
}

type RoleTextRun = { text: string; inputTokens: number; outputTokens: number };
export type RoleTextMessage = { role: "user" | "assistant"; content: string };

type ProviderModelList = { data?: { id?: string }[]; models?: { id?: string; name?: string }[] };

const MODEL_PREFERENCES: Record<string, RegExp[]> = {
  groq: [/gpt-oss-120b/i, /llama-3\.3-70b/i, /llama.*instant/i],
  mistral: [/mistral-small/i, /ministral/i, /mistral-medium/i],
  cerebras: [/gpt-oss-120b/i, /llama-3\.3-70b/i, /llama.*8b/i],
  together: [/llama-3\.3-70b.*free/i, /llama-3\.3-70b/i, /qwen.*instruct/i, /instruct/i],
  github: [/gpt-4o-mini/i, /gpt-4\.1-mini/i, /phi-4/i],
  openrouter: [/:free$/i, /llama.*instruct/i, /qwen.*instruct/i],
  openai: [/gpt-4o-mini/i, /gpt-4\.1-mini/i],
  moonshot: [/kimi.*preview/i, /kimi/i],
  deepseek: [/deepseek-chat/i],
  xai: [/grok.*mini/i, /grok/i],
  perplexity: [/sonar/i],
  cohere: [/command.*r/i],
};

function chooseAvailableModel(provider: string, configured: string | null, ids: string[]): string | null {
  const usable = ids.filter((id) => id && !/embed|rerank|whisper|speech|audio|image|moderation/i.test(id));
  if (configured && usable.includes(configured)) return configured;
  for (const preference of MODEL_PREFERENCES[provider] ?? []) {
    const match = usable.find((id) => preference.test(id));
    if (match) return match;
  }
  return usable[0] ?? null;
}

/** Uses the provider's live model list, so retired model names cannot break a valid saved key. */
async function liveProviderModel(resolved: ResolvedUserKey, base: string, fallback: string): Promise<string> {
  try {
    const response = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${resolved.apiKey}` },
    });
    if (!response.ok) return resolved.model || fallback;
    const body = await response.json() as ProviderModelList;
    const ids = [
      ...(body.data ?? []).map((row) => row.id ?? ""),
      ...(body.models ?? []).map((row) => row.id ?? row.name ?? ""),
    ].filter(Boolean);
    return chooseAvailableModel(resolved.provider, resolved.model, ids) ?? resolved.model ?? fallback;
  } catch {
    return resolved.model || fallback;
  }
}

/** Turns a provider failure into a short sentence a person can act on. */
async function errorDetail(res: Response): Promise<string> {
  const raw = (await res.text().catch(() => "")).slice(0, 400);
  let message = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    const inner = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    message = inner ?? parsed.message ?? raw;
  } catch {
    /* keep the bounded raw text */
  }
  return `HTTP ${res.status} — ${message || "no details returned"}`;
}

async function generateRoleTextOnce(opts: {
  resolved: ResolvedUserKey;
  system: string;
  prompt: string;
  messages?: RoleTextMessage[];
  json?: boolean;
  maxTokens?: number;
  model?: string;
  disableThinking?: boolean;
}): Promise<RoleTextRun> {
  const { readUsageTokens } = await import("@/lib/ai-usage.server");
  const resolved = opts.resolved;
  if (resolved.provider === "gemini") {
    let tokens = { inputTokens: 0, outputTokens: 0 };
    const text = await geminiGenerate({
      credential: { kind: "gemini_key", value: resolved.apiKey },
      ...(opts.model ? { model: opts.model } : {}),
      system: opts.system,
      turns: (opts.messages?.length ? opts.messages : [{ role: "user" as const, content: opts.prompt }]).map((message) => ({
        role: message.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: message.content }],
      })),
      onTokens: (t) => { tokens = t; },
      ...(opts.json != null ? { json: opts.json } : {}),
      ...(opts.maxTokens != null ? { maxTokens: opts.maxTokens } : {}),
      ...(opts.disableThinking ? { disableThinking: true } : {}),
    });
    return { text, ...tokens };
  }
  if (resolved.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": resolved.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: resolved.model || "claude-3-5-haiku-latest", max_tokens: opts.maxTokens ?? 2048, system: opts.system, messages: opts.messages?.length ? opts.messages : [{ role: "user", content: opts.prompt }] }),
    });
    if (!res.ok) throw new GeminiHttpError(res.status, `Claude: ${await errorDetail(res)}`);
    const body = await res.json() as { content?: { text?: string }[] };
    return { text: (body.content ?? []).map((part) => part.text ?? "").join(""), ...readUsageTokens(body) };
  }
  const config = OPENAI_COMPATIBLE[resolved.provider];
  const base = (resolved.endpoint || config?.base || "").replace(/\/+$/, "");
  if (!base) throw new UserAiError("unsupported_task", "This AI has no valid connection address.");
  const model = await liveProviderModel(resolved, base, config?.model ?? "");
  if (!model) throw new UserAiError("unsupported_task", "This AI account did not return a usable text model.");
  // Free community models usually cap well below the Gemini-sized budgets the
  // callers ask for, and an oversized cap is rejected outright.
  const cap = Math.min(opts.maxTokens ?? 2048, 4096);
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolved.apiKey}` },
    // Some real jobs return a JSON array (translation), while OpenAI-compatible
    // json_object mode only permits an object. The system prompt still demands
    // JSON; omitting response_format keeps every compatible provider usable.
    body: JSON.stringify({ model, max_tokens: cap, messages: [{ role: "system", content: opts.system }, ...(opts.messages?.length ? opts.messages : [{ role: "user" as const, content: opts.prompt }])] }),
  });
  if (!res.ok) throw new GeminiHttpError(res.status, `${resolved.provider}: ${await errorDetail(res)}`);
  const body = await res.json() as {
    choices?: { message?: { content?: string | { text?: string }[]; reasoning_content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  const text = typeof content === "string"
    ? content
    : (content ?? []).map((part) => part.text ?? "").join("");
  return { text: text.trim(), ...readUsageTokens(body) };
}

const OPENAI_COMPATIBLE: Record<string, { base: string; model: string }> = {
  groq: { base: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  mistral: { base: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  cerebras: { base: "https://api.cerebras.ai/v1", model: "gpt-oss-120b" },
  together: { base: "https://api.together.ai/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free" },
  github: { base: "https://models.github.ai/inference", model: "openai/gpt-4o-mini" },
  openrouter: { base: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free" },
  openai: { base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  moonshot: { base: "https://api.moonshot.ai/v1", model: "kimi-k2-0711-preview" },
  deepseek: { base: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  xai: { base: "https://api.x.ai/v1", model: "grok-3-mini" },
  perplexity: { base: "https://api.perplexity.ai", model: "sonar" },
  cohere: { base: "https://api.cohere.ai/compatibility/v1", model: "command-r7b-12-2024" },
};

/** Text generation using the provider actually assigned to the role. */
export async function generateRoleText(opts: {
  userId: string;
  role: "translate" | "mine_write" | "core_brain" | "chat";
  system: string;
  prompt: string;
  /** Real chat turns. When present, providers receive these as separate messages. */
  messages?: RoleTextMessage[];
  json?: boolean;
  maxTokens?: number;
  /** What this call was for, so the usage history can name it. */
  subjectKind?: "video" | "mind" | "project" | "test" | "other";
  subjectId?: string;
  subjectLabel?: string;
}): Promise<{ text: string; provider: string; tail: string; skippedAssigned?: SkippedAssigned }> {
  const { recordAiUsage } = await import("@/lib/ai-usage.server");
  const log = async (key: ResolvedUserKey, run: RoleTextRun) => {
    await recordAiUsage(
      {
        userId: opts.userId,
        role: opts.role,
        provider: key.provider,
        keyId: key.id,
        keyTail: key.tail,
        model: key.model ?? "",
        subjectKind: opts.subjectKind ?? "other",
        ...(opts.subjectId ? { subjectId: opts.subjectId } : {}),
        ...(opts.subjectLabel ? { subjectLabel: opts.subjectLabel } : {}),
      },
      { inputTokens: run.inputTokens, outputTokens: run.outputTokens },
    );
  };
  const call = (key: ResolvedUserKey) =>
    generateRoleTextOnce({
      resolved: key,
      system: opts.system,
      prompt: opts.prompt,
      ...(opts.messages?.length ? { messages: opts.messages } : {}),
      ...(opts.json != null ? { json: opts.json } : {}),
      ...(opts.maxTokens != null ? { maxTokens: opts.maxTokens } : {}),
      // Translation does not need long internal reasoning. Flash-Lite plus a
      // zero thinking budget is faster and avoids burning thousands of hidden
      // tokens on a short subtitle batch.
      ...(opts.role === "translate" && key.provider === "gemini" ? { model: "gemini-3.1-flash-lite", disableThinking: true } : {}),
    });
  const skipped: string[] = [];
  let lastError: unknown = new UserAiError("no_credential", NO_CREDENTIAL);
  for (;;) {
    let resolved: ResolvedUserKey;
    try {
      resolved = await resolveUserAiKey(opts.userId, opts.role, skipped);
    } catch {
      throw lastError;
    }
    try {
      const run = await call(resolved);
      await log(resolved, run);
      return {
        text: run.text,
        provider: resolved.provider,
        tail: resolved.tail,
        ...(resolved.skippedAssigned ? { skippedAssigned: resolved.skippedAssigned } : {}),
      };
    } catch (error) {
      lastError = error;
      const limit = isLimitError(error);
      await recordAiUsage(
        { userId: opts.userId, role: opts.role, provider: resolved.provider, keyId: resolved.id, keyTail: resolved.tail, subjectKind: opts.subjectKind ?? "other", ...(opts.subjectLabel ? { subjectLabel: opts.subjectLabel } : {}) },
        { status: limit ? "quota" : "error", errorCode: limit ? "limit" : (error instanceof Error ? error.message : "provider error").slice(0, 120) },
      );
      // A key the provider itself rejects is not a temporary problem: park it
      // so every later job skips it instead of losing a round trip each time.
      if (isRejectedKeyError(error)) {
        // Parked for a day, not forever: later jobs skip it, but the key comes
        // back on its own in case the refusal was temporary.
        await markKeyUnavailable(resolved.id, "invalid", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
      }
      if (limit) {
        // A minute burst is not an exhausted key. Briefly cool it down, then
        // let it rejoin the fallback pool automatically. Only daily/provider
        // credit exhaustion receives the persistent exhausted status.
        const minute = error instanceof UserAiError && error.code === "rate_minute";
        const cooldown = minute
          ? new Date(Date.now() + Math.max(20, error.retryAfterSec) * 1000).toISOString()
          : new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await markKeyUnavailable(resolved.id, minute ? "ok" : "exhausted", cooldown);
      }
      skipped.push(resolved.id);
      if (!resolved.autoFallback) throw error;
    }
  }
}

/** Picks the key the user assigned to a job, else the newest one. */
function pickByTail(keys: string[], tail: string | null | undefined): string | null {
  if (!keys.length) return null;
  if (tail) {
    const match = keys.find((k) => k.endsWith(tail));
    if (match) return match;
  }
  return keys[0] ?? null;
}

/**
 * Resolves the caller's Gemini credential.
 * `userId` must come from guardApi/requireSupabaseAuth. `body` may carry
 * `apiKey` (a key from the caller's own vault). With none, the key they
 * assigned to this job in the API Manager is used, else their newest saved key.
 */
export async function resolveGeminiCredential(
  userId: string,
  body?: { apiKey?: unknown },
  role?: AiRole,
): Promise<AiCredential> {
  try {
    if (role) {
      try {
        const resolved = await resolveUserAiKey(userId, role);
        if (resolved.provider === "gemini") return { kind: "gemini_key", value: resolved.apiKey };
      } catch {
        /* no usable key for this role — try the account's own Gemini keys below */
      }
      // This job needs Gemini itself. When the role runs on another engine
      // (Groq, Mistral, OpenRouter…), use the user's own saved Gemini key
      // instead of failing the whole job.
    }
    // A creator may keep several Gemini keys (spares for when one hits its
    // daily quota), so never assume a single row here.
    const keys = await savedKeys(userId, "gemini");
    const choice = role ? await roleChoice(userId, role) : null;
    const saved = pickByTail(keys, choice?.provider === "gemini" ? choice.keyTail : null);
    if (saved) return { kind: "gemini_key", value: saved };
  } catch {
    /* fall through to the clear missing-key error */
  }

  throw new UserAiError("no_credential", NO_CREDENTIAL);
}

/**
 * The provider + key the user assigned to a job when it is not Gemini
 * (currently only chat can run on another engine). Null means "use Gemini".
 */
export async function resolveRoleProviderKey(
  userId: string,
  role: AiRole,
): Promise<{ provider: string; apiKey: string } | null> {
  const resolved = await resolveUserAiKey(userId, role);
  return resolved.provider === "gemini" ? null : { provider: resolved.provider, apiKey: resolved.apiKey };
}

/**
 * The caller's own voice-cloning key, or null when they have not added one.
 * Never falls back to a platform key: with no key the mind simply speaks with
 * the free device voice.
 */
export async function resolveVoiceKey(userId: string): Promise<string | null> {
  try {
    const resolved = await resolveUserAiKey(userId, "voice_clone");
    return resolved.provider === "elevenlabs" ? resolved.apiKey : null;
  } catch {
    return null;
  }
}

/**
 * Which key would actually run a job right now: the assigned one when it still
 * exists, otherwise the newest key of the provider that job uses. Only the last
 * four characters ever leave the server.
 */
export async function roleKeyReport(
  userId: string,
  role: AiRole,
  fallbackProvider: string,
): Promise<{ provider: string; assignedProvider: string | null; assignedTail: string | null; assignedKeyId: string | null; effectiveProvider: string | null; effectiveTail: string | null; missing: boolean }> {
  const choice = await roleChoice(userId, role);
  let resolved: ResolvedUserKey | null = null;
  try {
    resolved = await resolveUserAiKey(userId, role);
  } catch {
    // A report must still render when a role has no usable key.
  }
  const provider = resolved?.provider ?? choice?.provider ?? fallbackProvider;
  const effectiveTail = resolved?.tail ?? null;
  const assignedTail = choice?.keyTail ?? null;
  return {
    provider,
    assignedProvider: choice?.provider ?? null,
    assignedTail,
    assignedKeyId: choice?.keyId ?? null,
    effectiveProvider: resolved?.provider ?? null,
    effectiveTail,
    missing: Boolean(choice?.keyId) && resolved?.id !== choice?.keyId,
  };
}

/** One tiny live call with the key a job would use, so the user can see it work. */
export async function testRoleKey(
  userId: string,
  role: AiRole,
  fallbackProvider: string,
): Promise<{ ok: boolean; message: string; tail: string | null }> {
  const report = await roleKeyReport(userId, role, fallbackProvider);
  const assigned = await assignedUserAiKey(userId, role);
  const resolved = assigned ?? await resolveUserAiKey(userId, role);
  if (!resolved) return { ok: false, message: "No key saved for this job yet.", tail: null };
  const key = resolved.apiKey;

  try {
    if (resolved.provider === "elevenlabs") {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
      return res.ok
        ? { ok: true, message: "Working.", tail: report.effectiveTail }
        : { ok: false, message: `Rejected (${res.status}).`, tail: report.effectiveTail };
    }
    if (role === "translate" || role === "mine_write" || role === "core_brain" || role === "chat") {
      // A role test must prove the selected key itself. It must never report
      // green because automatic fallback quietly reached a different provider.
      const translation = role === "translate";
      const structured = role === "core_brain" || role === "mine_write";
      const tested = await generateRoleTextOnce({
        resolved,
        system: translation
          ? "Translate every item into Korean. Return only a JSON array with the same length and order."
          : structured
            ? "Build a tiny Core Brain record. Return only JSON with keys summary and facts, where facts is an array."
            : "Answer as a helpful Mind using the supplied saved knowledge.",
        prompt: translation
          ? JSON.stringify(["The robot picked up the red cup.", "The next lesson starts tomorrow."])
          : structured
            ? "Saved knowledge: Mina builds small educational robots and teaches safe handling."
            : "Saved knowledge: Mina builds small educational robots. Question: What does Mina build?",
        json: translation || structured,
        maxTokens: 512,
        ...(translation && resolved.provider === "gemini" ? { model: "gemini-3.1-flash-lite", disableThinking: true } : {}),
      });
      let valid = Boolean(tested.text.trim());
      if (translation) {
        try {
          const parsed = JSON.parse(tested.text) as unknown;
          valid = Array.isArray(parsed) && parsed.length === 2 && parsed.some((item) => typeof item === "string" && !["The robot picked up the red cup.", "The next lesson starts tomorrow."].includes(item));
        } catch { valid = false; }
      } else if (structured) {
        try {
          const parsed = JSON.parse(tested.text) as { summary?: unknown; facts?: unknown };
          valid = typeof parsed.summary === "string" && Array.isArray(parsed.facts);
        } catch { valid = false; }
      }
      if (valid) await markKeyUnavailable(resolved.id, "ok", null);
      return valid
        ? { ok: true, message: `Working through ${resolved.provider} ···${resolved.tail}.`, tail: resolved.tail }
        : { ok: false, message: "The engine answered, but its result did not work for this job.", tail: report.effectiveTail };
    }
    if (resolved.provider === "gemini") {
      const tested = await generateRoleTextOnce({ resolved, system: "Return only the word OK.", prompt: "Connection test.", maxTokens: 64 });
      if (!tested.text) return { ok: false, message: "Connected but returned no text.", tail: resolved.tail };
      await markKeyUnavailable(resolved.id, "ok", null);
      return { ok: true, message: `Working through Gemini ···${resolved.tail}.`, tail: resolved.tail };
    }
    return { ok: true, message: "Working.", tail: report.effectiveTail };
  } catch (error) {
    if (error instanceof GeminiHttpError && error.status === 402) {
      await markKeyUnavailable(resolved.id, "exhausted", null);
    }
    // The old generic "could not reach" hid the real reason (wrong model, bad
    // key, quota), which made a broken engine impossible to fix.
    const detail = error instanceof Error ? error.message : "";
    return { ok: false, message: detail ? detail.slice(0, 180) : "Could not reach the engine.", tail: report.effectiveTail };
  }
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function geminiUrl(model: string, method: string, cred: AiCredential): { url: string; headers: HeadersInit } {
  const path = `${GEMINI_BASE}/models/${model}:${method}`;
  return { url: `${path}?key=${encodeURIComponent(cred.value)}`, headers: { "Content-Type": "application/json" } };
}

export class GeminiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseRetryDelaySec(raw: string): number {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s?"/.exec(raw);
  if (!match) return 0;
  return Math.min(60, Math.max(1, Math.ceil(Number(match[1]))));
}

/**
 * A Gemini 429 can be the per-MINUTE burst limit or the per-DAY quota — the
 * quota id in the error body says which. Reporting a minute burst as "daily
 * quota used up" used to scare users into thinking their key was dead.
 */
function classifyGemini429(raw: string): UserAiError {
  const retryAfter = parseRetryDelaySec(raw);
  // RetryInfo means Google expects this request to work shortly. Some payloads
  // list several quota names, including daily ones, so "PerDay" alone used to
  // incorrectly disable a key that successfully answered moments later.
  const isDaily = retryAfter === 0 && /PerDay|per_day|daily/i.test(raw);
  if (isDaily) {
    return new UserAiError(
      "quota",
      "Your free Gemini daily quota is used up. It resets in a few hours (Pacific midnight) — or choose another key in API Manager.",
      429,
    );
  }
  return new UserAiError(
    "rate_minute",
    "Too many requests in one minute for the free Gemini tier. Wait a moment and it will work again — this is not your daily quota.",
    429,
    retryAfter || 20,
  );
}

async function raiseForGemini(res: Response): Promise<never> {
  const raw = await res.text().catch(() => "");
  let detail = raw.slice(0, 400);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    detail = parsed.error?.message ?? detail;
  } catch {
    /* keep the bounded raw text */
  }
  if (res.status === 429) throw classifyGemini429(raw);
  // A retired model is permanent — never retry it, never mark the key bad.
  // geminiGenerate catches this code and moves to the newest free model itself.
  if (res.status === 404 || /no longer available|is not found for api version/i.test(detail)) {
    throw new UserAiError(
      "model_unavailable",
      "Google changed its free Gemini models and no free model answered for this key right now.",
      404,
    );
  }
  if (res.status === 400 && /api key|key not valid|permission/i.test(detail)) {
    throw new UserAiError("no_credential", "That Gemini key was rejected. Add or replace it in API Manager.", 401);
  }
  if (res.status === 401 || res.status === 403) {
    throw new UserAiError("no_credential", "Gemini rejected this key. Add or replace it in API Manager.", 401);
  }
  throw new GeminiHttpError(res.status, detail || `Gemini request failed (${res.status}).`);
}

/**
 * Runs a Gemini call once, and when the answer is a per-MINUTE 429, waits the
 * delay Gemini asked for (capped) and retries exactly once. Daily-quota and
 * credential errors are never retried.
 */
export async function withMinuteRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UserAiError && err.code === "rate_minute") {
      const wait = Math.min(30_000, Math.max(3_000, err.retryAfterSec * 1000));
      await new Promise((r) => setTimeout(r, wait));
      return await fn();
    }
    throw err;
  }
}

export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } }
  | {
      file_data: { file_uri: string };
      video_metadata?: { start_offset?: string; end_offset?: string };
    };

export type GeminiTurn = { role: "user" | "model"; parts: GeminiPart[] };

// ---------- Self-updating free model ----------
// Google retires model names over time. Instead of breaking, the app asks
// Google which models this key can use and picks the newest free Flash-Lite /
// Flash model. Paid models are never picked automatically.
const FREE_MODEL_CACHE = new Map<string, { model: string; at: number }>();
const FREE_MODEL_TTL = 24 * 60 * 60_000;

function isAutoModel(model: string | undefined): boolean {
  return !model || model === GEMINI_DEFAULT_MODEL;
}

function versionOf(name: string): number {
  const m = /gemini-(\d+(?:\.\d+)?)/.exec(name);
  return m ? Number(m[1]) : 0;
}

export async function resolveFreeGeminiModel(apiKey: string, refresh = false): Promise<string> {
  const cached = FREE_MODEL_CACHE.get(apiKey);
  if (!refresh && cached && Date.now() - cached.at < FREE_MODEL_TTL) return cached.model;
  try {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=200&key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) return cached?.model ?? GEMINI_DEFAULT_MODEL;
    const data = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
    const names = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter((n) => /^gemini-[\d.]+-flash/.test(n))
      .filter((n) => !/(tts|image|live|audio|embedding|thinking-exp|native)/i.test(n))
      .filter((n) => n !== GEMINI_PAID_MODEL);
    const failed = refresh ? cached?.model : undefined;
    const usable = names.filter((n) => n !== failed);
    const lite = usable.filter((n) => n.includes("flash-lite"));
    const pool = lite.length ? lite : usable;
    const stable = pool.filter((n) => !/preview|exp/i.test(n));
    const pick = (stable.length ? stable : pool).sort((a, b) => versionOf(b) - versionOf(a))[0];
    const model = !refresh && usable.includes(GEMINI_DEFAULT_MODEL) ? GEMINI_DEFAULT_MODEL : pick ?? GEMINI_DEFAULT_MODEL;
    FREE_MODEL_CACHE.set(apiKey, { model, at: Date.now() });
    return model;
  } catch {
    return cached?.model ?? GEMINI_DEFAULT_MODEL;
  }
}

type GeminiGenerateOpts = {
  credential: AiCredential;
  model?: string;
  system?: string;
  turns: GeminiTurn[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Translation and classification do not need Gemini's hidden reasoning. */
  disableThinking?: boolean;
  /** Reports the tokens Gemini billed, so the caller can log them. */
  onTokens?: (tokens: { inputTokens: number; outputTokens: number }) => void;
  /** When given, the call is written to the account usage history itself. */
  usage?: import("@/lib/ai-usage.server").UsageMeta;
};

/**
 * One non-streaming Gemini call on the caller's own credential. When the free
 * model was retired by Google, it switches to the newest free model and tries
 * that once — the user never sees an "update your model" error.
 */
export async function geminiGenerate(opts: GeminiGenerateOpts): Promise<string> {
  if (!isAutoModel(opts.model)) return geminiGenerateOnce(opts);
  const key = opts.credential.value;
  const model = FREE_MODEL_CACHE.get(key)?.model ?? GEMINI_DEFAULT_MODEL;
  try {
    return await geminiGenerateOnce({ ...opts, model });
  } catch (err) {
    if (!(err instanceof UserAiError && err.code === "model_unavailable")) throw err;
    FREE_MODEL_CACHE.set(key, { model, at: Date.now() });
    const next = await resolveFreeGeminiModel(key, true);
    if (next === model) throw err;
    return geminiGenerateOnce({ ...opts, model: next });
  }
}

async function geminiGenerateOnce(opts: GeminiGenerateOpts): Promise<string> {
  const model = opts.model ?? GEMINI_DEFAULT_MODEL;
  const { url, headers } = geminiUrl(model, "generateContent", opts.credential);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...(opts.system ? { system_instruction: { parts: [{ text: opts.system }] } } : {}),
        contents: opts.turns,
        generationConfig: {
          maxOutputTokens: opts.maxTokens ?? 2048,
          ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
          ...(opts.disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    });
  } catch {
    throw new GeminiHttpError(502, "Could not reach Gemini.");
  }
  if (!res.ok) {
    if (opts.usage) {
      const { recordAiUsage } = await import("@/lib/ai-usage.server");
      await recordAiUsage({ provider: "gemini", model, ...opts.usage }, { status: res.status === 429 ? "quota" : "error", errorCode: String(res.status) });
    }
    await raiseForGemini(res);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  const { readUsageTokens, recordAiUsage } = await import("@/lib/ai-usage.server");
  const tokens = readUsageTokens(data);
  opts.onTokens?.(tokens);
  if (opts.usage) await recordAiUsage({ provider: "gemini", model, ...opts.usage }, tokens);
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason && /safety/i.test(candidate.finishReason)) {
    throw new GeminiHttpError(422, "SAFETY_BLOCKED");
  }
  return (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}

/** Extracts a YouTube id from any of the URL shapes the app accepts. */
export function youtubeIdFromUrl(url: string): string | null {
  return /(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{6,})/.exec(url)?.[1] ?? null;
}

/**
 * Video analysis part for Gemini's native API. Video work requires a real
 * Gemini key owned by the user.
 */
export function youtubeVideoPart(url: string, credential: AiCredential, startSec: number, endSec: number): GeminiPart {
  const id = youtubeIdFromUrl(url);
  if (!id) throw new GeminiHttpError(400, "Invalid YouTube link.");
  // Gemini rejects "#t=" links ("Request contains an invalid argument"); the
  // time range goes in video_metadata instead, on a plain watch link.
  const part: GeminiPart = { file_data: { file_uri: `https://www.youtube.com/watch?v=${id}` } };
  if (startSec > 0 || endSec > 0) {
    part.video_metadata = {
      start_offset: `${Math.max(0, Math.floor(startSec))}s`,
      ...(endSec > 0 ? { end_offset: `${Math.ceil(endSec)}s` } : {}),
    };
  }
  return part;
}

/**
 * Streaming Gemini call. `onDelta` receives each text fragment as it arrives.
 * Returns the full text. Used by live chat so voice can start on phrase one.
 */
export async function geminiStream(opts: {
  credential: AiCredential;
  model?: string;
  system?: string;
  turns: GeminiTurn[];
  maxTokens?: number;
  onDelta: (text: string) => void;
  /** When given, the call is written to the account usage history. */
  usage?: import("@/lib/ai-usage.server").UsageMeta;
}): Promise<string> {
  const model = isAutoModel(opts.model)
    ? (FREE_MODEL_CACHE.get(opts.credential.value)?.model ?? GEMINI_DEFAULT_MODEL)
    : opts.model!;
  const { url, headers } = geminiUrl(model, "streamGenerateContent?alt=sse", opts.credential);
  // streamGenerateContent puts alt=sse in the query string; with a key both
  // params must live on the URL.
  const finalUrl =
    opts.credential.kind === "gemini_key"
      ? `${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.credential.value)}`
      : url;
  let res: Response;
  try {
    res = await fetch(finalUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...(opts.system ? { system_instruction: { parts: [{ text: opts.system }] } } : {}),
        contents: opts.turns,
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 1024 },
      }),
    });
  } catch {
    throw new GeminiHttpError(502, "Could not reach Gemini.");
  }
  if (!res.ok) {
    if (opts.usage) {
      const { recordAiUsage } = await import("@/lib/ai-usage.server");
      await recordAiUsage({ provider: "gemini", model, ...opts.usage }, { status: res.status === 429 ? "quota" : "error", errorCode: String(res.status) });
    }
    await raiseForGemini(res);
  }
  const streamBody = res.body;
  if (!streamBody) throw new GeminiHttpError(502, "Gemini returned no stream.");

  const reader = streamBody.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let tokens = { inputTokens: 0, outputTokens: 0 };
  const { readUsageTokens, recordAiUsage } = await import("@/lib/ai-usage.server");
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const counted = readUsageTokens(evt);
        if (counted.inputTokens || counted.outputTokens) tokens = counted;
        const delta = (evt.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
        if (delta) {
          full += delta;
          opts.onDelta(delta);
        }
      } catch {
        /* keep-alive fragment */
      }
    }
  }
  if (opts.usage) await recordAiUsage({ provider: "gemini", model, ...opts.usage }, tokens);
  return full.trim();
}

/** Serialises a UserAiError/GeminiHttpError into the endpoint's JSON reply. */
export function aiErrorResponse(err: unknown): Response {
  if (err instanceof UserAiError) {
    return new Response(JSON.stringify({ error: err.message, code: err.code }), {
      status: err.httpStatus,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (err instanceof GeminiHttpError) {
    return new Response(JSON.stringify({ error: err.message, code: "provider" }), {
      status: err.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  const message = err instanceof Error ? err.message : "AI request failed.";
  return new Response(JSON.stringify({ error: message, code: "provider" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
