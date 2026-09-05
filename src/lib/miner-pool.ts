/**
 * The AI pool that powers step 3 of the creator flow.
 *
 * Every AI declares what it can perceive (`senses`): text, image, audio, video.
 * Each of the four creation types offers its own pool of exactly 8 options —
 * 3 free, 4 paid, 1 manual (add your own) — containing only AIs whose senses
 * can do that job. Text-only AIs never appear for Robot Brain, so an
 * impossible job cannot be started.
 *
 * Mining always runs in two stages: a sight-and-sound pass on the built-in
 * Gemini engine (free, no key), then an understanding pass by the AI the
 * creator picked — or, in team mode, by 2–3 thinking AIs whose answers are
 * merged. Keys stay on the device, inside the per-account engine stack.
 */
import { idbGet, idbSet, STORES } from "./store";
import { scopedKey } from "./user-scope";
import { loadStack, saveStack } from "./engines";

export type Sense = "text" | "image" | "audio" | "video";
export type MinerPrice = "free" | "paid" | "manual";

export type MinerId =
  | "gemini"
  | "claude"
  | "chatgpt"
  | "kimi"
  | "groq"
  | "mistral"
  | "openrouter"
  | "gemini-pro"
  | "qwen-vl"
  | "llama-vision"
  | "whisper-groq"
  | "qwen-audio"
  | "custom";

