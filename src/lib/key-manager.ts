/**
 * One place that knows every AI key this creator has saved.
 *
 * The list is an ordered fallback chain: #1 is used first, and when it runs out
 * of quota (or a paid key hits its monthly cap) the next one takes over.
 * Gemini keys live in the device keystore (multiple allowed, each with its own
 * daily tally). Every other provider keeps one key in the per-account engine
 * stack, with an on/off switch and a monthly spending cap for paid providers.
 */
import { loadStack, saveStack, defaultProviderSetting, monthStamp, type ProviderSetting } from "./engines";
import {
  loadApiKeys,
  saveApiKeys,
  makeKeyEntry,
  todayStamp,
  type ApiKeyEntry,
} from "./keystore";

export type ProviderId =
  | "gemini"
  | "groq"
  | "mistral"
  | "cerebras"
  | "together"
  | "github"
  | "openai"
  | "anthropic"
  | "moonshot"
  | "openrouter"
  | "deepseek"
  | "xai"
  | "perplexity"
  | "cohere"
  | "custom";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  paid: boolean;
  keyField: string;
  placeholder: string;
  keyUrl: string;
  /** OpenAI-compatible base used for the key test ("" = provider-specific). */
  baseUrl: string;
  testModel: string;
  /**
   * Model names to try when testing a key. Free model names change often, so
   * the first one that answers wins and is remembered for this key.
   */
  testModels?: string[];
  /** Path that lists models, used to check a key without naming a model. "" = unsupported. */
  modelsPath?: string;
  /** Rough USD cost per 1K tokens, used for the spending estimate. */
  costPer1k: number;
  /** One line on what this AI is good at, shown in the add list. */
  good: string;
};

