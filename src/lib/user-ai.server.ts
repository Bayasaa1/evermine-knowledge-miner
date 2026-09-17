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

export type AiCredential = { kind: "gemini_key"; value: string };

export type AiErrorCode = "no_credential" | "quota" | "rate_minute" | "unsupported_task";

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

export type ResolvedUserKey = {
  id: string;
  provider: string;
  apiKey: string;
  tail: string;
  model: string | null;
  endpoint: string | null;
  autoFallback: boolean;
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
  const usable = (data ?? []).filter((row) => {
    if (skipIds.includes(row.id)) return false;
    if (row.status === "invalid") return false;
    if (row.cooldown_until && row.cooldown_until > now) return false;
    if (row.cost_kind === "paid" && Number(row.monthly_limit_usd) <= Number(row.spend_usd)) return false;
    return true;
  });
  const selected = (choice?.keyId ? usable.find((row) => row.id === choice.keyId) : null)
    ?? (choice?.keyTail ? usable.find((row) => row.provider === choice.provider && row.api_key.endsWith(choice.keyTail ?? "")) : null)
    ?? ((!choice || choice.autoFallback) ? usable[0] : null);
  if (!selected) throw new UserAiError("no_credential", NO_CREDENTIAL);
  return {
    id: selected.id,
    provider: selected.provider,
    apiKey: selected.api_key,
    tail: selected.api_key.slice(-4),
    model: selected.model,
    endpoint: selected.endpoint,
    autoFallback: choice?.autoFallback ?? true,
  };
}

async function markKeyUnavailable(keyId: string, status: "exhausted" | "invalid", cooldownUntil: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("user_ai_keys").update({ status, cooldown_until: cooldownUntil }).eq("id", keyId);
}

function isLimitError(error: unknown): boolean {
  return error instanceof UserAiError && (error.code === "quota" || error.code === "rate_minute")
    || error instanceof GeminiHttpError && error.status === 429;
}

