/** Read-only conversation guidance. No model calls and no changes to mined data. */
export type ConversationTurn = { role: "user" | "agent"; text: string };
export type TopicFocus = { title: string; fromIndex: number };
export type TopicStage = "opening" | "development" | "conclusion";
export type TopicSuggestion = { text: string; topic?: string | undefined; stage: TopicStage };
/** Screen labels (e.g. translated titles) keyed by the source topic title. */
export type TopicLabels = Record<string, string>;
type CopyLanguage = "en" | "mn" | "ko";

const COPY = {
  en: {
    intro: "Introduce yourself briefly",
    opening: (t: string) => `Let's start with ${t}. What is it about, and why does it matter to you?`,
    development: (t: string) => `On ${t}, what led you to that view?`,
    example: (t: string) => `Could you give a concrete example of what you mean about ${t}?`,
    branch: (t: string, s: string) => `Within ${t}, tell me in detail about ${s}.`,
    challenge: (t: string) => `What is the hardest problem in ${t}, and how would you solve it?`,
    future: (t: string) => `Where do you see ${t} going in the next 10 years?`,
    conclusion: (t: string) => `Let's sum up our discussion of ${t}. What's the main takeaway?`,
    next: (t: string) => `After what we discussed about ${t}, what would you do next?`,
  },
  mn: {
    intro: "Өөрийгөө товч танилцуулаач",
    opening: (t: string) => `«${t}» сэдвээс эхэлье. Юуны тухай, танд яагаад чухал вэ?`,
    development: (t: string) => `«${t}» сэдвээр та яагаад ийм бодолтой болсон бэ?`,
    example: (t: string) => `«${t}» сэдвээр ярьснаа бодит жишээгээр тайлбарлаач.`,
    branch: (t: string, s: string) => `«${t}» дотроос «${s}»-ийн талаар дэлгэрэнгүй яриач.`,
    challenge: (t: string) => `«${t}» сэдвийн хамгийн хэцүү асуудал юу вэ, та яаж шийдэх вэ?`,
    future: (t: string) => `«${t}» ойрын 10 жилд ямар болно гэж харж байна вэ?`,
    conclusion: (t: string) => `«${t}» сэдвээр ярьснаа нэгтгэе. Гол санаа нь юу вэ?`,
    next: (t: string) => `«${t}» сэдвээр ярьсанд үндэслээд цаашид юу хийх вэ?`,
  },
  ko: {
    intro: "간단히 자기소개 해주세요",
    opening: (t: string) => `${t}부터 이야기해요. 어떤 주제이고, 당신에게 왜 중요한가요?`,
    development: (t: string) => `${t}에 대해 그렇게 생각하게 된 이유는 무엇인가요?`,
    example: (t: string) => `${t}에 대해 말씀하신 내용을 구체적인 예로 설명해 주세요.`,
    branch: (t: string, s: string) => `${t} 중에서 ${s}에 대해 자세히 이야기해 주세요.`,
    challenge: (t: string) => `${t}에서 가장 어려운 문제는 무엇이고 어떻게 해결하시겠어요?`,
    future: (t: string) => `앞으로 10년 동안 ${t}는 어떻게 될 거라고 보시나요?`,
    conclusion: (t: string) => `${t}에 대해 나눈 이야기를 정리해 주세요. 핵심은 무엇인가요?`,
    next: (t: string) => `${t}에 대해 나눈 이야기를 바탕으로 다음에는 무엇을 하시겠어요?`,
  },
} as const;

const normalize = (text: string) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const CLOSING = /\b(sum up|summari[sz]e|main takeaway|wrap up|conclusion|dugne|dugnelt|negtge)\b|дүгнэ|дүгнэлт|нэгтгэ|гол санаа|정리|요약|핵심/iu;
const CONTINUE = /\b(why|how|example|more|what about|yagaad|yaaj|jishee)\b|яагаад|яаж|жишээ|дэлгэр|왜|어떻게|예시/iu;
/** Minimum answered turns on a topic before conclusion chips are offered. */
const MIN_DEPTH = 3;

function mentions(haystack: string, name: string): boolean {
  const needle = normalize(name);
  return needle.length > 1 && (haystack.includes(` ${needle} `) ||
    ["부터", "에", "을", "를", "은", "는", "이", "가", "ын", "ийн", "тай", "тэй", "д", "т", "аас", "ээс"].some((suffix) => haystack.includes(` ${needle}${suffix} `)));
}

