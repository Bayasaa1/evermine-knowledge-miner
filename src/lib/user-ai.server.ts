/**
 * Per-user AI access — the one place every server-side AI call gets its
 * credentials from. Nothing here ever touches the platform's shared AI
 * account: a request runs on the signed-in user's own Gemini key, their own
 * Google sign-in token, or a key they pasted for another provider.
 *
 * Resolution order for a request:
 *   1. a key the caller sent with the request (their device vault), or the
 *      key they saved on their account (used by background jobs too)
 *   2. their Google session token (from signing in with Google)
 *   3. nothing → a typed `no_credential` error the UI turns into the
 *      "paste your free Gemini key" card
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AiCredential = { kind: "gemini_key" | "google_token"; value: string };

export type AiErrorCode = "no_credential" | "quota" | "unsupported_task";

export class UserAiError extends Error {
  code: AiErrorCode;
  httpStatus: number;
  constructor(code: AiErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const NO_CREDENTIAL =
  "This feature needs your own AI key. Add your free Gemini key in Engines — it takes a minute and costs nothing.";

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
 * Resolves the caller's Gemini credential.
 * `userId` must come from guardApi/requireSupabaseAuth. `body` may carry
 * `apiKey` (a key from the caller's own vault) and `googleToken` (their
 * Google session token). With neither, their saved account key is used.
 */
export async function resolveGeminiCredential(
  userId: string,
  body?: { apiKey?: unknown; googleToken?: unknown },
): Promise<AiCredential> {
  const key = clean(body?.apiKey);
  if (key) return { kind: "gemini_key", value: key };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_ai_keys")
      .select("api_key")
      .eq("user_id", userId)
      .eq("provider", "gemini")
      .maybeSingle();
    const saved = clean(data?.api_key);
    if (saved) return { kind: "gemini_key", value: saved };
  } catch {
    /* fall through to the Google token */
  }

  const token = clean(body?.googleToken);
  if (token) return { kind: "google_token", value: token };

  throw new UserAiError("no_credential", NO_CREDENTIAL);
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function geminiUrl(model: string, method: string, cred: AiCredential): { url: string; headers: HeadersInit } {
  const path = `${GEMINI_BASE}/models/${model}:${method}`;
  if (cred.kind === "google_token") {
    return { url: path, headers: { "Content-Type": "application/json", Authorization: `Bearer ${cred.value}` } };
  }
  return { url: `${path}?key=${encodeURIComponent(cred.value)}`, headers: { "Content-Type": "application/json" } };
}

export class GeminiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
  if (res.status === 429) {
    throw new UserAiError(
      "quota",
      "Your free Gemini quota is used up for now. Wait for it to reset (usually within a day) or add another key in Engines.",
      429,
    );
  }
  if (res.status === 400 && /api key|key not valid|permission/i.test(detail)) {
    throw new UserAiError("no_credential", "That Gemini key was rejected. Add a valid free key in Engines.", 401);
  }
  if (res.status === 401 || res.status === 403) {
    throw new UserAiError("no_credential", "Gemini rejected this sign-in or key. Re-link Google or add a free key in Engines.", 401);
  }
  throw new GeminiHttpError(res.status, detail || `Gemini request failed (${res.status}).`);
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
  if (!res.ok) await raiseForGemini(res);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
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
 * Video analysis part for Gemini's native API. Google sign-in tokens cannot
 * pull YouTube video data, so video work requires a real Gemini key.
 */
export function youtubeVideoPart(url: string, credential: AiCredential, startSec: number, endSec: number): GeminiPart {
  if (credential.kind !== "gemini_key") {
    throw new UserAiError(
      "unsupported_task",
      "Video mining needs a free Gemini key — sign-in alone cannot read videos. Add yours once and mining runs on your own free quota.",
    );
  }
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
  const streamBody = res.body;
  if (!res.ok || !streamBody) await raiseForGemini(res);

  const reader = streamBody.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
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