type RoleTextRun = { text: string; inputTokens: number; outputTokens: number };

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
  json?: boolean;
  maxTokens?: number;
}): Promise<RoleTextRun> {
  const { readUsageTokens } = await import("@/lib/ai-usage.server");
  const resolved = opts.resolved;
  if (resolved.provider === "gemini") {
    let tokens = { inputTokens: 0, outputTokens: 0 };
    const text = await geminiGenerate({
      credential: { kind: "gemini_key", value: resolved.apiKey },
      system: opts.system,
      turns: [{ role: "user", parts: [{ text: opts.prompt }] }],
      onTokens: (t) => { tokens = t; },
      ...(opts.json != null ? { json: opts.json } : {}),
      ...(opts.maxTokens != null ? { maxTokens: opts.maxTokens } : {}),
    });
    return { text, ...tokens };
  }
  if (resolved.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": resolved.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: resolved.model || "claude-3-5-haiku-latest", max_tokens: opts.maxTokens ?? 2048, system: opts.system, messages: [{ role: "user", content: opts.prompt }] }),
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
    body: JSON.stringify({ model, max_tokens: cap, messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.prompt }], ...(opts.json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!res.ok) throw new GeminiHttpError(res.status, `${resolved.provider}: ${await errorDetail(res)}`);
  const body = await res.json() as { choices?: { message?: { content?: string } }[] };
  return { text: body.choices?.[0]?.message?.content?.trim() ?? "", ...readUsageTokens(body) };
}

const OPENAI_COMPATIBLE: Record<string, { base: string; model: string }> = {
  groq: { base: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  mistral: { base: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  cerebras: { base: "https://api.cerebras.ai/v1", model: "llama3.1-8b" },
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
  role: "translate" | "core_brain" | "chat";
  system: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  /** What this call was for, so the usage history can name it. */
  subjectKind?: "video" | "mind" | "project" | "test" | "other";
  subjectId?: string;
  subjectLabel?: string;
}): Promise<{ text: string; provider: string; tail: string }> {
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
    generateRoleTextOnce({ resolved: key, system: opts.system, prompt: opts.prompt, ...(opts.json != null ? { json: opts.json } : {}), ...(opts.maxTokens != null ? { maxTokens: opts.maxTokens } : {}) });
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
      return { text: run.text, provider: resolved.provider, tail: resolved.tail };
    } catch (error) {
      lastError = error;
      const limit = isLimitError(error);
      await recordAiUsage(
        { userId: opts.userId, role: opts.role, provider: resolved.provider, keyId: resolved.id, keyTail: resolved.tail, subjectKind: opts.subjectKind ?? "other", ...(opts.subjectLabel ? { subjectLabel: opts.subjectLabel } : {}) },
        { status: limit ? "quota" : "error", errorCode: limit ? "limit" : (error instanceof Error ? error.message : "provider error").slice(0, 120) },
      );
      if (limit) {
        const cooldown = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await markKeyUnavailable(resolved.id, "exhausted", cooldown);
      }
      skipped.push(resolved.id);
      if (!resolved.autoFallback || error instanceof UserAiError && error.code === "no_credential") throw error;
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
  const key = clean(body?.apiKey);
  if (key) return { kind: "gemini_key", value: key };

  try {
    if (role) {
      const resolved = await resolveUserAiKey(userId, role);
      if (resolved.provider !== "gemini") throw new UserAiError("unsupported_task", "This job requires Gemini video or image access.");
      return { kind: "gemini_key", value: resolved.apiKey };
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
): Promise<{ provider: string; assignedTail: string | null; effectiveTail: string | null; missing: boolean }> {
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
    assignedTail,
    effectiveTail,
    missing: Boolean(assignedTail) && effectiveTail !== assignedTail,
  };
}

/** One tiny live call with the key a job would use, so the user can see it work. */
export async function testRoleKey(
  userId: string,
  role: AiRole,
  fallbackProvider: string,
): Promise<{ ok: boolean; message: string; tail: string | null }> {
  const report = await roleKeyReport(userId, role, fallbackProvider);
  if (!report.effectiveTail) return { ok: false, message: "No key saved for this job yet.", tail: null };
  const resolved = await resolveUserAiKey(userId, role);
  const key = resolved.apiKey;

  try {
    if (report.provider === "elevenlabs") {
      const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key } });
      return res.ok
        ? { ok: true, message: "Working.", tail: report.effectiveTail }
        : { ok: false, message: `Rejected (${res.status}).`, tail: report.effectiveTail };
    }
    if (report.provider === "gemini") {
      const res = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(key)}`);
      if (res.ok) return { ok: true, message: "Working.", tail: report.effectiveTail };
      if (res.status === 429) return { ok: false, message: "Busy right now — try again in a minute.", tail: report.effectiveTail };
      return { ok: false, message: `Rejected (${res.status}).`, tail: report.effectiveTail };
    }
    if (role === "translate" || role === "core_brain" || role === "chat") {
      const tested = await generateRoleText({
        userId,
        role,
        system: "Return only the word OK.",
        prompt: "Connection test.",
        maxTokens: 8,
      });
      return tested.text
        ? { ok: true, message: `Working through ${tested.provider} ···${tested.tail}.`, tail: tested.tail }
        : { ok: false, message: "Connected but returned no text.", tail: report.effectiveTail };
    }
    return { ok: true, message: "Working.", tail: report.effectiveTail };
  } catch (error) {
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
  const isDaily = /PerDay|per_day|daily/i.test(raw);
  if (isDaily) {
    return new UserAiError(
      "quota",
      "Your free Gemini daily quota is used up. It resets in a few hours (Pacific midnight) — or add another free key in Engines.",
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
  if (res.status === 400 && /api key|key not valid|permission/i.test(detail)) {
    throw new UserAiError("no_credential", "That Gemini key was rejected. Add a valid free key in Engines.", 401);
  }
  if (res.status === 401 || res.status === 403) {
    throw new UserAiError("no_credential", "Gemini rejected this key. Add a valid free key in Engines.", 401);
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
  | { file_data: { file_uri: string } };

export type GeminiTurn = { role: "user" | "model"; parts: GeminiPart[] };

/** One non-streaming Gemini call on the caller's own credential. */
export async function geminiGenerate(opts: {
  credential: AiCredential;
  model?: string;
  system?: string;
  turns: GeminiTurn[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Reports the tokens Gemini billed, so the caller can log them. */
  onTokens?: (tokens: { inputTokens: number; outputTokens: number }) => void;
  /** When given, the call is written to the account usage history itself. */
  usage?: import("@/lib/ai-usage.server").UsageMeta;
}): Promise<string> {
  const model = opts.model ?? "gemini-2.5-flash";
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
  return {
    file_data: {
      file_uri: `https://www.youtube.com/watch?v=${id}${
        startSec > 0 || endSec > 0
          ? `#t=${Math.max(0, Math.floor(startSec))}${endSec > 0 ? `,${Math.ceil(endSec)}` : ""}`
          : ""
      }`,
    },
  };
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
  const model = opts.model ?? "gemini-2.5-flash";
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
