/**
 * Creation categories used by the unified "+" Create hub. The chosen category
 * drives which extraction schema the mining engine enforces.
 */
export type CreationCategory = "knowledge" | "robot" | "voice" | "sales";

export const CREATION_KEY = "evermine.creationCategory";

export const CATEGORY_LABELS: Record<
  CreationCategory,
  { en: { title: string; sub: string }; mn: { title: string; sub: string } }
> = {
  knowledge: {
    en: { title: "AI Assistant / Knowledge Mind", sub: "Text & Q&A clone mined from your videos" },
    mn: { title: "AI Туслах / Мэдлэгийн Оюун", sub: "Видеонээс мянган асуулт-хариултын клон" },
  },
  robot: {
    en: { title: "Robot Brain / Embodied VLA", sub: "Spatial trajectories, 3D grasp & ROS 2 OTA package" },
    mn: { title: "Роботын Тархи / Биетэй VLA", sub: "Орон зайн траектор, 3D атгалт, ROS 2 багц" },
  },
  voice: {
    en: { title: "Voice Calling Agent", sub: "Real-time voice-to-voice interaction" },
    mn: { title: "Дуут Дуудлагын Агент", sub: "Бодит цагийн дуу хоолойн харилцаа" },
  },
  sales: {
    en: {
      title: "Product & Service Sales Mind",
      sub: "Promotions, product showcase & an automated sales agent",
    },
    mn: {
      title: "Бүтээгдэхүүн, Үйлчилгээний Борлуулалтын Оюун",
      sub: "Урамшуулал, бүтээгдэхүүний танилцуулга, автомат борлуулагч",
    },
  },
};

export function setCreationCategory(category: CreationCategory): void {
  try {
    localStorage.setItem(CREATION_KEY, category);
  } catch {
    /* ignore */
  }
}

export function getCreationCategory(): CreationCategory {
  try {
    const v = localStorage.getItem(CREATION_KEY);
    return v === "knowledge" || v === "robot" || v === "voice" || v === "sales" ? v : "knowledge";
  } catch {
    return "knowledge";
  }
}