/** Candidate models for the key test, newest-known first. */
export function testModelsFor(p: ProviderInfo): string[] {
  return p.testModels?.length ? p.testModels : p.testModel ? [p.testModel] : [];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "gemini",
    label: "Gemini",
    paid: false,
    keyField: "GEMINI_API_KEY",
    placeholder: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    baseUrl: "",
    testModel: "gemini-2.5-flash",
    costPer1k: 0,
    good: "The only one that watches and hears the video itself. Required.",
  },
  {
    id: "groq",
    label: "Groq",
    paid: false,
    keyField: "GROQ_API_KEY",
    placeholder: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
    baseUrl: "https://api.groq.com/openai/v1",
    testModel: "llama-3.3-70b-versatile",
    costPer1k: 0,
    good: "Very fast text reasoning over what Gemini extracted.",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    paid: false,
    keyField: "MISTRAL_API_KEY",
    placeholder: "…",
    keyUrl: "https://console.mistral.ai/api-keys",
    baseUrl: "https://api.mistral.ai/v1",
    testModel: "mistral-small-latest",
    costPer1k: 0,
    good: "Solid free backup for summaries and translation.",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    paid: false,
    keyField: "CEREBRAS_API_KEY",
    placeholder: "csk-…",
    keyUrl: "https://cloud.cerebras.ai",
    baseUrl: "https://api.cerebras.ai/v1",
    testModel: "llama-3.3-70b",
    costPer1k: 0,
    good: "Fastest free text engine. Good for long transcripts.",
  },
  {
    id: "together",
    label: "Together AI",
    paid: false,
    keyField: "TOGETHER_API_KEY",
    placeholder: "…",
    keyUrl: "https://api.together.ai/settings/api-keys",
    baseUrl: "https://api.together.xyz/v1",
    testModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
    costPer1k: 0,
    good: "Free open models, useful as a third fallback.",
  },
  {
    id: "github",
    label: "GitHub Models",
    paid: false,
    keyField: "GITHUB_MODELS_TOKEN",
    placeholder: "github_pat_…",
    keyUrl: "https://github.com/settings/tokens",
    baseUrl: "https://models.github.ai/inference",
    testModel: "openai/gpt-4o-mini",
    costPer1k: 0,
    good: "Free tier with a GitHub account. Low daily limits.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    paid: false,
    keyField: "OPENROUTER_API_KEY",
    placeholder: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
    baseUrl: "https://openrouter.ai/api/v1",
    testModel: "meta-llama/llama-3.3-70b-instruct:free",
    costPer1k: 0.0004,
    good: "One key, many models — free ones cost nothing.",
  },
  {
    id: "openai",
    label: "ChatGPT",
    paid: true,
    keyField: "OPENAI_API_KEY",
    placeholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    baseUrl: "https://api.openai.com/v1",
    testModel: "gpt-4o-mini",
    costPer1k: 0.00015,
    good: "Reliable extraction and clean structured answers.",
  },
  {
    id: "anthropic",
    label: "Claude",
    paid: true,
    keyField: "ANTHROPIC_API_KEY",
    placeholder: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    baseUrl: "https://api.anthropic.com",
    testModel: "claude-3-5-haiku-latest",
    costPer1k: 0.0008,
    good: "Deepest reasoning on nuance, tone and long material.",
  },
  {
    id: "moonshot",
    label: "Kimi",
    paid: true,
    keyField: "MOONSHOT_API_KEY",
    placeholder: "sk-…",
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    baseUrl: "https://api.moonshot.ai/v1",
    testModel: "kimi-k2-0711-preview",
    costPer1k: 0.0006,
    good: "Very long context — good for whole-course videos.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    paid: true,
    keyField: "DEEPSEEK_API_KEY",
    placeholder: "sk-…",
    keyUrl: "https://platform.deepseek.com/api_keys",
    baseUrl: "https://api.deepseek.com/v1",
    testModel: "deepseek-chat",
    costPer1k: 0.00027,
    good: "Cheapest strong reasoning. Great value per token.",
  },
  {
    id: "xai",
    label: "Grok (xAI)",
    paid: true,
    keyField: "XAI_API_KEY",
    placeholder: "xai-…",
    keyUrl: "https://console.x.ai",
    baseUrl: "https://api.x.ai/v1",
    testModel: "grok-3-mini",
    costPer1k: 0.0003,
    good: "Fast, blunt answers. Good for sales and chat scripts.",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    paid: true,
    keyField: "PERPLEXITY_API_KEY",
    placeholder: "pplx-…",
    keyUrl: "https://www.perplexity.ai/settings/api",
    baseUrl: "https://api.perplexity.ai",
    testModel: "sonar",
    costPer1k: 0.001,
    good: "Checks claims against the live web while it reasons.",
  },
  {
    id: "cohere",
    label: "Cohere",
    paid: true,
    keyField: "COHERE_API_KEY",
    placeholder: "…",
    keyUrl: "https://dashboard.cohere.com/api-keys",
    baseUrl: "https://api.cohere.ai/compatibility/v1",
    testModel: "command-r7b-12-2024",
    costPer1k: 0.00015,
    good: "Strong at search, tagging and multilingual notes.",
  },
  {
    id: "custom",
    label: "My own AI",
    paid: true,
    keyField: "CUSTOM_API_KEY",
    placeholder: "your key",
    keyUrl: "",
    baseUrl: "",
    testModel: "",
    costPer1k: 0,
    good: "Any OpenAI-compatible endpoint you host or pay for.",
  },
];

export function findProviderInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providerForKeyField(keyField: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.keyField === keyField);
}

/** Providers offered under "Get a free key" / "Get a paid key". */
export function providersByCost(paid: boolean): ProviderInfo[] {
  return PROVIDERS.filter((p) => p.id !== "custom" && p.paid === paid);
}

/**
 * What this key costs *the way it is used here* — not what the company is
 * known for. OpenRouter on a free model is free, and saying "paid" would be
 * a lie that also switches the key off.
 */
export type KeyCost = "free-tier" | "free-model" | "paid";

export type SavedKey = {
  /** Stable row id: keystore entry id for Gemini, key field for the rest. */
  id: string;
  provider: ProviderInfo;
  /** Name shown in the list — the custom provider uses the creator's own name. */
  label: string;
  maskedTail: string;
  state: "ok" | "invalid" | "exhausted";
  addedAt: number;
  /** Position in the fallback order, 1-based. */
  rank: number;
  /** Calls made with this key today, counted by Evermind. */
  callsToday: number;
  /** What this key actually costs as configured. */
  cost: KeyCost;
  /** Model this key is routed to, when the provider routes models. */
  model?: string;
  endpoint?: string;
  /** Paid use only. */
  enabled: boolean;
  monthlyCapUsd: number;
  spendUsd: number;
  /** Epoch ms the free quota was hit, so the UI can show a reset countdown. */
  exhaustedAt?: number;
};

