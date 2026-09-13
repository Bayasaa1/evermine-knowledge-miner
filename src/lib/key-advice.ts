/**
 * Which AI to put at #1, what actually helps, and how to keep mining fast —
 * per creation type. Shown above the key list so the guidance matches what the
 * creator chose in step 1.
 *
 * Honest by design: Gemini is the engine that watches and hears the video.
 * Every other provider reasons over the material Gemini extracted.
 */
import type { CreationCategory } from "./creation-category";
import { pickCopy, type Lang } from "./i18n";

export type KeyAdvice = {
  /** Who belongs at #1, and why. */
  first: string;
  /** Extra AIs that genuinely help this creation type. */
  helps: string;
  /** What adds cost or time without adding quality here. */
  skip: string;
  /** Short operational tips. */
  tips: string[];
};

type Trio = { en: KeyAdvice; mn: KeyAdvice; ko: KeyAdvice };

const ADVICE: Record<CreationCategory, Trio> = {
  knowledge: {
    en: {
      first: "Gemini at #1 — it reads the video and writes the Q&A.",
      helps: "Groq or Cerebras at #2 keeps working when Gemini's daily quota ends.",
      skip: "Web-search AIs add cost without improving answers taken from your own video.",
      tips: [
        "Start with one short public video before queueing a playlist.",
        "Extra Gemini keys from the same Google project share the same quota.",
        "Free text AIs are a fallback, not an upgrade — order them after Gemini.",
      ],
    },
    mn: {
      first: "Gemini #1 — видеог уншиж, асуулт-хариултыг бичнэ.",
      helps: "Groq эсвэл Cerebras #2 байвал Gemini-ийн өдрийн хязгаар дуусахад үргэлжилнэ.",
      skip: "Вэб хайлтын AI нэмэлт зардал гаргах ч таны видеоны хариултыг сайжруулахгүй.",
      tips: [
        "Эхлээд нэг богино нийтийн видеогоор турш.",
        "Нэг Google төслийн олон Gemini түлхүүр ижил хязгаартай.",
        "Үнэгүй текст AI нь нөөц, дэвшил биш — Gemini-ийн дараа байрлуул.",
      ],
    },
    ko: {
      first: "Gemini를 #1로 — 영상을 읽고 Q&A를 작성합니다.",
      helps: "Groq 또는 Cerebras를 #2로 두면 Gemini 일일 한도 후에도 계속됩니다.",
      skip: "웹 검색 AI는 비용만 늘고 내 영상 기반 답변을 개선하지 않습니다.",
      tips: [
        "먼저 짧은 공개 영상 하나로 시작하세요.",
        "같은 Google 프로젝트의 Gemini 키는 할당량을 공유합니다.",
        "무료 텍스트 AI는 백업입니다 — Gemini 뒤에 두세요.",
      ],
    },
  },
  robot: {
    en: {
      first: "Gemini at #1 — only it sees motion, depth cues and grasps.",
      helps: "Claude or DeepSeek at #2 turns those frames into cleaner trajectories.",
      skip: "Text-only free AIs cannot see anything; keep them low in the order.",
      tips: [
        "Film steady, well-lit clips — shaky footage produces vague trajectories.",
        "One task per video beats one long video with many tasks.",
        "Check the first result before mining the rest of the set.",
      ],
    },
    mn: {
      first: "Gemini #1 — зөвхөн тэр хөдөлгөөн, гүн, атгалтыг хардаг.",
      helps: "Claude эсвэл DeepSeek #2 бол траекторыг илүү цэвэр болгоно.",
      skip: "Зөвхөн текстийн үнэгүй AI юу ч харахгүй — доор байрлуул.",
      tips: [
        "Тогтвортой, гэрэлтэй бичлэг хий — сэгсрэлт нь бүдэг траектор өгнө.",
        "Нэг видеонд нэг даалгавар байвал илүү.",
        "Эхний үр дүнг шалгаад дараа нь бусдыг олборло.",
      ],
    },
    ko: {
      first: "Gemini를 #1로 — 동작과 깊이, 잡기를 보는 유일한 엔진입니다.",
      helps: "Claude 또는 DeepSeek을 #2로 두면 궤적이 더 깔끔해집니다.",
      skip: "텍스트 전용 무료 AI는 아무것도 보지 못합니다 — 순서를 낮추세요.",
      tips: [
        "흔들림 없는 밝은 영상을 사용하세요.",
        "영상 하나에 작업 하나가 가장 좋습니다.",
        "첫 결과를 확인한 뒤 나머지를 마이닝하세요.",
      ],
    },
  },
  voice: {
    en: {
      first: "Gemini at #1 — it hears tone, pacing and filler words.",
      helps: "Groq at #2 is fast enough for live reply drafting.",
      skip: "Mining voice material is not the same as live calling; a live voice service is separate.",
      tips: [
        "Use clips with clean audio and one speaker.",
        "10–20 minutes of speech is enough to capture a speaking style.",
        "Put your fastest AI second so replies stay quick when Gemini is busy.",
      ],
    },
    mn: {
      first: "Gemini #1 — өнгө аяс, хэмнэл, чимээг сонсдог.",
      helps: "Groq #2 бол шууд хариу бэлтгэхэд хангалттай хурдан.",
      skip: "Дуу хоолойн материал олборлох нь шууд дуудлагатай адилгүй — тэр нь тусдаа үйлчилгээ.",
      tips: [
        "Цэвэр дуутай, нэг хүн ярьсан бичлэг ашигла.",
        "10–20 минутын яриа ярианы хэв маягийг барихад хангалттай.",
        "Хамгийн хурдан AI-гаа хоёрдугаарт тавь.",
      ],
    },
    ko: {
      first: "Gemini를 #1로 — 말투와 속도, 습관어를 듣습니다.",
      helps: "Groq을 #2로 두면 실시간 답변 초안이 빠릅니다.",
      skip: "음성 자료 마이닝과 실시간 통화는 다릅니다 — 통화는 별도 서비스입니다.",
      tips: [
        "깨끗한 오디오, 한 명의 화자 영상을 쓰세요.",
        "10~20분 발화면 말투를 담기에 충분합니다.",
        "가장 빠른 AI를 2번에 두세요.",
      ],
    },
  },
  sales: {
    en: {
      first: "Gemini at #1 — it reads the product on screen, not just the words.",
      helps: "Grok or ChatGPT at #2 writes sharper offers and objection handling.",
      skip: "Very long-context models cost more than they help on short promo clips.",
      tips: [
        "Show the product clearly on camera; prices and specs get picked up.",
        "One product per video keeps the sales answers accurate.",
        "Add a paid AI only after the free chain proves too slow.",
      ],
    },
    mn: {
      first: "Gemini #1 — дэлгэц дээрх бүтээгдэхүүнийг хардаг.",
      helps: "Grok эсвэл ChatGPT #2 бол илүү хурц санал, эсэргүүцлийн хариу бичнэ.",
      skip: "Урт контекст загварууд богино сурталчилгаанд илүү зардалтай.",
      tips: [
        "Бүтээгдэхүүнээ тодорхой үзүүл — үнэ, үзүүлэлт таригдана.",
        "Нэг видеонд нэг бүтээгдэхүүн.",
        "Үнэгүй гинж удаан байж л төлбөртэй AI нэм.",
      ],
    },
    ko: {
      first: "Gemini를 #1로 — 화면 속 제품을 실제로 봅니다.",
      helps: "Grok 또는 ChatGPT를 #2로 두면 제안과 반론 대응이 예리해집니다.",
      skip: "짧은 홍보 영상에 초장문 모델은 비용만 늘립니다.",
      tips: [
        "제품을 화면에 분명히 보여주세요.",
        "영상 하나에 제품 하나.",
        "무료 체인이 느릴 때만 유료 AI를 추가하세요.",
      ],
    },
  },
  gaming: {
    en: {
      first: "Gemini at #1 — it follows the screen, the HUD and your inputs.",
      helps: "DeepSeek or Claude at #2 turns plays into teachable tactics.",
      skip: "Web-search AIs rarely add anything over your own gameplay.",
      tips: [
        "Record at a steady framerate; dropped frames lose the play.",
        "Shorter, focused clips teach tactics better than full streams.",
        "Keep a free AI at #2 so a long session does not stall on quota.",
      ],
    },
    mn: {
      first: "Gemini #1 — дэлгэц, HUD, таны товчлуурыг дагадаг.",
      helps: "DeepSeek эсвэл Claude #2 бол тоглолтыг заах тактик болгоно.",
      skip: "Вэб хайлтын AI таны тоглолтоос илүү зүйл нэмэхгүй.",
      tips: [
        "Тогтвортой frame rate-ээр бичиж ав.",
        "Бүтэн стримээс богино, төвлөрсөн клип илүү үр дүнтэй.",
        "Урт сешн хязгаарт тулахгүйн тулд #2-т үнэгүй AI байлга.",
      ],
    },
    ko: {
      first: "Gemini를 #1로 — 화면과 HUD, 입력을 따라갑니다.",
      helps: "DeepSeek 또는 Claude를 #2로 두면 플레이가 전술로 정리됩니다.",
      skip: "웹 검색 AI는 본인 플레이에 거의 도움이 되지 않습니다.",
      tips: [
        "프레임 드롭 없이 녹화하세요.",
        "전체 방송보다 짧고 집중된 클립이 낫습니다.",
        "긴 세션이 멈추지 않도록 #2에 무료 AI를 두세요.",
      ],
    },
  },
};

