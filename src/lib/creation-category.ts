/**
 * Creation categories used by the unified "+" Create hub. The chosen category
 * drives which extraction schema the mining engine enforces.
 */
export type CreationCategory = "knowledge" | "robot" | "voice" | "sales" | "gaming";

export const CREATION_KEY = "evermind.creationCategory";

export const CATEGORY_LABELS: Record<
  CreationCategory,
  { en: { title: string; sub: string }; mn: { title: string; sub: string }; ko: { title: string; sub: string } }
> = {
  knowledge: {
    en: { title: "AI Assistant / Knowledge Mind", sub: "Text & Q&A clone mined from your videos" },
    mn: { title: "AI Туслах / Мэдлэгийн Оюун", sub: "Видеонээс мянган асуулт-хариултын клон" },
    ko: { title: "AI 어시스턴트 / 지식 마인드", sub: "영상에서 추출한 Q&A 클론" },
  },
  robot: {
    en: { title: "Robot Brain / Embodied VLA", sub: "Spatial trajectories, 3D grasp & ROS 2 OTA package" },
    mn: { title: "Роботын Тархи / Биетэй VLA", sub: "Орон зайн траектор, 3D атгалт, ROS 2 багц" },
    ko: { title: "로봇 브레인 / 임보디드 VLA", sub: "공간 궤적, 3D 그립, ROS 2 패키지" },
  },
  voice: {
    en: { title: "Voice Calling Agent", sub: "Real-time voice-to-voice interaction" },
    mn: { title: "Дуут Дуудлагын Агент", sub: "Бодит цагийн дуу хоолойн харилцаа" },
    ko: { title: "음성 통화 에이전트", sub: "실시간 음성 대 음성 상호작용" },
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
    ko: {
      title: "제품 및 서비스 세일즈 마인드",
      sub: "프로모션, 제품 소개, 자동 세일즈 에이전트",
    },
  },
  gaming: {
    en: {
      title: "Gaming Mind / Player Clone",
      sub: "Skills, tactics & a Minecraft coach and teammate mined from gameplay",
    },
    mn: {
      title: "Тоглоомын Оюун / Тоглогчийн Клон",
      sub: "Тоглолтын бичлэгээс чадвар, тактик, дасгалжуулагч болон Minecraft хамтрагч",
    },
    ko: {
      title: "게이밍 마인드 / 플레이어 클론",
      sub: "게임플레이 영상에서 배우는 실력, 전술, 마인크래프트 코치와 팀메이트",
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
    return v === "knowledge" || v === "robot" || v === "voice" || v === "sales" || v === "gaming" ? v : "knowledge";
  } catch {
    return "knowledge";
  }
}
