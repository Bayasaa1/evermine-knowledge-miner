/**
 * The AI pool that powers step 3 of the creator flow.
 *
 * Gemini is the default miner (the only engine that reads video natively). A
 * creator can switch to another brain, or register an external AI of their own.
 * Keys stay on the device, inside the per-account engine stack, so an AI that
 * was already configured elsewhere in the app is never asked for again.
 */
import { idbGet, idbSet, STORES } from "./store";
import { scopedKey } from "./user-scope";
import { loadStack, saveStack } from "./engines";

export type MinerId = "gemini" | "claude" | "chatgpt" | "kimi" | "groq" | "custom";

export type MinerOption = {
  id: MinerId;
  label: string;
  note: string;
  /** Engine-stack key field. Empty means no key is required. */
  keyField: string;
  keyPlaceholder: string;
};

export const MINERS: MinerOption[] = [
  {
    id: "gemini",
    label: "Gemini",
    note: "Default · reads video natively · free tier",
    keyField: "",
    keyPlaceholder: "",
  },
  { id: "chatgpt", label: "ChatGPT", note: "OpenAI · reliable extraction", keyField: "OPENAI_API_KEY", keyPlaceholder: "sk-..." },
  { id: "claude", label: "Claude", note: "Anthropic · deepest reasoning", keyField: "ANTHROPIC_API_KEY", keyPlaceholder: "sk-ant-..." },
  { id: "kimi", label: "Kimi", note: "Moonshot · very long context", keyField: "MOONSHOT_API_KEY", keyPlaceholder: "sk-..." },
  { id: "groq", label: "Groq", note: "Fastest · low cost", keyField: "GROQ_API_KEY", keyPlaceholder: "gsk_..." },
  { id: "custom", label: "Add my own AI", note: "Any OpenAI-compatible endpoint", keyField: "CUSTOM_AI_API_KEY", keyPlaceholder: "your key" },
];

export type CustomMiner = { label: string; endpoint: string; model: string };

export type MinerChoice = {
  id: MinerId;
  custom: CustomMiner;
};

export const DEFAULT_MINER: MinerChoice = {
  id: "gemini",
  custom: { label: "", endpoint: "", model: "" },
};

const MINER_KEY = () => scopedKey("miner-choice");

export function findMiner(id: string | undefined): MinerOption | undefined {
  return MINERS.find((m) => m.id === id);
}

export async function loadMinerChoice(): Promise<MinerChoice> {
  const raw = await idbGet<unknown>(STORES.SETTINGS, MINER_KEY());
  if (typeof raw !== "object" || raw === null) return DEFAULT_MINER;
  const v = raw as Record<string, unknown>;
  const c = (v['custom'] ?? {}) as Record<string, unknown>;
  return {
    id: findMiner(typeof v['id'] === "string" ? v['id'] : "")?.id ?? "gemini",
    custom: {
      label: typeof c['label'] === "string" ? c['label'] : "",
      endpoint: typeof c['endpoint'] === "string" ? c['endpoint'] : "",
      model: typeof c['model'] === "string" ? c['model'] : "",
    },
  };
}

export async function saveMinerChoice(choice: MinerChoice): Promise<void> {
  await idbSet(STORES.SETTINGS, MINER_KEY(), choice);
}

/** Key already stored for this miner, or "" when the creator still has to add one. */
export async function existingKeyFor(id: MinerId): Promise<string> {
  const field = findMiner(id)?.keyField;
  if (!field) return "";
  const stack = await loadStack();
  return stack.keys[field] ?? "";
}

/** Stores a provider key in the per-account engine stack (device-local). */
export async function storeKeyFor(id: MinerId, value: string): Promise<void> {
  const field = findMiner(id)?.keyField;
  if (!field) return;
  const stack = await loadStack();
  await saveStack({ ...stack, keys: { ...stack.keys, [field]: value.trim() } });
}