export function adviceFor(category: string, lang: Lang): KeyAdvice {
  const key = (category in ADVICE ? category : "knowledge") as CreationCategory;
  return pickCopy(ADVICE[key], lang);
}

/* ------------------------------------------------------------------ *
 * Per-creation-type recommendations shown as badges on the key list.
 * ------------------------------------------------------------------ */

export type RecLevel = "required" | "recommended" | "team" | "avoid";

export type Recommendation = {
  level: RecLevel;
  label: string;
  reason: string;
  /** The longer, tap-to-open explanation of what this label means. */
  explain: string;
  /** How the ordered list behaves when the key above runs out. */
  fallbackNote: string;
};

/** Who is worth adding for each creation type. Everything unlisted is "team". */
const PICKS: Record<CreationCategory, { recommended: string[]; avoid: string[] }> = {
  knowledge: { recommended: ["groq", "cerebras", "openai"], avoid: ["perplexity", "cohere"] },
  robot: { recommended: ["anthropic", "deepseek"], avoid: ["perplexity", "cohere", "github"] },
  voice: { recommended: ["groq", "cerebras"], avoid: ["perplexity", "moonshot"] },
  sales: { recommended: ["xai", "openai"], avoid: ["moonshot", "github"] },
  gaming: { recommended: ["deepseek", "anthropic"], avoid: ["perplexity", "cohere"] },
};