export function topicInText(text: string, topics: string[], labels: TopicLabels = {}): string | undefined {
  const haystack = ` ${normalize(text)} `;
  return [...topics].sort((a, b) => b.length - a.length)
    .find((topic) => mentions(haystack, topic) || (labels[topic] ? mentions(haystack, labels[topic]) : false));
}

/** Resolve only this topic's current stretch, never a global message counter. */
export function conversationProgress(
  turns: ConversationTurn[], topics: string[], focus?: TopicFocus, labels: TopicLabels = {}, depth = MIN_DEPTH,
): { topic: string | undefined; stage: TopicStage; fromIndex: number; completed: number } {
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
      const named = topicInText(turn.text, topics, labels);
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
  const stage: TopicStage = !topic || completed === 0 ? "opening" : closed || completed >= depth ? "conclusion" : "development";
  return { topic, fromIndex, completed, stage };
}

export function topicSuggestions({
  turns, topics, lang, focus, creatorQuestions = [], branches = {}, labels = {},
}: {
  turns: ConversationTurn[]; topics: string[]; lang: string; focus?: TopicFocus | undefined; creatorQuestions?: string[] | undefined;
  /** Sub-branches of each topic from the Root map, used to dig deeper. */
  branches?: Record<string, string[]> | undefined;
  labels?: TopicLabels | undefined;
}): TopicSuggestion[] {
  const copy = COPY[lang as CopyLanguage] ?? COPY.en;
  const name = (t: string) => labels[t] ?? t;
  const allTopics = [...topics, ...(focus && !topics.includes(focus.title) ? [focus.title] : [])];
  const subsOf = (t: string) => branches[t] ?? [];
  const progressBase = conversationProgress(turns, allTopics, focus, labels);
  const depth = progressBase.topic ? Math.max(MIN_DEPTH, Math.min(6, subsOf(progressBase.topic).length + 2)) : MIN_DEPTH;
  const progress = conversationProgress(turns, allTopics, focus, labels, depth);
  const asked = new Set(turns.filter((t) => t.role === "user").map((t) => normalize(t.text)));
  const userSince = ` ${normalize(turns.slice(progress.fromIndex).filter((t) => t.role === "user").map((t) => t.text).join(" "))} `;
  const openings = topics.filter((t) => normalize(t) !== normalize(progress.topic ?? ""))
    .map((topic): TopicSuggestion => ({ text: copy.opening(name(topic)), topic, stage: "opening" }));
  let suggestions: TopicSuggestion[];
  if (!progress.topic) {
    suggestions = [
      ...(turns.length ? [] : [{ text: copy.intro, stage: "opening" as const }]),
      ...creatorQuestions.map((text): TopicSuggestion => ({ text, stage: "opening" })),
      ...openings,
    ];
  } else {
    const topic = progress.topic;
    const shown = name(topic);
    // Deeper branches first: sub-topics not yet discussed in this stretch.
    const deeper = subsOf(topic).filter((s) => !mentions(userSince, s) && !mentions(userSince, name(s)))
      .map((s): TopicSuggestion => ({ text: copy.branch(shown, name(s)), topic, stage: "development" }));
    const develop: TopicSuggestion[] = [
      ...deeper,
      { text: copy.development(shown), topic, stage: "development" },
      { text: copy.example(shown), topic, stage: "development" },
      { text: copy.challenge(shown), topic, stage: "development" },
      { text: copy.future(shown), topic, stage: "development" },
    ];
    if (progress.stage === "opening") {
      suggestions = [{ text: copy.opening(shown), topic, stage: "opening" }, ...deeper];
    } else if (progress.stage === "development") {
      // Stay inside this branch: no other topic is offered while it develops.
      suggestions = develop;
    } else {
      suggestions = [
        { text: copy.conclusion(shown), topic, stage: "conclusion" },
        { text: copy.next(shown), topic, stage: "conclusion" },
        ...deeper.slice(0, 2),
        ...openings,
      ];
    }
  }
  return suggestions.filter((s, i, all) => !asked.has(normalize(s.text)) && all.findIndex((x) => normalize(x.text) === normalize(s.text)) === i);
}