/** OpenRouter model ids that cost nothing. Everything else bills the creator. */
export function isFreeRoutedModel(model: string | undefined): boolean {
  return !model || model.endsWith(":free");
}

const GEMINI = PROVIDERS[0]!;
const BIG = 9_000;

function fromGeminiEntry(k: ApiKeyEntry): Omit<SavedKey, "rank"> & { sortRank: number } {
  const today = todayStamp();
  return {
    id: k.id,
    provider: GEMINI,
    label: GEMINI.label,
    maskedTail: k.maskedTail,
    state: k.state,
    addedAt: k.createdAt,
    sortRank: k.rank ?? BIG,
    callsToday: k.usage?.day === today ? k.usage.calls : 0,
    cost: "free-tier",
    enabled: true,
    monthlyCapUsd: 0,
    spendUsd: 0,
    ...(k.exhaustedAt ? { exhaustedAt: k.exhaustedAt } : {}),
  };
}

/** Every saved key in fallback order: #1 is tried first. */
export async function listAllKeys(): Promise<SavedKey[]> {
  const [gemini, stack] = await Promise.all([loadApiKeys(), loadStack()]);
  const rows: (Omit<SavedKey, "rank"> & { sortRank: number })[] = gemini.map(fromGeminiEntry);
  for (const p of PROVIDERS) {
    if (p.id === "gemini") continue;
    const value = (stack.keys[p.keyField] ?? "").trim();
    if (!value) continue;
    const setting = stack.providers[p.keyField] ?? defaultProviderSetting(p.paid);
    // OpenRouter routes models, so its cost depends on the model picked here.
    const cost: KeyCost = !p.paid
      ? "free-tier"
      : p.id === "openrouter"
        ? isFreeRoutedModel(setting.model)
          ? "free-model"
          : "paid"
        : "paid";
    rows.push({
      id: p.keyField,
      provider: p,
      label: p.id === "custom" ? setting.label || p.label : p.label,
      maskedTail: value.slice(-4),
      state: "ok",
      addedAt: setting.addedAt,
      sortRank: setting.rank ?? BIG,
      callsToday: 0,
      cost,
      ...(setting.model ? { model: setting.model } : {}),
      ...(setting.endpoint ? { endpoint: setting.endpoint } : {}),
      enabled: cost === "paid" ? setting.enabled : true,
      monthlyCapUsd: setting.monthlyCapUsd,
      spendUsd: setting.spendUsd,
    });
  }
  rows.sort((a, b) => a.sortRank - b.sortRank || a.addedAt - b.addedAt);
  return rows.map(({ sortRank: _drop, ...row }, i) => ({ ...row, rank: i + 1 }));
}

/** Writes the current visual order back to storage so it survives reloads. */
async function persistOrder(order: SavedKey[]): Promise<void> {
  const geminiRank = new Map<string, number>();
  const providerRank = new Map<string, number>();
  order.forEach((row, i) => {
    if (row.provider.id === "gemini") geminiRank.set(row.id, i);
    else providerRank.set(row.provider.keyField, i);
  });
  if (geminiRank.size) {
    const keys = await loadApiKeys();
    await saveApiKeys(keys.map((k) => (geminiRank.has(k.id) ? { ...k, rank: geminiRank.get(k.id)! } : k)));
  }
  if (providerRank.size) {
    const stack = await loadStack();
    const providers = { ...stack.providers };
    for (const [field, rank] of providerRank) {
      const paid = providerForKeyField(field)?.paid ?? true;
      providers[field] = { ...(providers[field] ?? defaultProviderSetting(paid)), rank };
    }
    await saveStack({ ...stack, providers });
  }
}

