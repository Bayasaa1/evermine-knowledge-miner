/**
 * Flexible API engine routing. Users and creators pick the engine stack that powers
 * their clone (brain / voice / avatar). Free-tier engines cost nothing; premium
 * engines are billed at the provider's raw list price with no platform markup, or
 * run entirely on the user's own API key (BYO).
 */
import { idbGet, idbSet, idbDelete, STORES } from "./store";
import { scopedKey } from "./user-scope";

export type EngineSlot = "llm" | "tts" | "avatar";
export type EngineTier = "free" | "premium";

export type Engine = {
  id: string;
  slot: EngineSlot;
  name: string;
  vendor: string;
  tier: EngineTier;
  /** What the provider charges. Passed through at cost — the platform adds nothing. */
  rawPrice: string;
  /** Unit price used for the cost estimator, in USD. */
  unitCost: number;
  unitLabel: string;
  note: string;
  /** Provider key name when running BYO. Empty for free engines that need no key. */
  keyField: string;
};

export const ENGINES: Engine[] = [
  // Brain
  {
    id: "oss-llama",
    slot: "llm",
    name: "Open-source LLM (Llama 3.1 8B)",
    vendor: "Community",
    tier: "free",
    rawPrice: "$0.00",
    unitCost: 0,
    unitLabel: "per 1K tokens",
    note: "Runs on the shared free tier. Good enough for chat, slower on long reasoning.",
    keyField: "",
  },
  {
    id: "gemini-flash",
    slot: "llm",
    name: "Gemini 2.5 Flash",
    vendor: "Google",
    tier: "premium",
    rawPrice: "$0.30 / 1M input tokens",
    unitCost: 0.0003,
    unitLabel: "per 1K tokens",
    note: "Fast, free-tier compatible. The only engine that mines video files directly.",
    keyField: "GEMINI_API_KEY",
  },
  {
    id: "openai-gpt4o",
    slot: "llm",
    name: "OpenAI GPT-4o",
    vendor: "OpenAI",
    tier: "premium",
    rawPrice: "$2.50 / 1M input tokens",
    unitCost: 0.0025,
    unitLabel: "per 1K tokens",
    note: "Industry standard flagship. Highly reliable answers and extraction.",
    keyField: "OPENAI_API_KEY",
  },
  {
    id: "openai-gpt4o-mini",
    slot: "llm",
    name: "OpenAI GPT-4o mini",
    vendor: "OpenAI",
    tier: "premium",
    rawPrice: "$0.15 / 1M input tokens",
    unitCost: 0.00015,
    unitLabel: "per 1K tokens",
    note: "The cheap workhorse of the GPT line. Great default for high-volume chat.",
    keyField: "OPENAI_API_KEY",
  },
  {
    id: "claude-sonnet",
    slot: "llm",
    name: "Claude 3.5 Sonnet",
    vendor: "Anthropic",
    tier: "premium",
    rawPrice: "$3.00 / 1M input tokens",
    unitCost: 0.003,
    unitLabel: "per 1K tokens",
    note: "Advanced reasoning and nuanced knowledge extraction.",
    keyField: "ANTHROPIC_API_KEY",
  },
  {
    id: "deepseek-v3",
    slot: "llm",
    name: "DeepSeek-V3",
    vendor: "DeepSeek",
    tier: "premium",
    rawPrice: "$0.27 / 1M input tokens",
    unitCost: 0.00027,
    unitLabel: "per 1K tokens",
    note: "Ultra low-cost with near-flagship performance.",
    keyField: "DEEPSEEK_API_KEY",
  },
  {
    id: "deepseek-r1",
    slot: "llm",
    name: "DeepSeek-R1",
    vendor: "DeepSeek",
    tier: "premium",
    rawPrice: "$0.55 / 1M input tokens",
    unitCost: 0.00055,
    unitLabel: "per 1K tokens",
    note: "Reasoning model that thinks step-by-step before answering.",
    keyField: "DEEPSEEK_API_KEY",
  },
  {
    id: "higgsfield-brain",
    slot: "llm",
    name: "Higgsfield Persona",
    vendor: "Higgsfield",
    tier: "premium",
    rawPrice: "$0.02 / 1K tokens",
    unitCost: 0.02,
    unitLabel: "per 1K tokens",
    note: "Persona-tuned generation for cinematic clone behaviour.",
    keyField: "HIGGSFIELD_API_KEY",
  },
  // Voice
  {
    id: "edge-tts",
    slot: "tts",
    name: "Edge TTS",
    vendor: "Microsoft Edge",
    tier: "free",
    rawPrice: "$0.00",
    unitCost: 0,
    unitLabel: "per 1K characters",
    note: "Browser-native neural voices. No key, no cost, no cloning.",
    keyField: "",
  },
  {
    id: "elevenlabs",
    slot: "tts",
    name: "ElevenLabs Voice Clone",
    vendor: "ElevenLabs",
    tier: "premium",
    rawPrice: "$0.18 / 1K characters",
    unitCost: 0.18,
    unitLabel: "per 1K characters",
    note: "True voice cloning with the owner's timbre and accent across languages.",
    keyField: "ELEVENLABS_API_KEY",
  },
  // Avatar
  {
    id: "webgl-avatar",
    slot: "avatar",
    name: "WebGL audio-reactive avatar",
    vendor: "Evermind",
    tier: "free",
    rawPrice: "$0.00",
    unitCost: 0,
    unitLabel: "per call minute",
    note: "Renders on device from the live waveform. Zero bandwidth cost.",
    keyField: "",
  },
  {
    id: "tavus",
    slot: "avatar",
    name: "Tavus Video Avatar",
    vendor: "Tavus",
    tier: "premium",
    rawPrice: "$0.35 / call minute",
    unitCost: 0.35,
    unitLabel: "per call minute",
    note: "Photoreal video clone with real-time lip-sync.",
    keyField: "TAVUS_API_KEY",
  },
];

