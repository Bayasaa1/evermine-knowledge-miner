/**
 * Who runs what.
 *
 * Every AI job in Evermind (translating, mining a video, cloning a voice,
 * watching a face on a call, building the core brain, answering in chat) can be
 * pointed at one of the user's own saved keys. Nothing here ever reaches for a
 * platform key: a role with no choice simply uses the newest saved key that can
 * do that job.
 */

export type AiRole = "translate" | "mine" | "voice_clone" | "face_clone" | "core_brain" | "chat";

export const AI_ROLES: AiRole[] = [
  "translate",
  "mine",
  "core_brain",
  "chat",
  "voice_clone",
  "face_clone",
];

/** Providers that can actually do the job. Only these are offered for a role. */
export const ROLE_PROVIDERS: Record<AiRole, string[]> = {
  translate: ["gemini"],
  mine: ["gemini"],
  core_brain: ["gemini"],
  chat: ["gemini", "openai", "anthropic", "deepseek"],
  voice_clone: ["elevenlabs"],
  face_clone: ["gemini"],
};

export type RoleCopy = { name: string; hint: string };

export const ROLE_COPY: Record<"en" | "mn" | "ko", Record<AiRole, RoleCopy>> = {
  en: {
    translate: { name: "Translating", hint: "Turns the app and subtitles into your language." },
    mine: { name: "Mining videos", hint: "Watches your videos and writes what it learns." },
    core_brain: { name: "Core brain", hint: "Builds the memory behind each mind." },
    chat: { name: "Chatting", hint: "Answers when someone talks to a mind." },
    voice_clone: { name: "Voice clone", hint: "Speaks in your own cloned voice. Without a key, the free device voice is used." },
    face_clone: { name: "Face on calls", hint: "Looks at the caller on a video call." },
  },
  mn: {
    translate: { name: "Орчуулга", hint: "Аппыг болон хадмалыг таны хэл рүү хөрвүүлнэ." },
    mine: { name: "Видео олборлолт", hint: "Таны видеог үзэж, сурсанаа бичнэ." },
    core_brain: { name: "Үндсэн тархи", hint: "Оюун бүрийн ой санамжийг бүтээнэ." },
    chat: { name: "Чат", hint: "Хүн оюунтай ярихад хариулна." },
    voice_clone: { name: "Дуу хуулбар", hint: "Таны өөрийн дуугаар ярина. Түлхүүргүй бол үнэгүй төхөөрөмжийн дуу." },
    face_clone: { name: "Дуудлагын царай", hint: "Видео дуудлагад ярьж буй хүнийг хардаг." },
  },
  ko: {
    translate: { name: "번역", hint: "앱과 자막을 내 언어로 바꿉니다." },
    mine: { name: "영상 마이닝", hint: "영상을 보고 배운 것을 적습니다." },
    core_brain: { name: "코어 브레인", hint: "각 마인드의 기억을 만듭니다." },
    chat: { name: "채팅", hint: "마인드와 대화할 때 답합니다." },
    voice_clone: { name: "음성 클론", hint: "내 목소리로 말합니다. 키가 없으면 무료 기기 음성을 씁니다." },
    face_clone: { name: "영상통화 얼굴", hint: "영상통화에서 상대를 봅니다." },
  },
};

export const PROVIDER_LABEL: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Claude",
  deepseek: "DeepSeek",
  elevenlabs: "ElevenLabs",
};

export type RoleChoice = { role: AiRole; provider: string; keyTail: string | null };

export function isAiRole(v: unknown): v is AiRole {
  return typeof v === "string" && (AI_ROLES as string[]).includes(v);
}