const LEVEL_COPY: Record<RecLevel, { en: string; mn: string; ko: string }> = {
  required: { en: "Required", mn: "Заавал", ko: "필수" },
  recommended: { en: "Best partner", mn: "Шилдэг хамтрагч", ko: "최고의 파트너" },
  team: { en: "Stand-in", mn: "Орлон ажиллагч", ko: "대타" },
  avoid: { en: "Not worth it here", mn: "Энд хэрэггүй", ko: "여기선 불필요" },
};

const REASON_COPY: Record<RecLevel, { en: string; mn: string; ko: string }> = {
  required: {
    en: "The only engine that watches and hears the video itself.",
    mn: "Видеог өөрөө хардаг, сонсдог цорын ганц хөдөлгүүр.",
    ko: "영상을 실제로 보고 듣는 유일한 엔진입니다.",
  },
  recommended: {
    en: "Works well as the thinking partner for what you picked.",
    mn: "Таны сонгосон төрөлд бодох хамтрагч болж сайн ажиллана.",
    ko: "선택한 유형에서 사고 파트너로 잘 작동합니다.",
  },
  team: {
    en: "Steps in when the key above runs out.",
    mn: "Дээрх түлхүүр дуусахад орлон ажиллана.",
    ko: "위 키가 소진되면 대신 나섭니다.",
  },
  avoid: {
    en: "Adds cost or time without improving this kind of mind.",
    mn: "Энэ төрөлд чанар нэмэлгүй зардал, цаг л нэмнэ.",
    ko: "이 유형에서는 품질 향상 없이 비용과 시간만 늘립니다.",
  },
};

