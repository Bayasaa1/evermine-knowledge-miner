/**
 * Token & spend ledger for every AI call the creator's account makes.
 *
 * Each mining / thinking call reports the tokens the provider billed, and we
 * price them locally with a published per-million-token rate. Free engines are
 * priced at zero and tracked against an approximate daily free allowance so the
 * creator can see how much of today's free quota is left.
 *
 * Everything here is an estimate derived from the providers' own usage numbers —
 * it is not a billing statement.
 */
import { idbGet, idbSet, STORES } from "@/lib/store";

const KEY = "token-usage";

export type UsageStage = "perception" | "thinking" | "chat" | "audit";

export type UsageEntry = {
  at: number;
  provider: string;
  model: string;
  stage: UsageStage;
  inputTokens: number;
  outputTokens: number;
};

export type UsageLedger = { entries: UsageEntry[] };

/** USD per 1M tokens. `free` engines cost nothing but burn a daily allowance. */
export type ProviderRate = {
  label: string;
  input: number;
  output: number;
  free: boolean;
  /** Approximate free tokens per day (0 when there is no free tier). */
  dailyFreeTokens: number;
  /**
   * Approximate free AI calls (requests) per day — the "credits" a creator
   * spends every time this AI is asked to do something. 0 means the provider
   * bills per token instead of capping the number of calls.
   */
  dailyFreeCalls: number;
};

export const PROVIDER_RATES: Record<string, ProviderRate> = {
  "gemini-builtin": { label: "Evermind engine (Gemini)", input: 0, output: 0, free: true, dailyFreeTokens: 1_000_000, dailyFreeCalls: 1_000 },
  gemini: { label: "Gemini", input: 0.3, output: 2.5, free: true, dailyFreeTokens: 1_000_000, dailyFreeCalls: 1_500 },
  "gemini-pro": { label: "Gemini Pro", input: 1.25, output: 10, free: false, dailyFreeTokens: 0, dailyFreeCalls: 0 },
  groq: { label: "Groq", input: 0, output: 0, free: true, dailyFreeTokens: 500_000, dailyFreeCalls: 14_400 },
  "whisper-groq": { label: "Groq Whisper", input: 0, output: 0, free: true, dailyFreeTokens: 500_000, dailyFreeCalls: 2_000 },
  mistral: { label: "Mistral AI", input: 0, output: 0, free: true, dailyFreeTokens: 1_000_000, dailyFreeCalls: 1_000 },
  chatgpt: { label: "ChatGPT", input: 0.15, output: 0.6, free: false, dailyFreeTokens: 0, dailyFreeCalls: 0 },
  claude: { label: "Claude", input: 0.8, output: 4, free: false, dailyFreeTokens: 0, dailyFreeCalls: 0 },
  kimi: { label: "Kimi", input: 0.6, output: 2.5, free: false, dailyFreeTokens: 0, dailyFreeCalls: 0 },
  openrouter: { label: "OpenRouter", input: 0.2, output: 0.8, free: true, dailyFreeTokens: 200_000, dailyFreeCalls: 50 },
  "qwen-vl": { label: "Qwen-VL", input: 0, output: 0, free: true, dailyFreeTokens: 200_000, dailyFreeCalls: 50 },
  "llama-vision": { label: "Llama Vision", input: 0, output: 0, free: true, dailyFreeTokens: 200_000, dailyFreeCalls: 50 },
  "qwen-audio": { label: "Qwen Audio", input: 0.4, output: 1.2, free: false, dailyFreeTokens: 0, dailyFreeCalls: 0 },
  custom: { label: "My own AI", input: 0, output: 0, free: false, dailyFreeTokens: 0, dailyFreeCalls: 0 },
};

export function rateFor(provider: string): ProviderRate {
  return (
    PROVIDER_RATES[provider] ?? {
      label: provider,
      input: 0,
      output: 0,
      free: false,
      dailyFreeTokens: 0,
      dailyFreeCalls: 0,
    }
  );
}


function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

function normalize(raw: unknown): UsageLedger {
  if (typeof raw !== "object" || raw === null) return { entries: [] };
  const list = (raw as Record<string, unknown>)['entries'];
  if (!Array.isArray(list)) return { entries: [] };
  const entries = list.flatMap<UsageEntry>((e) => {
    if (typeof e !== "object" || e === null) return [];
    const o = e as Record<string, unknown>;
    const stage = o['stage'];
    return [
      {
        at: num(o['at']) || Date.now(),
        provider: String(o['provider'] ?? "unknown"),
        model: String(o['model'] ?? ""),
        stage: stage === "perception" || stage === "chat" ? stage : "thinking",
        inputTokens: num(o['inputTokens']),
        outputTokens: num(o['outputTokens']),
      },
    ];
  });
  return { entries: entries.slice(-2000) };
}