export const SLOT_ORDER: EngineSlot[] = ["llm", "tts", "avatar"];

export function enginesFor(slot: EngineSlot): Engine[] {
  return ENGINES.filter((e) => e.slot === slot);
}

export function findEngine(id: string): Engine | undefined {
  return ENGINES.find((e) => e.id === id);
}

/** "byo" = the user's own provider key; "passthrough" = billed at raw provider cost. */
export type BillingMode = "byo" | "passthrough";

export type EngineStack = {
  llm: string;
  tts: string;
  avatar: string;
  billing: BillingMode;
  /** Provider keys, stored on this device only and never uploaded. */
  keys: Record<string, string>;
};

/**
 * Default stack for newly onboarded creators: Gemini 2.5 Flash on the free tier.
 * With no BYO key the chat API automatically falls back to the central
 * GEMINI_API_KEY backend secret, so creators hit zero paywalls and zero key setup.
 */
export function freeStack(): EngineStack {
  return { llm: "gemini-flash", tts: "edge-tts", avatar: "webgl-avatar", billing: "byo", keys: {} };
}

export function normalizeStack(raw: unknown): EngineStack {
  const base = freeStack();
  if (typeof raw !== "object" || raw === null) return base;
  const v = raw as Record<string, unknown>;
  const pick = (slot: EngineSlot, fallback: string) => {
    const id = v[slot];
    return typeof id === "string" && findEngine(id)?.slot === slot ? id : fallback;
  };
  const keys: Record<string, string> = {};
  if (typeof v['keys'] === "object" && v['keys'] !== null) {
    for (const [k, val] of Object.entries(v['keys'] as Record<string, unknown>)) {
      if (typeof val === "string" && val.trim()) keys[k] = val.trim();
    }
  }
  return {
    llm: pick("llm", base.llm),
    tts: pick("tts", base.tts),
    avatar: pick("avatar", base.avatar),
    billing: v['billing'] === "passthrough" ? "passthrough" : "byo",
    keys,
  };
}

export function stackEngines(stack: EngineStack): Engine[] {
  return SLOT_ORDER.map((s) => findEngine(stack[s])).filter((e): e is Engine => !!e);
}

/** Premium engines in the stack that still need a key when running BYO. */
export function missingKeys(stack: EngineStack): Engine[] {
  if (stack.billing !== "byo") return [];
  return stackEngines(stack).filter((e) => e.keyField && !stack.keys[e.keyField]);
}