export type MinerOption = {
  id: MinerId;
  label: string;
  note: string;
  /** What this AI can perceive. */
  senses: Sense[];
  /** Free, paid, or the manual "add your own AI" slot. */
  price: MinerPrice;
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
    senses: ["text", "image", "audio", "video"],
    price: "free",
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
    id: "groq",
    label: "Groq",
    note: "Fastest · generous free tier",
    senses: ["text"],
    price: "free",
    keyField: "GROQ_API_KEY",
    keyPlaceholder: "gsk_...",
    keyUrl: "https://console.groq.com/keys",
    guidance: "console.groq.com → API Keys → Create API Key. Completely free tier with high daily limits.",
    capability: "Thinks over the extracted material at extreme speed — topics, story and beliefs come back in seconds. Free tier rivals Gemini.",
    downside: "Cannot see or hear — it reasons over the transcript and emotion notes the built-in engine extracts. Shorter context than Kimi or Claude.",
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
    senses: ["text", "audio"],
    price: "free",
    keyField: "MISTRAL_API_KEY",
    keyPlaceholder: "...",
    keyUrl: "https://console.mistral.ai/api-keys",
    guidance: "console.mistral.ai → API keys → Create new key. The free Experiment tier works for mining.",
    capability: "Thinks over transcripts for free: topics, story and style. Strong multilingual understanding (great for mixed-language videos) and Voxtral audio models.",
    downside: "Cannot see video or faces. Free tier rate limits are modest.",
    limits: {
      youtube: "YouTube: medium-length videos, from the transcript, on the free tier.",
      files: "File upload: not supported — text and audio only, no 2GB video reading.",
      langs: "Languages: strong multilingual, including mixed-language videos.",
    },
    baseUrl: "https://api.mistral.ai/v1",
    testModel: "mistral-small-latest",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    note: "OpenAI · reliable extraction",
    senses: ["text", "image", "audio"],
    price: "paid",
    keyField: "OPENAI_API_KEY",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
    guidance: "platform.openai.com → API keys → Create new secret key. Requires a paid OpenAI balance.",
    capability: "Thinks over transcripts, audio and images: subtitles, topics, story summaries and speaking style with very reliable structure.",
    downside: "Reads video frames only as images — continuous movement and long footage still come from the built-in engine. No free tier.",
    limits: {
      youtube: "YouTube: any length — mined from the transcript, not the picture.",
      files: "File upload: audio and image understanding; full video reading via the built-in engine.",
      langs: "Languages: excellent across English, Mongolian and all global languages.",
    },
    baseUrl: "https://api.openai.com/v1",
    testModel: "gpt-4o-mini",
  },
  {
    id: "claude",
    label: "Claude",
    note: "Anthropic · deepest reasoning",
    senses: ["text", "image"],
    price: "paid",
    keyField: "ANTHROPIC_API_KEY",
    keyPlaceholder: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
    guidance: "console.anthropic.com → Settings → API Keys → Create Key. Requires prepaid Anthropic credits.",
    capability: "Best reasoning over transcripts and frames: nuanced beliefs, tone and story analysis, very long videos.",
    downside: "No audio or continuous video reading — works from transcripts and key frames. No free tier.",
    limits: {
      youtube: "YouTube: very long videos and full podcasts, from the transcript.",
      files: "File upload: transcript and frame analysis, no 2GB video reading.",
      langs: "Languages: strong across English, Mongolian and all global languages.",
    },
    baseUrl: "https://api.anthropic.com",
    testModel: "claude-3-5-haiku-latest",
  },
  {
    id: "kimi",
    label: "Kimi",
    note: "Moonshot · very long context",
    senses: ["text"],
    price: "paid",
    keyField: "MOONSHOT_API_KEY",
    keyPlaceholder: "sk-...",
    keyUrl: "https://platform.moonshot.ai/console/api-keys",
    guidance: "platform.moonshot.ai → API Keys → Create. New accounts get free starter credit.",
    capability: "Thinks over extremely long transcripts in one pass — whole podcasts and 2-hour videos without losing context.",
    downside: "Cannot see or hear — transcript text only.",
    limits: {
      youtube: "YouTube: up to full 2-hour podcasts in a single pass, from the transcript.",
      files: "File upload: not supported — transcript only, no video file reading.",
      langs: "Languages: strong Chinese and English; good on Mongolian and other languages.",
    },
    baseUrl: "https://api.moonshot.ai/v1",
    testModel: "kimi-k2-0711-preview",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    note: "One key · many models",
    senses: ["text", "image", "audio"],
    price: "paid",
    keyField: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-...",
    keyUrl: "https://openrouter.ai/keys",
    guidance: "openrouter.ai → Keys → Create Key. Models marked “:free” cost nothing; paid models unlock vision and audio.",
    capability: "One key unlocks dozens of models — text, vision and audio — easy to switch brains later.",
    downside: "Free models can be busy and slightly slower at peak times; vision and audio models are usually paid.",
    limits: {
      youtube: "YouTube: length depends on the model you route to, from the transcript.",
      files: "File upload: depends on the routed model — text, image or audio.",
      langs: "Languages: depends on the model; most handle global languages.",
    },
    baseUrl: "https://openrouter.ai/api/v1",
    testModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
  {
    id: "gemini-pro",
    label: "Gemini Pro",
    note: "Google paid tier · full senses",
    senses: ["text", "image", "audio", "video"],
    price: "paid",
    keyField: "GEMINI_API_KEY",
    keyPlaceholder: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
    guidance: "aistudio.google.com → Get API key → enable the paid tier in Google AI Studio. Bills to your Google account.",
    capability: "The same full sight and sound as the default engine, on your own paid quota — no daily limits, priority speed.",
    downside: "Bills to your Google account per minute of video; the built-in free engine covers the same senses.",
    limits: {
      youtube: "YouTube: public or unlisted links, up to 2 hours, on paid quota.",
      files: "Google Drive / file upload: MP4 or MOV, max 2GB — the video itself is read.",
      langs: "Languages: native recognition for English, Mongolian and all global languages.",
    },
    baseUrl: "",
    testModel: "gemini-2.5-flash",
  },
  {
    id: "qwen-vl",
    label: "Qwen-VL",
    note: "Free vision via OpenRouter",
    senses: ["text", "image", "video"],
    price: "free",
    keyField: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-...",
    keyUrl: "https://openrouter.ai/keys",
    guidance: "openrouter.ai → Keys → Create Key. The “:free” vision models cost nothing.",
    capability: "Sees video frames for free: object positions, movements and scene structure for Robot Brains — a zero-cost vision option.",
    downside: "Frame-by-frame only — no audio, and free-tier availability varies at peak times.",
    limits: {
      youtube: "YouTube: frame-based analysis from extracted key frames.",
      files: "File upload: key frames and images; no direct 2GB video reading.",
      langs: "Languages: strong English and Chinese; good on other languages.",
    },
    baseUrl: "https://openrouter.ai/api/v1",
    testModel: "qwen/qwen-2.5-vl-7b-instruct:free",
  },
  {
    id: "llama-vision",
    label: "Llama Vision",
    note: "Free vision via OpenRouter",
    senses: ["text", "image", "video"],
    price: "free",
    keyField: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-...",
    keyUrl: "https://openrouter.ai/keys",
    guidance: "openrouter.ai → Keys → Create Key. Llama 3.2 Vision models marked “:free” cost nothing.",
    capability: "Sees video frames for free: object detection, spatial layout and action descriptions for Robot Brains.",
    downside: "Frame-by-frame only — no audio, and smaller context than paid vision models.",
    limits: {
      youtube: "YouTube: frame-based analysis from extracted key frames.",
      files: "File upload: key frames and images; no direct 2GB video reading.",
      langs: "Languages: good English; weaker on Mongolian.",
    },
    baseUrl: "https://openrouter.ai/api/v1",
    testModel: "meta-llama/llama-3.2-11b-vision-instruct:free",
  },
  {
    id: "whisper-groq",
    label: "Groq Whisper",
    note: "Free speech recognition",
    senses: ["text", "audio"],
    price: "free",
    keyField: "GROQ_API_KEY",
    keyPlaceholder: "gsk_...",
    keyUrl: "https://console.groq.com/keys",
    guidance: "console.groq.com → API Keys → Create API Key. Whisper transcription on Groq is free and extremely fast.",
    capability: "Hears audio for free: fast Whisper speech recognition and voice-segment analysis for Voice Calling Agents.",
    downside: "Hearing only — no video, faces or images. Needs the built-in engine for anything visual.",
    limits: {
      youtube: "YouTube: audio track transcription at high speed.",
      files: "File upload: audio understanding; no video file reading.",
      langs: "Languages: Whisper supports 90+ languages including Mongolian.",
    },
    baseUrl: "https://api.groq.com/openai/v1",
    testModel: "llama-3.1-8b-instant",
  },
  {
    id: "qwen-audio",
    label: "Qwen Audio",
    note: "Audio understanding via OpenRouter",
    senses: ["text", "audio"],
    price: "paid",
    keyField: "OPENROUTER_API_KEY",
    keyPlaceholder: "sk-or-...",
    keyUrl: "https://openrouter.ai/keys",
    guidance: "openrouter.ai → Keys → Create Key. Qwen audio models are billed per use through OpenRouter.",
    capability: "Hears audio deeply: tone, pacing, speaker emotion in the voice itself — strong for Voice Calling Agents.",
    downside: "Hearing only — no video or images. Paid per use.",
    limits: {
      youtube: "YouTube: audio-track analysis per minute billed via OpenRouter.",
      files: "File upload: audio understanding; no video file reading.",
      langs: "Languages: strong English and Chinese; good on other languages.",
    },
    baseUrl: "https://openrouter.ai/api/v1",
    testModel: "qwen/qwen2-audio-7b-instruct",
  },
  {
    id: "custom",
    label: "Add my own AI",
    note: "Any OpenAI-compatible endpoint",
    senses: ["text"],
    price: "manual",
    keyField: "CUSTOM_AI_API_KEY",
    keyPlaceholder: "your key",
    keyUrl: "",
    guidance: "Point at any OpenAI-compatible endpoint — your own server, Ollama (http://localhost:11434/v1), a company gateway. Enter its key and model name below, and tick what it can perceive.",
    capability: "Whatever your endpoint can do — Evermind sends the material your AI can perceive and your model mines it.",
    downside: "Video, face, audio or emotion reading only if your endpoint supports it. You manage its costs and uptime.",
    limits: {
      youtube: "YouTube: whatever your endpoint accepts — Evermind sends the transcript.",
      files: "File upload: only if your own endpoint supports it.",
      langs: "Languages: whatever your model supports.",
    },
    baseUrl: "",
    testModel: "",
  },
];

