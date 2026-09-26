/**
 * Multi-provider brain engine support. Gemini remains the mining engine (it is the
 * only provider with native video input); the providers below power knowledge Q&A,
 * chat responses and text extraction. Keys are BYO and stay on this device, or are
 * resolved from backend secrets when the call goes through the app server.
 */
import { getGeminiAccessToken } from "./google-gemini-auth";

export type BrainProviderId = "gemini" | "openai" | "anthropic" | "deepseek";

export type BrainModel = { id: string; label: string; note: string };

export type BrainProvider = {
  id: BrainProviderId;
  label: string;
  tagline: string;
  /** Engine-stack key field name (also the backend secret name). */
  keyField: string;
  keyPlaceholder: string;
  models: BrainModel[];
};

export const BRAIN_PROVIDERS: BrainProvider[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    tagline: "Fast, free-tier compatible, native video mining",
    keyField: "GEMINI_API_KEY",
    keyPlaceholder: "AIza...",
    models: [
      { id: "gemini-3.1-flash-lite", label: "Gemini 2.5 Flash", note: "Fast · free tier" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 2.5 Pro", note: "Deepest reasoning" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    tagline: "Industry standard, highly reliable",
    keyField: "OPENAI_API_KEY",
    keyPlaceholder: "sk-...",
    models: [
      { id: "gpt-4o", label: "GPT-4o", note: "Flagship quality" },
      { id: "gpt-4o-mini", label: "GPT-4o mini", note: "Fast & cheap" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    tagline: "Advanced reasoning & knowledge extraction",
    keyField: "ANTHROPIC_API_KEY",
    keyPlaceholder: "sk-ant-...",
    models: [
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", note: "Best reasoning" },
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", note: "Fast & cheap" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    tagline: "Ultra low-cost, high performance",
    keyField: "DEEPSEEK_API_KEY",
    keyPlaceholder: "sk-...",
    models: [
      { id: "deepseek-chat", label: "DeepSeek-V3", note: "Ultra low cost" },
      { id: "deepseek-reasoner", label: "DeepSeek-R1", note: "Reasoning model" },
    ],
  },
];

export function findProvider(id: string | undefined): BrainProvider | undefined {
  return BRAIN_PROVIDERS.find((p) => p.id === id);
}

/** Maps an engine key field (e.g. OPENAI_API_KEY) back to its brain provider. */
export function providerForKeyField(keyField: string): BrainProvider | undefined {
  return BRAIN_PROVIDERS.find((p) => p.keyField === keyField);
}

export class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Normalizes provider failures into human-readable, diagnostic-friendly errors. */
async function throwForStatus(res: Response, provider: string): Promise<never> {
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(res.status, `${provider} rejected the API key (HTTP ${res.status}). Check the key in Engines settings.`);
  }
  if (res.status === 429) {
    throw new ProviderError(429, `${provider} rate limit or quota reached (HTTP 429). Slow down or switch engine.`);
  }
  throw new ProviderError(res.status, `${provider} request failed (HTTP ${res.status}). ${detail}`);
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ProviderChatOptions = {
  provider: BrainProviderId;
  model: string;
  /** BYO key. For Gemini, omitted means "use the linked Google OAuth session". */
  apiKey?: string;
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
};

/**
 * One chat completion against any supported brain provider, direct from the browser.
 * All four providers allow CORS browser calls with a user-owned key.
 */
export async function chatCompletion(opts: ProviderChatOptions): Promise<string> {
  const maxTokens = opts.maxTokens ?? 1024;

  if (opts.provider === "openai" || opts.provider === "deepseek") {
    if (!opts.apiKey) throw new ProviderError(401, `No ${opts.provider === "openai" ? "OpenAI" : "DeepSeek"} API key configured.`);
    const base = opts.provider === "openai" ? "https://api.openai.com/v1" : "https://api.deepseek.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: opts.system },
          ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
    if (!res.ok) await throwForStatus(res, opts.provider === "openai" ? "OpenAI" : "DeepSeek");
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return (data.choices?.[0]?.message?.content ?? "").trim();
  }

  if (opts.provider === "anthropic") {
    if (!opts.apiKey) throw new ProviderError(401, "No Anthropic API key configured.");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: maxTokens,
        system: opts.system,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) await throwForStatus(res, "Anthropic");
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  }

  // Gemini: prefer the linked Google OAuth session, fall back to a BYO key.
  const token = await getGeminiAccessToken();
  const url = `https://generativelanguage.googleapis.com/v1/models/${opts.model}:generateContent`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let finalUrl = url;
  if (token) headers["Authorization"] = `Bearer ${token}`;
  else if (opts.apiKey) finalUrl = `${url}?key=${encodeURIComponent(opts.apiKey)}`;
  else throw new ProviderError(401, "No Gemini credentials — sign in with Google or add an API key.");
  const res = await fetch(finalUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      system_instruction: { parts: [{ text: opts.system }] },
      contents: opts.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) await throwForStatus(res, "Gemini");
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
}

/** Minimal key check: one tiny completion. Throws ProviderError on failure. */
export async function testProviderKey(provider: BrainProviderId, apiKey: string, model?: string): Promise<void> {
  const p = findProvider(provider);
  const m = model ?? p?.models[0]?.id ?? "";
  await chatCompletion({
    provider,
    model: m,
    apiKey,
    system: "You are a connectivity check. Reply with exactly: ok",
    messages: [{ role: "user", content: "ping" }],
    maxTokens: 8,
  });
}
