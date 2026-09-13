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
    en: { title: "Knowledge Mind", sub: "Answers questions using what you said in your videos" },
    mn: { title: "Мэдлэгийн Оюун", sub: "Видеон дээрх яриандаа тулгуурлан асуултад хариулна" },
    ko: { title: "지식 마인드", sub: "영상에서 말한 내용을 바탕으로 질문에 답합니다" },
  },
  robot: {
    en: { title: "Robot Brain", sub: "Learns movement, grasping and space from your videos" },
    mn: { title: "Роботын Тархи", sub: "Видеонээс хөдөлгөөн, барих, орон зайг сурна" },
    ko: { title: "로봇 브레인", sub: "영상에서 움직임, 잡기, 공간을 배웁니다" },
  },
  voice: {
    en: { title: "Voice Agent", sub: "Talks with people in your voice" },
    mn: { title: "Дуут Агент", sub: "Таны дуу хоолойгоор хүмүүстэй ярина" },
    ko: { title: "보이스 에이전트", sub: "당신의 목소리로 사람들과 대화합니다" },
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
