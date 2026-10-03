/**
 * Service capabilities a creator can enable per Mind. The feed only renders the
 * action buttons for capabilities that are actually enabled.
 */
import type { CreationCategory } from "./creation-category";

export type Capability = "chat" | "voice" | "video" | "robot" | "asset" | "coach" | "game";

/** Default capability set implied by the creation category. */
export const CATEGORY_CAPABILITIES: Record<CreationCategory, Capability[]> = {
  knowledge: ["chat", "asset"],
  robot: ["chat", "robot", "asset"],
  voice: ["chat", "voice", "video"],
  sales: ["chat", "voice", "asset"],
  gaming: ["chat", "voice", "coach", "game", "asset"],
  movement: ["chat", "voice", "coach", "asset"],
};

export const CAPABILITY_LABELS: Record<Capability, { en: string; mn: string }> = {
  chat: { en: "Text Chat", mn: "Бичвэр чат" },
  voice: { en: "Voice Call", mn: "Дуут дуудлага" },
  video: { en: "Video Call AI", mn: "Видео дуудлага" },
  robot: { en: "Robot Brain", mn: "Роботын тархи" },
  asset: { en: "Files & Assets", mn: "Файл, хөрөнгө" },
  coach: { en: "Gameplay Coach", mn: "Тоглолтын дасгалжуулагч" },
  game: { en: "Minecraft Teammate", mn: "Minecraft хамтрагч" },
};

/** Capabilities available for a feed item, honouring explicit creator overrides. */
export function capabilitiesFor(
  category: CreationCategory,
  explicit?: Capability[] | null,
): Capability[] {
  if (explicit && explicit.length) return explicit;
  return CATEGORY_CAPABILITIES[category] ?? CATEGORY_CAPABILITIES.knowledge;
}

/** The post-purchase primary action for a category. */
export function primaryActionFor(category: CreationCategory): {
  capability: Capability;
  en: string;
  mn: string;
} {
  switch (category) {
    case "robot":
      return { capability: "robot", en: "Deploy to Robot", mn: "Робот руу байршуулах" };
    case "voice":
      return { capability: "voice", en: "Start Voice Call", mn: "Дуут дуудлага эхлүүлэх" };
    case "gaming":
      return { capability: "game", en: "Deploy Teammate", mn: "Хамтрагчийг байршуулах" };
    default:
      return { capability: "asset", en: "Access Vault", mn: "Сан руу нэвтрэх" };
  }
}