/**
 * The pool of exactly 8 options per creation type: 3 free, 4 paid, 1 manual.
 * Only AIs whose senses can do the job are listed — text-only AIs never
 * appear for Robot Brain, so an impossible job cannot be started.
 */
const CATEGORY_POOLS: Record<string, MinerId[]> = {
  knowledge: ["gemini", "groq", "mistral", "chatgpt", "claude", "kimi", "openrouter", "custom"],
  sales: ["gemini", "groq", "mistral", "chatgpt", "claude", "kimi", "openrouter", "custom"],
  robot: ["gemini", "qwen-vl", "llama-vision", "chatgpt", "claude", "gemini-pro", "openrouter", "custom"],
  voice: ["gemini", "whisper-groq", "mistral", "chatgpt", "qwen-audio", "gemini-pro", "openrouter", "custom"],
};

/** Which senses a creation type needs from its AIs. */
const CATEGORY_SENSES: Record<string, Sense[]> = {
  knowledge: ["text"],
  sales: ["text", "image"],
  robot: ["video"],
  voice: ["audio"],
};

/** The 8-option pool for a creation type, ordered free → paid → manual. */
export function minersForCategory(category: string): MinerOption[] {
  const ids = CATEGORY_POOLS[category] ?? CATEGORY_POOLS.knowledge!;
  return ids.map((id) => MINERS.find((m) => m.id === id)!).filter(Boolean);
}

