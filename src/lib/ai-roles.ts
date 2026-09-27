/**
 * Who runs what.
 *
 * Every AI job in Evermind (translating, mining a video, cloning a voice,
 * watching a face on a call, building the core brain, answering in chat) can be
 * pointed at one of the user's own saved keys. Nothing here ever reaches for a
 * platform key: a role with no choice simply uses the newest saved key that can
 * do that job.
 */

export type AiRole = "translate" | "mine" | "mine_write" | "voice_clone" | "face_clone" | "core_brain" | "chat";

export const AI_ROLES: AiRole[] = [
  "translate",
  "mine",
  "mine_write",
  "core_brain",
  "chat",
  "voice_clone",
  "face_clone",
];

/** Providers that can actually do the job. Only these are offered for a role. */
export const ROLE_PROVIDERS: Record<AiRole, string[]> = {
  translate: ["gemini", "groq", "mistral", "cerebras", "together", "github", "openrouter", "openai", "anthropic", "moonshot", "deepseek", "xai", "perplexity", "cohere", "custom"],
  mine: ["gemini"],
  mine_write: ["gemini", "groq", "mistral", "cerebras", "together", "github", "openrouter", "openai", "anthropic", "moonshot", "deepseek", "xai", "perplexity", "cohere", "custom"],
  core_brain: ["gemini", "groq", "mistral", "cerebras", "together", "github", "openrouter", "openai", "anthropic", "moonshot", "deepseek", "xai", "perplexity", "cohere", "custom"],
  chat: ["gemini", "groq", "mistral", "cerebras", "together", "github", "openrouter", "openai", "anthropic", "moonshot", "deepseek", "xai", "perplexity", "cohere", "custom"],
  voice_clone: ["elevenlabs"],
  face_clone: ["gemini"],
};

export type RoleCopy = { name: string; hint: string };

export const ROLE_COPY: Record<"en" | "mn" | "ko", Record<AiRole, RoleCopy>> = {
  en: {
    translate: { name: "Translating", hint: "Turns the app and subtitles into your language." },
    mine: { name: "Mining videos", hint: "Watches your videos and writes what it learns." },
    mine_write: { name: "Mining — writing up", hint: "Turns the watched video notes into organized knowledge." },
    core_brain: { name: "Core brain", hint: "Builds the memory behind each mind." },
    chat: { name: "Chatting", hint: "Answers when someone talks to a mind." },
    voice_clone: { name: "Voice clone", hint: "Speaks in your own cloned voice. Without a key, the free device voice is used." },
    face_clone: { name: "Seeing on video calls", hint: "Reads camera frames. Gemini does not clone a face." },
  },
  mn: {
    translate: { name: "Орчуулга", hint: "Аппыг болон хадмалыг таны хэл рүү хөрвүүлнэ." },
    mine: { name: "Видео олборлолт", hint: "Таны видеог үзэж, сурсанаа бичнэ." },
    mine_write: { name: "Олборлолт — бичиж цэгцлэх", hint: "Үзсэн видеоны тэмдэглэлийг эмхэлсэн мэдлэг болгоно." },
    core_brain: { name: "Үндсэн тархи", hint: "Оюун бүрийн ой санамжийг бүтээнэ." },
    chat: { name: "Чат", hint: "Хүн оюунтай ярихад хариулна." },
    voice_clone: { name: "Дуу хуулбар", hint: "Таны өөрийн дуугаар ярина. Түлхүүргүй бол үнэгүй төхөөрөмжийн дуу." },
    face_clone: { name: "Видео дуудлагаар харах", hint: "Камерын зургийг харна. Gemini царай хуулбарлахгүй." },
  },
  ko: {
    translate: { name: "번역", hint: "앱과 자막을 내 언어로 바꿉니다." },
    mine: { name: "영상 마이닝", hint: "영상을 보고 배운 것을 적습니다." },
    mine_write: { name: "마이닝 — 정리 작성", hint: "영상에서 본 내용을 정리된 지식으로 바꿉니다." },
    core_brain: { name: "코어 브레인", hint: "각 마인드의 기억을 만듭니다." },
    chat: { name: "채팅", hint: "마인드와 대화할 때 답합니다." },
    voice_clone: { name: "음성 클론", hint: "내 목소리로 말합니다. 키가 없으면 무료 기기 음성을 씁니다." },
    face_clone: { name: "영상통화 보기", hint: "카메라 화면을 읽습니다. Gemini는 얼굴을 복제하지 않습니다." },
  },
};

export const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Claude",
  deepseek: "DeepSeek",
  elevenlabs: "ElevenLabs",
  groq: "Groq",
  mistral: "Mistral",
  cerebras: "Cerebras",
  together: "Together",
  github: "GitHub Models",
  openrouter: "OpenRouter",
  moonshot: "Kimi",
  xai: "Grok",
  perplexity: "Perplexity",
  cohere: "Cohere",
  custom: "My own AI",
};

export const ROLE_STRENGTH: Record<"en" | "mn" | "ko", Partial<Record<string, string>>> = {
  en: {
    gemini: "Watches video and images; also handles text.",
    groq: "Fast text; strong for translation and write-up.",
    mistral: "Structured text; strong for Core Brain.",
    openrouter: "Uses the model saved with this key; free or paid depends on that model.",
    cerebras: "Fast text when the account has allowance.",
    together: "Open-model text when the account has allowance.",
    elevenlabs: "Voice cloning only.",
  },
  mn: {
    gemini: "Видео, зураг харна; мөн текст ажиллуулна.",
    groq: "Хурдан текст; орчуулга, бичиж цэгцлэхэд сайн.",
    mistral: "Бүтэцтэй текст; Үндсэн тархинд сайн.",
    openrouter: "Хадгалсан загварыг ашиглана; үнэ нь тэр загвараас хамаарна.",
    cerebras: "Эрх үлдсэн үед хурдан текст ажиллуулна.",
    together: "Эрх үлдсэн үед нээлттэй загвар ажиллуулна.",
    elevenlabs: "Зөвхөн дуу хуулбарлана.",
  },
  ko: {
    gemini: "영상과 이미지를 보고 텍스트도 처리합니다.",
    groq: "빠른 텍스트 처리; 번역과 마이닝 정리에 적합합니다.",
    mistral: "구조화된 텍스트; 코어 브레인에 적합합니다.",
    openrouter: "저장한 모델을 사용하며 무료/유료 여부는 모델에 따라 다릅니다.",
    cerebras: "계정 할당량이 남아 있을 때 빠른 텍스트를 제공합니다.",
    together: "계정 할당량이 남아 있을 때 오픈 모델을 사용합니다.",
    elevenlabs: "음성 복제 전용입니다.",
  },
};

export type RoleChoice = { role: AiRole; provider: string; keyTail: string | null; keyId: string | null; autoFallback: boolean; teamKeyIds: string[]; exclusive: boolean };

export function isAiRole(v: unknown): v is AiRole {
  return typeof v === "string" && (AI_ROLES as string[]).includes(v);
}