/** Moves one key up or down the fallback order. */
export async function moveKey(rowId: string, dir: "up" | "down"): Promise<void> {
  const rows = await listAllKeys();
  const i = rows.findIndex((r) => r.id === rowId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  const next = [...rows];
  [next[i], next[j]] = [next[j]!, next[i]!];
  await persistOrder(next);
}

export class DuplicateKeyError extends Error {
  constructor() {
    super("duplicate");
    this.name = "DuplicateKeyError";
  }
}

/** Saves a key after the caller has tested it. Rejects an exact duplicate. */
export async function addKey(
  providerId: ProviderId,
  rawValue: string,
  extra?: { label?: string; endpoint?: string; model?: string },
): Promise<void> {
  const value = rawValue.trim();
  const provider = findProviderInfo(providerId);
  if (!provider || !value) throw new Error("Missing key");

  if (provider.id === "gemini") {
    const keys = await loadApiKeys();
    if (keys.some((k) => k.value === value)) throw new DuplicateKeyError();
    const entry = makeKeyEntry(value, `Key ${keys.length + 1}`);
    await saveApiKeys([...keys, entry]);
    return;
  }

  const stack = await loadStack();
  if ((stack.keys[provider.keyField] ?? "").trim() === value) throw new DuplicateKeyError();
  const base = stack.providers[provider.keyField] ?? defaultProviderSetting(provider.paid);
  await saveStack({
    ...stack,
    keys: { ...stack.keys, [provider.keyField]: value },
    providers: {
      ...stack.providers,
      [provider.keyField]: {
        ...base,
        ...(extra?.label ? { label: extra.label } : {}),
        ...(extra?.endpoint ? { endpoint: extra.endpoint } : {}),
        ...(extra?.model ? { model: extra.model } : {}),
      },
    },
  });
}

export async function removeKey(row: SavedKey): Promise<void> {
  if (row.provider.id === "gemini") {
    const keys = await loadApiKeys();
    await saveApiKeys(keys.filter((k) => k.id !== row.id));
    return;
  }
  const stack = await loadStack();
  const keys = { ...stack.keys };
  const providers = { ...stack.providers };
  delete keys[row.provider.keyField];
  delete providers[row.provider.keyField];
  await saveStack({ ...stack, keys, providers });
}

async function patchProvider(keyField: string, patch: Partial<ProviderSetting>): Promise<void> {
  const stack = await loadStack();
  const paid = providerForKeyField(keyField)?.paid ?? true;
  const current = stack.providers[keyField] ?? defaultProviderSetting(paid);
  await saveStack({ ...stack, providers: { ...stack.providers, [keyField]: { ...current, ...patch } } });
}

export async function setProviderEnabled(keyField: string, enabled: boolean): Promise<void> {
  await patchProvider(keyField, { enabled });
}

export async function setProviderCap(keyField: string, monthlyCapUsd: number): Promise<void> {
  await patchProvider(keyField, { monthlyCapUsd: Math.max(0, Math.min(10_000, monthlyCapUsd)) });
}

/** Remembers which model this key routes to, so free stays free. */
export async function setProviderModel(keyField: string, model: string): Promise<void> {
  await patchProvider(keyField, { model });
}

/** Adds estimated spend for a paid provider and keeps it inside the month it belongs to. */
export async function recordProviderSpend(keyField: string, usd: number): Promise<void> {
  const stack = await loadStack();
  const paid = providerForKeyField(keyField)?.paid ?? true;
  const current = stack.providers[keyField] ?? defaultProviderSetting(paid);
  const sameMonth = current.month === monthStamp();
  await patchProvider(keyField, {
    spendUsd: (sameMonth ? current.spendUsd : 0) + Math.max(0, usd),
    month: monthStamp(),
  });
}

/**
 * True when this key may be used right now. A free tier or a free routed
 * model is always usable — only genuinely paid use waits for the switch and
 * the monthly cap.
 */
export function providerUsable(row: SavedKey): boolean {
  if (row.cost !== "paid") return true;
  return row.enabled && row.spendUsd < row.monthlyCapUsd;
}

export type Credential = {
  provider: ProviderId;
  keyField: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

/**
 * The ordered credentials to try for one job. #1 first; a key that is out of
 * quota, switched off, or over its cap is skipped, never dropped from the list.
 */
export async function rankedCredentials(
  isUsableState: (row: SavedKey) => boolean = () => true,
): Promise<Credential[]> {
  const [rows, gemini, stack] = await Promise.all([listAllKeys(), loadApiKeys(), loadStack()]);
  const out: Credential[] = [];
  for (const row of rows) {
    if (!providerUsable(row) || !isUsableState(row)) continue;
    const apiKey =
      row.provider.id === "gemini"
        ? (gemini.find((k) => k.id === row.id)?.value ?? "")
        : (stack.keys[row.provider.keyField] ?? "");
    if (!apiKey) continue;
    out.push({
      provider: row.provider.id,
      keyField: row.provider.keyField,
      apiKey,
      baseUrl: row.endpoint || row.provider.baseUrl,
      model: row.model || row.provider.testModel,
    });
  }
  return out;
}
