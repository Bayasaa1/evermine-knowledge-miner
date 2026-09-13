/**
 * Which AI to put at #1, what actually helps, and how to keep mining fast —
 * per creation type. Shown above the key list so the guidance matches what the
 * creator chose in step 1.
 *
 * Honest by design: Gemini is the engine that watches and hears the video.
 * Every other provider reasons over the material Gemini extracted.
 */
import type { CreationCategory } from "./creation-category";
import type { Lang } from "./i18n";

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

type Trio = Record<Lang, KeyAdvice>;

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
  return ADVICE[key][lang] ?? ADVICE[key].en;
}
