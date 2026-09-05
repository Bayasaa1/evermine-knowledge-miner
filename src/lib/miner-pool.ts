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

export type MinerId =
  | "gemini"
  | "claude"
  | "chatgpt"
  | "kimi"
  | "groq"
  | "mistral"
  | "openrouter"
  | "custom";

export type MinerOption = {
  id: MinerId;
  label: string;
  note: string;
  /** Engine-stack key field. Empty means no key is required. */
  keyField: string;
  keyPlaceholder: string;
  /** Where the creator gets an API key. */
  keyUrl: string;
  /** Plain-language steps to obtain the key. */
  guidance: string;
  /** What this AI can mine — shown in the "What you can mine" panel. */
  capability: string;
  /** Honest trade-off of this AI. */
  downside: string;
  /** Per-AI source limits, shown in the "What you can mine" panel. */
  limits: { youtube: string; files: string; langs: string };
  /** OpenAI-compatible base URL used for the key test (empty = provider-specific). */
  baseUrl: string;
  /** Cheap model used for the key test. */
  testModel: string;
};

export const MINERS: MinerOption[] = [
  {
    id: "gemini",
    label: "Gemini",
    note: "Default · reads video natively · free tier, or your own paid key",
    keyField: "GEMINI_API_KEY",
    keyPlaceholder: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
    guidance:
      "Optional. Mining works without a key on the built-in engine. Add your own key from Google AI Studio → Get API key (paid tier) to mine on your own quota — no daily free-tier limits, faster queues. Paid keys bill to your Google account; Evermind adds nothing.",
    capability:
      "Mines video natively: subtitles with timestamps, faces, emotions, voice prints, topics, story beats — the only engine that sees the footage itself.",
    downside: "Free tier has a daily quota; long queues of videos may pause until the quota resets.",
    limits: {
      youtube: "YouTube: public or unlisted links, up to 2 hours.",
      files: "Google Drive / file upload: MP4 or MOV, max 2GB — the video itself is read.",
      langs: "Languages: native recognition for English, Mongolian and all global languages.",
    },
    baseUrl: "",
    testModel: "gemini-2.5-flash",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    note: "OpenAI · reliable extraction",
    keyField: "OPENAI_API_KEY",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
    guidance: "platform.openai.com → API keys → Create new secret key. Requires a paid OpenAI balance.",
    capability: "Mines transcripts and text: subtitles, topics, story summaries and speaking style with very reliable structure.",
    downside: "Cannot read video or faces directly — it works from the transcript Gemini extracts. No free tier.",
    limits: {
      youtube: "YouTube: any length — mined from the transcript, not the picture.",
      files: "File upload: not supported directly — Gemini pulls the transcript first.",
      langs: "Languages: excellent across English, Mongolian and all global languages.",
    },
    baseUrl: "https://api.openai.com/v1",
    testModel: "gpt-4o-mini",
  },
  {
    id: "claude",
    label: "Claude",
    note: "Anthropic · deepest reasoning",
    keyField: "ANTHROPIC_API_KEY",
    keyPlaceholder: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
    guidance: "console.anthropic.com → Settings → API Keys → Create Key. Requires prepaid Anthropic credits.",
    capability: "Best reasoning over transcripts: nuanced beliefs, tone and story analysis, very long videos.",
    downside: "No native video or voice reading — works from transcripts. No free tier.",
    limits: {
      youtube: "YouTube: very long videos and full podcasts, from the transcript.",
      files: "File upload: not supported directly — transcript only, no 2GB video reading.",
      langs: "Languages: strong across English, Mongolian and all global languages.",
    },
    baseUrl: "https://api.anthropic.com",
    testModel: "claude-3-5-haiku-latest",
  },
  {
    id: "kimi",
    label: "Kimi",
    note: "Moonshot · very long context",
    keyField: "MOONSHOT_API_KEY",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    guidance: "platform.moonshot.ai → API Keys → Create. New accounts get free starter credit.",
    capability: "Mines extremely long transcripts in one pass — whole podcasts and 2-hour videos without losing context.",
    downside: "No video, face or emotion reading — transcript text only.",
    limits: {
      youtube: "YouTube: up to full 2-hour podcasts in a single pass, from the transcript.",
      files: "File upload: not supported — transcript only, no video file reading.",
      langs: "Languages: strong Chinese and English; good on Mongolian and other languages.",
    },
    baseUrl: "https://api.moonshot.ai/v1",
    testModel: "kimi-k2-0711-preview",
  },
  {
    id: "groq",
    label: "Groq",
    note: "Fastest · generous free tier",
    keyField: "GROQ_API_KEY",
    keyPlaceholder: "gsk_...",
    keyUrl: "https://console.groq.com/keys",
    guidance: "console.groq.com → API Keys → Create API Key. Completely free tier with high daily limits.",
    capability: "Mines transcripts at extreme speed — subtitles, topics and story come back in seconds. Free tier rivals Gemini.",
    downside: "No video, faces or emotions — text only, and shorter context than Kimi or Claude.",
    limits: {
      youtube: "YouTube: short and medium videos — very fast, from the transcript.",
      files: "File upload: not supported — text only, no video or 2GB uploads.",
      langs: "Languages: good on English; weaker on Mongolian than Gemini.",
    },
    baseUrl: "https://api.groq.com/openai/v1",
    testModel: "llama-3.3-70b-versatile",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    note: "Free experiment tier · European",
    keyField: "MISTRAL_API_KEY",
    keyPlaceholder: "...",
    keyUrl: "https://console.mistral.ai/api-keys",
    guidance: "console.mistral.ai → API keys → Create new key. The free Experiment tier works for mining.",
    capability: "Mines transcripts for free: topics, story and style. Strong multilingual understanding (great for mixed-language videos).",
    downside: "Transcript text only — no video, face or voice reading. Free tier rate limits are modest.",
    limits: {
      youtube: "YouTube: medium-length videos, from the transcript, on the free tier.",
      files: "File upload: not supported — text only, no video or 2GB uploads.",
      langs: "Languages: strong multilingual, including mixed-language videos.",
    },
    baseUrl: "https://api.mistral.ai/v1",
    testModel: "mistral-small-latest",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    note: "One key · many free models",
    keyField: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-...",
    keyUrl: "https://openrouter.ai/keys",
    guidance: "openrouter.ai → Keys → Create Key. Models marked “:free” cost nothing — a free Gemini competitor.",
    capability: "One key unlocks dozens of free models for transcript mining — subtitles, topics and story — easy to switch brains later.",
    downside: "No video or face reading. Free models can be busy and slightly slower at peak times.",
    limits: {
      youtube: "YouTube: length depends on the free model you route to, from the transcript.",
      files: "File upload: not supported — text only, no video or 2GB uploads.",
      langs: "Languages: depends on the model; most free models handle global languages.",
    },
    baseUrl: "https://openrouter.ai/api/v1",
    testModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
  {
    id: "custom",
    label: "Add my own AI",
    note: "Any OpenAI-compatible endpoint",
    keyField: "CUSTOM_AI_API_KEY",
    keyPlaceholder: "your key",
    keyUrl: "",
    guidance: "Point at any OpenAI-compatible endpoint — your own server, Ollama (http://localhost:11434/v1), a company gateway. Enter its key and model name below.",
    capability: "Whatever your endpoint can do — Evermind sends the transcript and your model mines it.",
    downside: "No video, face or emotion reading unless your endpoint supports it. You manage its costs and uptime.",
    limits: {
      youtube: "YouTube: whatever your endpoint accepts — Evermind sends the transcript.",
      files: "File upload: only if your own endpoint supports it.",
      langs: "Languages: whatever your model supports.",
    },
    baseUrl: "",
    testModel: "",
  },
];

/** OpenAI-compatible bases for direct browser key tests. */
const TEST_BASES: Partial<Record<MinerId, string>> = Object.fromEntries(
  MINERS.filter((m) => m.baseUrl).map((m) => [m.id, m.baseUrl]),
);

/**
 * Minimal connectivity test: one tiny chat completion. Throws a readable error
 * when the key is rejected or the endpoint is unreachable.
 */
export async function testMinerKey(choice: MinerChoice, apiKey: string): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error("Add the API key first.");

  if (choice.id === "chatgpt" || choice.id === "kimi" || choice.id === "groq" || choice.id === "mistral" || choice.id === "openrouter") {
    const opt = findMiner(choice.id)!;
    const res = await fetch(`${TEST_BASES[choice.id]}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: opt.testModel,
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
      }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(
        res.status === 401 || res.status === 403
          ? `${opt.label} rejected this key (HTTP ${res.status}). Check it and try again.`
          : `${opt.label} test failed (HTTP ${res.status}). ${detail}`,
      );
    }
    return;
  }

  if (choice.id === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 8,
        messages: [{ role: "user", content: "Reply with exactly: ok" }],
      }),
    });
    if (!res.ok) {
      throw new Error(
        res.status === 401 || res.status === 403
          ? `Claude rejected this key (HTTP ${res.status}). Check it and try again.`
          : `Claude test failed (HTTP ${res.status}).`,
      );
    }
    return;
  }

  if (choice.id === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with exactly: ok" }] }] }),
      },
    );
    if (!res.ok) {
      throw new Error(
        res.status === 400 || res.status === 403
          ? "Gemini rejected this key. Check it and try again."
          : `Gemini test failed (HTTP ${res.status}).`,
      );
    }
    return;
  }

  // Custom OpenAI-compatible endpoint.
  const base = choice.custom.endpoint.trim().replace(/\/+$/, "");
  if (!base) throw new Error("Enter the endpoint URL first.");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: choice.custom.model.trim() || "gpt-4o-mini",
      max_tokens: 8,
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
    }),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "The endpoint rejected this key. Check it and try again."
        : `Endpoint test failed (HTTP ${res.status}). Check the URL and model name.`,
    );
  }
}

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

/**
 * Which AIs are ready to mine right now: a key is stored on this device (or,
 * for Gemini, the Google account is linked). Used to visually separate ready
 * brains from ones that still need setup.
 */
export async function minerReadiness(choice?: MinerChoice): Promise<Record<MinerId, boolean>> {
  const stack = await loadStack();
  const ready = {} as Record<MinerId, boolean>;
  for (const m of MINERS) {
    const key = m.keyField ? !!(stack.keys[m.keyField] ?? "").trim() : false;
    // Gemini mining runs on Evermind's built-in engine — no creator key required.
    if (m.id === "gemini") ready[m.id] = true;
    else if (m.id === "custom") ready[m.id] = key && !!choice?.custom.endpoint.trim() && !!choice?.custom.model.trim();
    else ready[m.id] = key;
  }
  return ready;
}