/** Senses the active creation type needs (used for the panel and manual AIs). */
export function sensesForCategory(category: string): Sense[] {
  return CATEGORY_SENSES[category] ?? ["text"];
}

/** Team mode (2–3 thinking AIs) is offered for reasoning-heavy types. */
export function isTeamEligible(category: string): boolean {
  return category === "knowledge" || category === "sales";
}

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
  const opt = findMiner(choice.id);

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

  if (choice.id === "gemini" || choice.id === "gemini-pro") {
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

  if (choice.id === "custom") {
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
    return;
  }

  // Every other provider exposes an OpenAI-compatible chat endpoint.
  const base = TEST_BASES[choice.id];
  if (!base || !opt) throw new Error("This AI does not need a key.");
  const res = await fetch(`${base}/chat/completions`, {
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
}

export type CustomMiner = { label: string; endpoint: string; model: string; senses: Sense[] };

export type MinerChoice = {
  id: MinerId;
  custom: CustomMiner;
  /** Team mode: 2–3 thinking AIs whose answers are merged (knowledge/sales). */
  team: MinerId[];
};

export const DEFAULT_MINER: MinerChoice = {
  id: "gemini",
  custom: { label: "", endpoint: "", model: "", senses: ["text"] },
  team: [],
};

const MINER_KEY = () => scopedKey("miner-choice");

export function findMiner(id: string | undefined): MinerOption | undefined {
  return MINERS.find((m) => m.id === id);
}

const VALID_SENSES = new Set<Sense>(["text", "image", "audio", "video"]);

export async function loadMinerChoice(): Promise<MinerChoice> {
  const raw = await idbGet<unknown>(STORES.SETTINGS, MINER_KEY());
  if (typeof raw !== "object" || raw === null) return DEFAULT_MINER;
  const v = raw as Record<string, unknown>;
  const c = (v['custom'] ?? {}) as Record<string, unknown>;
  const senses = Array.isArray(c['senses'])
    ? (c['senses'].filter((s): s is Sense => VALID_SENSES.has(s as Sense)) as Sense[])
    : ["text" as Sense];
  const team = Array.isArray(v['team'])
    ? (v['team'].filter((id): id is MinerId => typeof id === "string" && !!findMiner(id)) as MinerId[]).slice(0, 3)
    : [];
  return {
    id: findMiner(typeof v['id'] === "string" ? v['id'] : "")?.id ?? "gemini",
    custom: {
      label: typeof c['label'] === "string" ? c['label'] : "",
      endpoint: typeof c['endpoint'] === "string" ? c['endpoint'] : "",
      model: typeof c['model'] === "string" ? c['model'] : "",
      senses: senses.length ? senses : ["text"],
    },
    team,
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
 * for the built-in Gemini engine, always). Used to visually separate ready
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
