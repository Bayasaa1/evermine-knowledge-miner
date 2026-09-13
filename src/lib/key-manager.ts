/**
 * One place that knows every AI key this creator has saved.
 *
 * Gemini keys live in the device keystore (multiple allowed, each with its own
 * daily tally). Every other provider keeps one key in the per-account engine
 * stack, with an on/off switch and a monthly spending cap for paid providers.
 * Both are merged here so the key list, the miner picker and the credential
 * resolver can never disagree about what is saved.
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
  | "openai"
  | "anthropic"
  | "moonshot"
  | "openrouter"
  | "deepseek";

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
  /** Rough USD cost per 1K tokens, used for the spending estimate. */
  costPer1k: number;
};

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
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    paid: true,
    keyField: "OPENROUTER_API_KEY",
    placeholder: "sk-or-…",
    keyUrl: "https://openrouter.ai/keys",
    baseUrl: "https://openrouter.ai/api/v1",
    testModel: "meta-llama/llama-3.3-70b-instruct",
    costPer1k: 0.0004,
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
  },
];

export function findProviderInfo(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providerForKeyField(keyField: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.keyField === keyField);
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
  maskedTail: string;
  state: "ok" | "invalid" | "exhausted";
  addedAt: number;
  /** Calls made with this key today, counted by Evermind. */
  callsToday: number;
  /** What this key actually costs as configured. */
  cost: KeyCost;
  /** Model this key is routed to, when the provider routes models. */
  model?: string;
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

function fromGeminiEntry(k: ApiKeyEntry): SavedKey {
  const today = todayStamp();
  return {
    id: k.id,
    provider: GEMINI,
    maskedTail: k.maskedTail,
    state: k.state,
    addedAt: k.createdAt,
    callsToday: k.usage?.day === today ? k.usage.calls : 0,
    cost: "free-tier",
    enabled: true,
    monthlyCapUsd: 0,
    spendUsd: 0,
    ...(k.exhaustedAt ? { exhaustedAt: k.exhaustedAt } : {}),
  };
}

/** Every saved key, Gemini first, in the order they were added. */
export async function listAllKeys(): Promise<SavedKey[]> {
  const [gemini, stack] = await Promise.all([loadApiKeys(), loadStack()]);
  const rows: SavedKey[] = gemini.map(fromGeminiEntry);
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
      maskedTail: value.slice(-4),
      state: "ok",
      addedAt: setting.addedAt,
      callsToday: 0,
      cost,
      ...(setting.model ? { model: setting.model } : {}),
      enabled: cost === "paid" ? setting.enabled : true,
      monthlyCapUsd: setting.monthlyCapUsd,
      spendUsd: setting.spendUsd,
    });
  }
  return rows;
}

export class DuplicateKeyError extends Error {
  constructor() {
    super("duplicate");
    this.name = "DuplicateKeyError";
  }
}

/** Saves a key after the caller has tested it. Rejects an exact duplicate. */
export async function addKey(providerId: ProviderId, rawValue: string): Promise<void> {
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
  await saveStack({
    ...stack,
    keys: { ...stack.keys, [provider.keyField]: value },
    providers: {
      ...stack.providers,
      [provider.keyField]: stack.providers[provider.keyField] ?? defaultProviderSetting(provider.paid),
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