export async function loadUsage(): Promise<UsageLedger> {
  return normalize(await idbGet<unknown>(STORES.SETTINGS, KEY));
}

/** Appends one AI call to the ledger. Never throws — usage must not break mining. */
export async function recordUsage(entry: Omit<UsageEntry, "at">): Promise<void> {
  try {
    // A call with no reported token counts still spent one AI credit, so it
    // is recorded — only nonsense (negative) input is dropped by `num()`.

    const ledger = await loadUsage();
    const next: UsageLedger = { entries: [...ledger.entries, { at: Date.now(), ...entry }].slice(-2000) };
    await idbSet(STORES.SETTINGS, KEY, next);
  } catch {
    /* usage tracking is best-effort */
  }
}

export async function clearUsage(): Promise<void> {
  await idbSet(STORES.SETTINGS, KEY, { entries: [] });
}

/** Reads token counts out of any provider's response shape. */
export function readTokens(data: unknown): { inputTokens: number; outputTokens: number } {
  const d = (data ?? {}) as Record<string, unknown>;
  const gem = d['usageMetadata'] as Record<string, unknown> | undefined;
  if (gem) {
    return {
      inputTokens: num(gem['promptTokenCount']),
      outputTokens: num(gem['candidatesTokenCount']) + num(gem['thoughtsTokenCount']),
    };
  }
  const oa = d['usage'] as Record<string, unknown> | undefined;
  if (oa) {
    return {
      inputTokens: num(oa['prompt_tokens']) || num(oa['input_tokens']),
      outputTokens: num(oa['completion_tokens']) || num(oa['output_tokens']),
    };
  }
  return { inputTokens: 0, outputTokens: 0 };
}

export function costOf(entry: UsageEntry): number {
  const r = rateFor(entry.provider);
  return (entry.inputTokens / 1e6) * r.input + (entry.outputTokens / 1e6) * r.output;
}

export type ProviderUsage = {
  provider: string;
  label: string;
  free: boolean;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  todayTokens: number;
  dailyFreeTokens: number;
  remainingToday: number;
  cost: number;
};

export type UsageSummary = {
  providers: ProviderUsage[];
  totalCalls: number;
  totalTokens: number;
  todayTokens: number;
  totalFreeTokens: number;
  remainingFreeToday: number;
  totalCost: number;
  todayCost: number;
  lastCallAt: number | null;
};

function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function summarizeUsage(ledger: UsageLedger, now = Date.now()): UsageSummary {
  const dayStart = startOfDay(now);
  const byProvider = new Map<string, ProviderUsage>();
  let totalCost = 0;
  let todayCost = 0;
  let lastCallAt: number | null = null;

  for (const e of ledger.entries) {
    const r = rateFor(e.provider);
    const row =
      byProvider.get(e.provider) ??
      {
        provider: e.provider,
        label: r.label,
        free: r.free,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        todayTokens: 0,
        dailyFreeTokens: r.dailyFreeTokens,
        remainingToday: r.dailyFreeTokens,
        cost: 0,
      };
    const cost = costOf(e);
    row.calls += 1;
    row.inputTokens += e.inputTokens;
    row.outputTokens += e.outputTokens;
    row.totalTokens += e.inputTokens + e.outputTokens;
    row.cost += cost;
    if (e.at >= dayStart) {
      row.todayTokens += e.inputTokens + e.outputTokens;
      todayCost += cost;
    }
    row.remainingToday = Math.max(0, r.dailyFreeTokens - row.todayTokens);
    totalCost += cost;
    lastCallAt = lastCallAt === null ? e.at : Math.max(lastCallAt, e.at);
    byProvider.set(e.provider, row);
  }

  const providers = [...byProvider.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  return {
    providers,
    totalCalls: providers.reduce((n, p) => n + p.calls, 0),
    totalTokens: providers.reduce((n, p) => n + p.totalTokens, 0),
    todayTokens: providers.reduce((n, p) => n + p.todayTokens, 0),
    totalFreeTokens: providers.reduce((n, p) => n + p.dailyFreeTokens, 0),
    remainingFreeToday: providers.reduce((n, p) => n + p.remainingToday, 0),
    totalCost,
    todayCost,
    lastCallAt,
  };
}