const EXPLAIN_COPY: Record<RecLevel, { en: string; mn: string; ko: string }> = {
  required: {
    en: "Without this key nothing can be mined — it is the engine that opens the video, sees the picture and hears the sound. Keep it at #1.",
    mn: "Энэ түлхүүргүйгээр юу ч олборлогдохгүй — видеог нээж, зургийг харж, дууг сонсдог хөдөлгүүр. #1-т байлга.",
    ko: "이 키가 없으면 아무것도 마이닝할 수 없습니다 — 영상을 열고 화면을 보고 소리를 듣는 엔진입니다. #1로 두세요.",
  },
  recommended: {
    en: "For the type you picked in step 1, this one clearly improves the result. Put it right after Gemini so it actually gets used.",
    mn: "1-р алхамд сонгосон төрөлд чинь энэ нь үр дүнг тодорхой сайжруулна. Gemini-ийн яг дараа тавьбал ажиллана.",
    ko: "1단계에서 고른 유형에서 결과를 확실히 개선합니다. Gemini 바로 뒤에 두어야 실제로 사용됩니다.",
  },
  team: {
    en: "A spare pair of hands. It sits quietly and never runs while the keys above it still have tokens — the moment one runs out, this one takes the work so mining does not stop.",
    mn: "Нөөц гар. Дээрх түлхүүрүүдэд токен байгаа цагт огт ажиллахгүй чимээгүй хүлээнэ — нэг нь дуусмагц ажлыг авч, олборлолт зогсохгүй.",
    ko: "예비 인력입니다. 위 키에 토큰이 남아 있는 동안에는 전혀 실행되지 않다가, 하나가 소진되는 순간 일을 넘겨받아 마이닝이 멈추지 않게 합니다.",
  },
  avoid: {
    en: "It works, but for this creation type it costs money or time without making the result better. Keep it low in the order or remove it.",
    mn: "Ажиллана, гэхдээ энэ төрөлд үр дүнг сайжруулахгүйгээр мөнгө, цаг л иднэ. Доор нь байлгах эсвэл устга.",
    ko: "작동은 하지만 이 유형에서는 결과 개선 없이 비용과 시간만 듭니다. 순서를 낮추거나 삭제하세요.",
  },
};

const FALLBACK_NOTE: { en: string; mn: string; ko: string } = {
  en: "The order runs itself: #1 first, and the next number only starts when the one above it is out of tokens or over its limit.",
  mn: "Дараалал өөрөө ажиллана: эхлээд #1, дараагийнх нь зөвхөн дээрхийнх нь токен дуусах юм уу хязгаарт хүрэхэд эхэлнэ.",
  ko: "순서는 자동입니다: #1이 먼저, 다음 번호는 위 키의 토큰이 떨어지거나 한도를 넘겼을 때만 시작합니다.",
};

export function recommendationFor(category: string, providerId: string, lang: Lang): Recommendation {
  const key = (category in PICKS ? category : "knowledge") as CreationCategory;
  const picks = PICKS[key];
  const level: RecLevel =
    providerId === "gemini"
      ? "required"
      : providerId === "custom"
        ? "team"
        : picks.recommended.includes(providerId)
          ? "recommended"
          : picks.avoid.includes(providerId)
            ? "avoid"
            : "team";
  return {
    level,
    label: pickCopy(LEVEL_COPY[level], lang),
    reason: pickCopy(REASON_COPY[level], lang),
    explain: pickCopy(EXPLAIN_COPY[level], lang),
    fallbackNote: pickCopy(FALLBACK_NOTE, lang),
  };
}

/**
 * The best partners for this creation type that the creator has not saved yet,
 * so the key list can offer them as one-click additions.
 */
export function suggestedTeam(category: string, installedIds: string[]): string[] {
  const key = (category in PICKS ? category : "knowledge") as CreationCategory;
  return PICKS[key].recommended.filter((id) => !installedIds.includes(id));
}