export type CostEstimate = { hourly: number; free: boolean; lines: { engine: Engine; cost: number }[] };

/**
 * Raw provider cost of one hour of conversation, at pass-through prices.
 * Assumes ~9K tokens, ~6K spoken characters and 60 avatar minutes per hour.
 */
export function estimateHourlyCost(stack: EngineStack): CostEstimate {
  const usage: Record<EngineSlot, number> = { llm: 9, tts: 6, avatar: 60 };
  const lines = stackEngines(stack).map((engine) => ({
    engine,
    cost: Math.round(engine.unitCost * usage[engine.slot] * 100) / 100,
  }));
  const hourly = Math.round(lines.reduce((sum, l) => sum + l.cost, 0) * 100) / 100;
  return { hourly, free: hourly === 0, lines };
}

/** Maps an LLM engine id to the provider + concrete model it routes to. */
export const ENGINE_BRAIN_MAP: Record<string, { provider: "gemini" | "openai" | "anthropic" | "deepseek"; model: string }> = {
  "gemini-flash": { provider: "gemini", model: "gemini-2.5-flash" },
  "openai-gpt4o": { provider: "openai", model: "gpt-4o" },
  "openai-gpt4o-mini": { provider: "openai", model: "gpt-4o-mini" },
  "claude-sonnet": { provider: "anthropic", model: "claude-3-5-sonnet-latest" },
  "deepseek-v3": { provider: "deepseek", model: "deepseek-chat" },
  "deepseek-r1": { provider: "deepseek", model: "deepseek-reasoner" },
};

export type BrainRoute = { provider: "gemini" | "openai" | "anthropic" | "deepseek"; model: string; apiKey: string } | null;

/**
 * Resolves the brain engine selected in the stack to a concrete provider route.
 * Returns null for engines without a direct provider route (free/shared tiers),
 * meaning "use the platform default backend".
 */
export function brainEngineRoute(stack: EngineStack): BrainRoute {
  const route = ENGINE_BRAIN_MAP[stack.llm];
  if (!route) return null;
  const engine = findEngine(stack.llm);
  const apiKey = engine?.keyField ? (stack.keys[engine.keyField] ?? "") : "";
  return { ...route, apiKey };
}

/**
 * Engine stacks (including BYO API keys) are strictly per-account: the storage key
 * carries the signed-in user id, so a second account on the same browser can never
 * read the first account's keys.
 */
const STACK_KEY = () => scopedKey("engine-stack");
/** Legacy un-scoped record from before per-account isolation. Never read, only purged. */
const LEGACY_STACK_KEY = "engine-stack";

export async function loadStack(): Promise<EngineStack> {
  // Wait until the signed-in account is known, otherwise a page reload reads the
  // signed-out vault and the creator's saved API keys look lost.
  await whenScopeReady();
  const key = STACK_KEY();
  const own = await idbGet<unknown>(STORES.SETTINGS, key);
  if (own) return normalizeStack(own);
  // Keys typed before the session finished restoring landed in the signed-out
  // vault — adopt them once, then keep them with the account.
  if (key !== "anon:engine-stack") {
    const pending = await idbGet<unknown>(STORES.SETTINGS, "anon:engine-stack");
    if (pending) {
      const adopted = normalizeStack(pending);
      await idbSet(STORES.SETTINGS, key, adopted);
      await idbDelete(STORES.SETTINGS, "anon:engine-stack");
      return adopted;
    }
  }
  return normalizeStack(null);
}

export async function saveStack(stack: EngineStack): Promise<void> {
  await whenScopeReady();
  await idbSet(STORES.SETTINGS, STACK_KEY(), stack);
}

/** Removes the current account's engine stack + keys from this device. */
export async function clearStack(): Promise<void> {
  await idbDelete(STORES.SETTINGS, STACK_KEY());
}

/** One-time purge of the shared, un-scoped stack that leaked keys across accounts. */
export async function purgeLegacyStack(): Promise<void> {
  await idbDelete(STORES.SETTINGS, LEGACY_STACK_KEY);
}
