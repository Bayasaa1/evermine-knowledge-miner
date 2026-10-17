/** Read-only conversation guidance. No model calls and no changes to mined data. */
export type ConversationTurn = { role: "user" | "agent"; text: string };
export type TopicFocus = { title: string; fromIndex: number };
export type TopicStage = "opening" | "development" | "conclusion";
export type TopicSuggestion = { text: string; topic?: string; stage: TopicStage };
type CopyLanguage = "en" | "mn" | "ko";

const COPY = {
  en: {
    intro: "Introduce yourself briefly",
    opening: (topic: string) => `Let's start with ${topic}. What is it about, and why does it matter to you?`,
    development: (topic: string) => `On ${topic}, what led you to that view?`,
    example: (topic: string) => `Could you give a concrete example of what you mean about ${topic}?`,
    conclusion: (topic: string) => `Let's sum up our discussion of ${topic}. What's the main takeaway?`,
    next: (topic: string) => `After what we discussed about ${topic}, what would you do next?`,
  },
  mn: {
    intro: "Өөрийгөө товч танилцуулаач",
    opening: (topic: string) => `${topic} сэдвээс эхэлье. Юуны тухай, танд яагаад чухал вэ?`,
    development: (topic: string) => `${topic} сэдвээр та яагаад ийм бодолтой болсон бэ?`,
    example: (topic: string) => `${topic} сэдвээр ярьснаа бодит жишээгээр тайлбарлаач.`,
    conclusion: (topic: string) => `${topic} сэдвээр ярьснаа нэгтгэе. Гол санаа нь юу вэ?`,
    next: (topic: string) => `${topic} сэдвээр ярьсанд үндэслээд цаашид юу хийх вэ?`,
  },
  ko: {
    intro: "간단히 자기소개 해주세요",
    opening: (topic: string) => `${topic}부터 이야기해요. 어떤 주제이고, 당신에게 왜 중요한가요?`,
    development: (topic: string) => `${topic}에 대해 그렇게 생각하게 된 이유는 무엇인가요?`,
    example: (topic: string) => `${topic}에 대해 말씀하신 내용을 구체적인 예로 설명해 주세요.`,
    conclusion: (topic: string) => `${topic}에 대해 나눈 이야기를 정리해 주세요. 핵심은 무엇인가요?`,
    next: (topic: string) => `${topic}에 대해 나눈 이야기를 바탕으로 다음에는 무엇을 하시겠어요?`,
  },
} as const;

const normalize = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const CLOSING = /\b(sum up|summari[sz]e|main takeaway|wrap up|conclusion|dugne|dugnelt|negтge|negtge)\b|дүгнэ|дүгнэлт|нэгтгэ|гол санаа|정리|요약|핵심/iu;
const CONTINUE = /\b(why|how|example|more|what about|yagaad|yaaj|jishee)\b|яагаад|яаж|жишээ|дэлгэр|왜|어떻게|예시/iu;

export function topicInText(text: string, topics: string[]): string | undefined {
  const haystack = ` ${normalize(text)} `;
  return [...topics].sort((a, b) => b.length - a.length).find((topic) => {
    const needle = normalize(topic);
    return needle.length > 1 && haystack.includes(` ${needle} `);
  });
}

/** Resolve only this topic's current stretch, never a global message counter. */
export function conversationProgress(
  turns: ConversationTurn[], topics: string[], focus?: TopicFocus,
): { topic?: string; stage: TopicStage; fromIndex: number } {
  let topic = focus?.title;
  let fromIndex = focus?.fromIndex ?? turns.length;
  let completed = 0;
  let pending = false;
  let closed = false;
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (!turn) continue;
    if (focus && i < focus.fromIndex) continue;
    if (turn.role === "user") {
      const named = topicInText(turn.text, topics);
      if (named && normalize(named) !== normalize(topic ?? "")) {
        topic = named; fromIndex = i; completed = 0; closed = false;
      }
      if (!topic) continue;
      pending = true;
      if (CLOSING.test(turn.text)) closed = true;
      else if (closed && CONTINUE.test(turn.text)) closed = false;
    } else if (pending && turn.text.trim()) {
      completed++; pending = false;
    }
  }
  return { topic, fromIndex, stage: !topic || completed === 0 ? "opening" : closed || completed >= 2 ? "conclusion" : "development" };
}

export function topicSuggestions({
  turns, topics, lang, focus, creatorQuestions = [],
}: {
  turns: ConversationTurn[]; topics: string[]; lang: string; focus?: TopicFocus; creatorQuestions?: string[];
}): TopicSuggestion[] {
  const copy = COPY[lang as CopyLanguage] ?? COPY.en;
  const progress = conversationProgress(turns, topics, focus);
  const asked = new Set(turns.filter((t) => t.role === "user").map((t) => normalize(t.text)));
  const openings = topics.filter((t) => normalize(t) !== normalize(progress.topic ?? ""))
    .map((topic): TopicSuggestion => ({ text: copy.opening(topic), topic, stage: "opening" }));
  let suggestions: TopicSuggestion[];
  if (!progress.topic) {
    suggestions = [
      ...(turns.length ? [] : [{ text: copy.intro, stage: "opening" as const }]),
      ...creatorQuestions.map((text): TopicSuggestion => ({ text, stage: "opening" })),
      ...openings,
    ];
  } else {
    const topic = progress.topic;
    suggestions = progress.stage === "opening"
      ? [{ text: copy.opening(topic), topic, stage: "opening" }]
      : progress.stage === "development"
        ? [{ text: copy.development(topic), topic, stage: "development" }, { text: copy.example(topic), topic, stage: "development" }]
        : [{ text: copy.conclusion(topic), topic, stage: "conclusion" }, { text: copy.next(topic), topic, stage: "conclusion" }, { text: copy.example(topic), topic, stage: "development" }];
    suggestions.push(...openings);
  }
  return suggestions.filter((s, i, all) => !asked.has(normalize(s.text)) && all.findIndex((x) => normalize(x.text) === normalize(s.text)) === i);
}