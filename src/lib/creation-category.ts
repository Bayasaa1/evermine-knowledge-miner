/**
 * Creation categories used by the unified "+" Create hub. The chosen category
 * drives which extraction schema the mining engine enforces.
 *
 * "voice" is legacy: it is no longer offered as a choice. Minds already made
 * that way keep working and are read as Knowledge Minds (voice is a feature of
 * the other types, not a type of its own).
 */
export type CreationCategory = "knowledge" | "robot" | "voice" | "sales" | "gaming";

/** The choices a creator can actually pick today. */
export const ACTIVE_CATEGORIES: CreationCategory[] = ["knowledge", "robot", "sales", "gaming"];

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
      title: "Sales Mind",
      sub: "Shows your products and answers buyers for you",
    },
    mn: {
      title: "Борлуулалтын Оюун",
      sub: "Бүтээгдэхүүнээ танилцуулж, худалдан авагчдад хариулна",
    },
    ko: {
      title: "세일즈 마인드",
      sub: "제품을 소개하고 구매자에게 대신 답합니다",
    },
  },
  gaming: {
    en: {
      title: "Gaming Mind",
      sub: "Plays and coaches the way you play",
    },
    mn: {
      title: "Тоглоомын Оюун",
      sub: "Таны тоглодог шиг тоглож, зааж өгнө",
    },
    ko: {
      title: "게이밍 마인드",
      sub: "당신이 하는 방식대로 플레이하고 코치합니다",
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
    // Legacy "voice" picks become Knowledge Minds — voice still works on them.
    return v === "knowledge" || v === "robot" || v === "sales" || v === "gaming" ? v : "knowledge";
  } catch {
    return "knowledge";
  }
}
