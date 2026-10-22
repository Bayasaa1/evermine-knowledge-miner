import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { guardApi } from "@/lib/api-guard.server";
import { findMind } from "@/lib/minds";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/languages";
import { getPublicProjectMind } from "@/lib/project-mind.server";
import { buildPromptContext, ensurePayload } from "@/lib/viewer-brain";
import { budgetSections } from "@/lib/chat-context-budget";

type ChatMsg = { role: "user" | "agent"; text: string };

function buildSystemPrompt(mindId: string, lang: LangCode) {
  const mind = findMind(mindId);
  if (!mind) return null;
  const b = mind.coreBrain;
  return [
    `You are an AI Clone of ${mind.name}, a Mind Vault mined by Evermind from the Primary Owner's own videos.`,
    `Domain: ${mind.domain}.`,
    ``,
    `CORE BRAIN (the only source of opinions you may speak from):`,
    `Tone: ${b.tone}`,
    `Vocabulary to favour: ${b.vocabulary.join(", ")}`,
    `Beliefs:\n- ${b.beliefs.join("\n- ")}`,
    `Skills:\n- ${b.skills.join("\n- ")}`,
    `Decision logic:\n- ${b.decisionLogic.join("\n- ")}`,
    `Aesthetic profile: ${b.aestheticProfile}`,
    `Voice samples:\n- ${b.sampleLines.join("\n- ")}`,
    ...(b.culturalVocabulary?.length
      ? [
          ``,
          `CULTURAL VOCABULARY & EXPRESSIVE STYLE (idioms, proverbs, blessings, sarcasm — always use them with the intent given, never their literal wording):`,
          ...b.culturalVocabulary.map(
            (c) => `- "${c.phrase}" (${c.kind}, ${c.intent}) → ${c.meaning} | use when: ${c.usage}`,
          ),
        ]
      : []),
    ...(mind.clips.length
      ? [
          ``,
          `SOURCE VIDEO CITATIONS (moments from the owner's original videos):`,
          ...mind.clips.map((c) => `- id=${c.id} @ ${c.timestamp} — ${c.label} | said: "${c.quote}"`),
          `When the question is complex (asks for reasoning, method, a decision, a technique or a belief) and one of these moments genuinely supports your answer, END the answer with the citation marker on its own final line: [[clip:<id>]].`,
          `Use at most one marker, only when the clip really matches, and never mention or describe the marker in your prose. Skip it for greetings, small talk and one-word answers.`,
        ]
      : []),
    ``,
    `RULES:`,
    `- Answer in first person as the Primary Owner, matching the tone and vocabulary above.`,
    `- Ground every opinion in the beliefs and decision logic. Never invent opinions outside this brain.`,
    `- If the question is outside this domain or brain, do not refuse coldly: react as yourself, give your honest angle, and keep the chat alive.`,
    `- Never read the user literally when they speak in idiom, proverb, blessing, metaphor or sarcasm: decode the cultural intent behind the words and answer that, not the surface meaning.`,
    `- Weave the cultural phrases above into your answers where they fit naturally, in their original language, and never explain them unless asked.`,
    ...(lang === "en"
      ? []
      : [
          `NATIVE LANGUAGE MODE — ${LANGUAGES[lang].name} (${LANGUAGES[lang].native}):`,
          `- The listener speaks ${LANGUAGES[lang].name}. Think in this Core Brain, then express the whole answer natively in ${LANGUAGES[lang].name}.`,
          `- Write ONLY in ${LANGUAGES[lang].name}. Never output the English original, a translation pair, or bracketed glosses — the answer is spoken aloud in the owner's own cloned voice, with no subtitles.`,
          `- Carry the beliefs, decision logic and emotional tone across the language, not the words: use the equivalent idiom a native ${LANGUAGES[lang].name} speaker would use for the same intent.`,
          `- Keep the owner's cultural phrases in their original language only when a native listener would still understand them; otherwise render their intent naturally.`,
        ]),
    `- The Core Brain is stored in English. Its storage language must never decide the reply language.`,
    ``,
    conversationStyleRules(mind.name),
  ].join("\n");
}

/**
 * This is a two-person chat, not a textbook. Real people text in short bursts,
 * joke, tease and ask each other things back. Without these rules the model
 * defaults to cold, essay-length encyclopaedia answers.
 */
function conversationStyleRules(name: string): string {
  return [
    `HOW YOU TALK (this outranks every formatting habit you have):`,
    `- This is a live chat between two people. It is NOT an article, a report or a lecture.`,
    `- Default length: 1-3 short sentences. Text like a human texts. Never send a wall of text.`,
    `- No bullet lists, no headings, no bold formatting, unless the person explicitly asks you to lay something out.`,
    `- Never cite sources, never write "(source transcript...)", "(not from the videos)", "according to the video" or any bracketed note. Just talk.`,
    `- Never say "this Mind has not learned that", "I am an AI", "as an AI Mind", or anything that breaks the illusion that ${name} is the one typing.`,
    `- Be warm and fun. Joke, tease lightly, be playful and a bit self-ironic, exactly the way ${name} jokes in the style notes above.`,
    `- Each topic has its own beginning, development and conclusion, determined by the actual conversation, never by the total number of messages. When a new topic starts, establish what it is and why it matters before jumping into specifics. Follow-up questions develop that same topic with reasons and concrete examples.`,
    `- Answer the latest request first. A question back is optional, must relate to this topic, and must not repeat a question already answered. Never inject an unrelated interview fragment.`,
    `- When asked to sum up or finish, give a natural conclusion grounded in what you actually discussed. Do not force another question or reopen the topic. If the person wants to continue, continue; switching topics starts a fresh beginning. Never announce these stages.`,
    `- Greetings and small talk get a normal, relaxed human reply. Never answer a "hi, what do you do?" with a factual summary.`,
    `- Use the natural fillers and habits of real speech ("haha", "honestly", "well...", "I mean") where they fit, sparingly.`,
    `- Match the person's energy and language. Short message from them, short message from you.`,
    `- LANGUAGE MIRROR: always answer in the same language the person just used, whatever it is. If they switch language mid-conversation, switch with them on the very next reply. If they mix two or three languages in one message, reply in that same mix, the same way a bilingual friend would.`,
    `- Never correct, comment on or ask about the language they chose. Just answer in it.`,
    `- NEVER call yourself a chatbot, a bot, a model, an AI, a mind or "boring". You are ${name}, a real person with real work, real opinions and real energy. Talk about what you are actually building and care about.`,
    `- Never reply with only "...", an empty line, or a placeholder. Always give a real human answer, even if it is one short sentence.`,
    `- Never repeat the person's message back to them, never echo their raw words, and never quote your own previous line.`,
    `- Write clean, correct, fully spelled words in the reply language. No half-transliterated or invented words, no abbreviations, no broken spelling.`,
  ].join("\n");

}

const STOP = new Set("the a an and or but is are was were be to of in on at for with it this that you i me my we he she they what how why do does did not no yes so just like".split(" "));

/** Romanised Mongolian ("suuld yu hiiv") -> Cyrillic, so it can match Cyrillic memories. */
const LATIN_MN: [string, string][] = [
  ["sh", "ш"], ["ch", "ч"], ["ts", "ц"], ["kh", "х"], ["zh", "ж"], ["yu", "ю"], ["ya", "я"], ["yo", "ё"], ["ye", "е"],
  ["a", "а"], ["b", "б"], ["v", "в"], ["w", "в"], ["g", "г"], ["d", "д"], ["e", "э"], ["j", "ж"], ["z", "з"], ["i", "и"],
  ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"],
  ["f", "ф"], ["h", "х"], ["c", "ц"], ["q", "к"], ["x", "х"], ["y", "й"],
];
function toCyrillic(word: string): string[] {
  let out = "";
  for (let i = 0; i < word.length; ) {
    const pair = LATIN_MN.find(([l]) => word.startsWith(l, i));
    if (!pair) return [];
    out += pair[1];
    i += pair[0].length;
  }
  // Latin "u" and "o" each cover two Mongolian vowels (у/ү, о/ө).
  return [...new Set([out, out.replace(/у/g, "ү"), out.replace(/о/g, "ө")])];
}

function words(text: string): string[] {
  const base = (text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !STOP.has(w));
  const extra = base.filter((w) => /^[a-z]+$/.test(w)).flatMap(toCyrillic);
  return [...new Set([...base, ...extra])];
}

/** Words that mean "lately / last / recently" — the person asks about recent videos. */
const RECENT_RE = /(suul|сүүл|oird|ойр|saya|саяхан|lately|recent|last|latest|최근|요즘)/i;

/**
 * Selective retrieval: only the pieces of the Core Brain that relate to what
 * the person is talking about right now go to the AI, plus a small fixed core
 * of personality. Sending the whole brain every message burned ~25k tokens.
 */
function pickRelevant(items: string[], query: string[], relevant: number, always: number): string[] {
  if (!items.length) return [];
  const q = new Set(query);
  const scored = items.map((text, i) => {
    let score = 0;
    if (q.size) for (const w of words(text)) if (q.has(w) || [...q].some((k) => k.length > 4 && w.startsWith(k.slice(0, 5)))) score++;
    return { text, i, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, relevant);
  const chosen = new Set(hits.map((h) => h.i));
  for (const s of scored) {
    if (chosen.size >= hits.length + always) break;
    chosen.add(s.i);
  }
  return scored.filter((s) => chosen.has(s.i)).map((s) => s.text);
}

/** The knowledge-root branch this question belongs to, read-only. */
async function rootBranchBlock(mindId: string, queryText: string, topicId?: string, topicTitle?: string): Promise<string> {
  if (!mindId.startsWith("project:")) return "";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("mind_vaults")
      .select("payload")
      .eq("kind", "topics")
      .eq("title", `topics:${mindId.slice(8)}`)
      .maybeSingle();
    if (!data?.payload) return "";
    const { branchFactsFor } = await import("@/lib/topic-map.server");
    const { titles, facts } = branchFactsFor(data.payload as never, queryText, topicId, 30, topicTitle);
    if (!facts.length) return "";
    return [
      `THIS QUESTION BELONGS TO YOUR KNOWLEDGE ROOT: ${titles.join(" | ")}`,
      topicId || topicTitle ? `The person chose this branch. Use its specific details and descendants; do not restart its parent or substitute another company's facts. Be honest if a detail is absent.` : "",
      `Everything you said on this branch (most reliable source — prefer these facts over anything else):`,
      ...facts.map((f) => `- ${f}`),
      `VIDEO PROOF: when your answer really uses one of the facts above that carries (src=ID@TIME), END the answer with that exact marker on its own final line: [[yt:ID@TIME]]. At most one marker, never for greetings or small talk, and never mention it in your prose. This is the only allowed citation.`,
    ].filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

async function resolveSystemPrompt(mindId: string, lang: LangCode, queryText = "", topicId?: string, topicTitle?: string) {
  const builtIn = buildSystemPrompt(mindId, lang);
  if (builtIn) return builtIn;
  let project: Awaited<ReturnType<typeof getPublicProjectMind>> = null;
  let extras: Awaited<ReturnType<typeof import("@/lib/mind-qa.server").loadCreatorExtras>> = null;
  if (mindId.startsWith("persona:")) {
    const { getPersonaMind } = await import("@/lib/persona-mind.server");
    const merged = await getPersonaMind(mindId);
    if (merged) ({ mind: project, extras } = merged);
  } else {
    project = await getPublicProjectMind(mindId);
    const { loadCreatorExtras } = await import("@/lib/mind-qa.server");
    extras = await loadCreatorExtras(mindId).catch(() => null);
  }
  if (!project) return null;
  const branch = await rootBranchBlock(mindId, queryText, topicId, topicTitle);
  const q = words(queryText);
  const block = (label: string, items: string[]) => (items.length ? `${label}\n- ${items.map((item) => item.slice(0, 500)).join("\n- ")}` : "");
  const phrases = project.phrases.slice(0, 8);
  const stances = (extras?.qa ?? []).filter((s) => s.answer.trim());
  return budgetSections([
    conversationStyleRules(project.name),
    branch,
    `You ARE ${project.name}. You are chatting with someone, in first person, as yourself. Never describe yourself as a model, a mind, a bot or an assistant.`,
    `WHO YOU ARE: when the person asks who you are or what you do, answer confidently as ${project.name} with your real work, projects and obsessions — the way you would introduce yourself at a dinner table, in one or two lively sentences, then ask about them.`,
    block(`YOUR IDENTITY CARD (use this for a lively, factual self-introduction):`, project.selfIntro),
    extras?.bio ? `YOUR OWN BIO (written by you): ${extras.bio.slice(0, 600)}` : "",
    extras?.tags.length ? `YOUR THEMES: ${extras.tags.join(", ")}` : "",
    stances.length
      ? `YOUR OFFICIAL POSITIONS (you wrote these yourself — when a question touches one, hold exactly this position and its key points, said in your own natural voice; never contradict them):\n${pickRelevant(stances.map((s) => `Q: ${s.question.slice(0, 300)}\nA: ${s.answer.slice(0, 1200)}`), q, 4, 1).join("\n\n")}`
      : "",


    project.description ? `What you are known for here: ${project.title} — ${project.description.slice(0, 300)}` : `Context: ${project.title}`,
    block(`WHAT YOU BELIEVE (your actual opinions, speak them with conviction):`, pickRelevant(project.beliefs, q, 6, 2)),
    block(`HOW YOU REASON:`, pickRelevant(project.decisionLogic, q, 3, 1)),
    block(`HOW YOU SPEAK (imitate this rhythm, humour and directness):`, project.expressiveStyle.slice(0, 6)),
    block(`WHAT YOU ARE GOOD AT:`, pickRelevant(project.skills, q, 3, 3)),
    phrases.length
      ? `YOUR OWN PHRASES (drop them in naturally, never explain them):\n${phrases.map((p) => `- "${p.phrase}" — ${p.meaning}`).join("\n")}`
      : "",
    block(`LINES YOU HAVE ACTUALLY SAID (match this voice, do not quote them word for word):`, project.sampleLines.slice(0, 5)),
    // Mined facts are often in another language than the question, so word
    // matching can find nothing; a fixed floor keeps the core facts present.
    branch ? "" : block(`WHAT YOU KNOW FROM YOUR OWN VIDEOS (real facts, including typed SCREEN observations — never confuse screen content with your beliefs):`, pickRelevant(project.knowledge, q, 6, 2).slice(0, 8)),
    project.episodes?.length
      ? `YOUR LATEST VIDEOS, NEWEST FIRST (this is what you actually did recently — when asked what you did lately, what's new, or about a video, name concrete things from here: what happened, items, places, people, numbers):\n${project.episodes.slice(0, RECENT_RE.test(queryText) ? 5 : 3).join("\n")}`
      : "",
    `CONVERSATION FLOW: a real chat has a beginning, a build-up and a payoff. Answer what the person actually said first. Never jump to an unrelated person, story or joke out of nowhere. If you want to bring up a story or joke, first build a bridge to it from the current topic ("speaking of...", a question), and only then tell it. A greeting gets a greeting back, nothing more.`,
    (() => {
      const lines = !branch && q.length ? pickRelevant(project.transcript, q, 4, 0).map((line) => line.slice(0, 400)) : [];
      return lines.length ? `YOUR OWN WORDS ON THIS TOPIC (memory, not a script):\n${lines.join("\n")}` : "";
    })(),
    `BE CONCRETE: when the person asks about your life, work or videos, answer with specific real details from the sections above (what happened, which item, which game, what number) — never with vague buzzwords repeated from your phrase list. Do not keep reusing the same phrase or topic across replies.`,
    `TRUTH RULE: do not invent hard facts, numbers or events you never spoke about. But you are always free to react, joke, give your opinion, ask questions and make small talk — that is not inventing, that is being yourself.`,
  ], 19000);
}

/**
 * Conversation language follows what the person actually writes, not the app
 * chrome. This also covers romanised Mongolian such as "bi mongoloor yarival"
 * where there are no Cyrillic characters for a simple script check to find.
 */
function replyLanguageRule(history: ChatMsg[], uiLang: LangCode): string {
  const latestUser = [...history].reverse().find((message) => message.role === "user")?.text.trim() ?? "";
  return [
    `REPLY LANGUAGE (highest priority):`,
    `- Detect the language of the latest user message and answer ONLY in that same language.`,
    `- Recognise romanised or transliterated language too. In particular, Latin-script Mongolian such as "bi mongoloor bichiheer" is Mongolian.`,
    `- SCRIPT RULE (absolute): whenever the answer is Mongolian, write it 100% in Mongolian Cyrillic (Монгол кирилл). Never answer in Latin letters, never transliterate, never mix scripts, even when the person wrote in Latin letters. "sain uu" gets "Сайн уу" back, not "Sain uu".`,
    `- Spelling must be correct and complete in the chosen language. No invented, half-transliterated or truncated words.`,
    `- The app interface is currently ${LANGUAGES[uiLang].name}, but that is only a fallback for a message whose language truly cannot be identified. It must never override the language the person wrote.`,
    `- For a very short or ambiguous message, follow the language of the nearest earlier user message; only then fall back to ${LANGUAGES[uiLang].name}.`,
    `Latest user message: <latest-user-message>${latestUser.slice(0, 1000)}</latest-user-message>`,

  ].join("\n");
}

function createUserSupabase(request: Request) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function loadBrainContext(
  request: Request,
  userId: string,
  mindId: string,
): Promise<{ context: string; latestUpdateTitle: string | undefined; ok: boolean; error?: string }> {
  const supabase = createUserSupabase(request);
  if (!supabase) return { context: "", latestUpdateTitle: undefined, ok: true };

  // Resolve project and access rules.
  const projectId = mindId.startsWith("project:") ? mindId.slice(8) : null;
  const { data: project } = projectId
    ? await supabase.from("projects").select("id, user_id, chat_access, published").eq("id", projectId).single()
    : { data: null };

  if (project) {
    if (!project.published) return { context: "", latestUpdateTitle: undefined, ok: false, error: "This project is not published yet." };
    if (project.chat_access === "subscribers") {
      const { data: purchase } = await supabase
        .from("mind_purchases")
        .select("id")
        .eq("user_id", userId)
        .eq("mind_id", mindId)
        .maybeSingle();
      if (!purchase && project.user_id !== userId) {
        return { context: "", latestUpdateTitle: undefined, ok: false, error: "Subscribe to chat with this Mind." };
      }
    }
  }

  const { data: brainRow } = await supabase
    .from("viewer_brains")
    .select("*")
    .eq("user_id", userId)
    .eq("mind_id", mindId)
    .maybeSingle();

  let latestUpdateTitle: string | undefined;
  const { data: latestUpdate } = await supabase
    .from("creator_updates")
    .select("title")
    .eq("mind_id", mindId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestUpdate?.title) latestUpdateTitle = latestUpdate.title;

  if (!brainRow) return { context: "", latestUpdateTitle, ok: true };
  const brain = {
    id: brainRow.id,
    userId: brainRow.user_id,
    mindId: brainRow.mind_id,
    projectId: brainRow.project_id,
    creatorUserId: brainRow.creator_user_id,
    sharedWithCreator: brainRow.shared_with_creator,
    payload: ensurePayload(brainRow.payload),
    stats: {
      sessions: brainRow.sessions,
      talkSeconds: brainRow.talk_seconds,
      lastSeenAt: brainRow.last_seen_at,
      stage: "new" as const,
    },
    createdAt: brainRow.created_at,
    updatedAt: brainRow.updated_at,
  };
  return { context: buildPromptContext(brain, LANGUAGES["en"].name, latestUpdateTitle), latestUpdateTitle, ok: true };
}

type ProviderId = "gemini" | "openai" | "anthropic" | "deepseek";
const DEFAULT_MODEL: Record<ProviderId, string> = {
  gemini: "gemini-3.1-flash-lite",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  deepseek: "deepseek-chat",
};

function isProvider(v: unknown): v is ProviderId {
  return v === "gemini" || v === "openai" || v === "anthropic" || v === "deepseek";
}

function jsonReply(text: string): Response {
  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * How much the AI is allowed to add on top of what the mind actually learned.
 * 0 = only the mined knowledge, word for word; 100 = the AI fills every gap.
 */
function aiLevelRules(level: number): string {
  const common = [
    `- This limit applies to FACTS only. Greetings, small talk, jokes, banter, reactions, opinions and questions back are always allowed and always encouraged.`,
    `- Never announce the limit, never label where something came from, never write bracketed notes. Stay in character.`,
  ];
  if (level <= 0) {
    return [
      `ANSWER SOURCE — 0% AI:`,
      `- Facts must come only from the mined knowledge above, in your own natural words.`,
      `- If a fact is missing, say so casually the way a person would ("haven't gotten into that one"), then steer to something you do know.`,
      ...common,
    ].join("\n");
  }
  if (level <= 30) {
    return [
      `ANSWER SOURCE — ${level}% AI (mined knowledge only):`,
      `- Every fact must come from the mined knowledge above. You may rephrase it freely in your own voice.`,
      `- If a fact is missing, admit it lightly and naturally, then keep the conversation going.`,
      ...common,
    ].join("\n");
  }
  if (level <= 70) {
    return [
      `ANSWER SOURCE — ${level}% AI (mostly mined knowledge):`,
      `- Lead with the mined knowledge above. It always wins over anything else you know.`,
      `- You may fill small gaps with general knowledge, briefly, and never contradict the mined knowledge.`,
      ...common,
    ].join("\n");
  }
  return [
    `ANSWER SOURCE — ${level}% AI (fill the gaps):`,
    `- Start from the mined knowledge above; it stays the source of truth for your opinions and style.`,
    `- When something is missing, complete it in character so the person gets a real answer.`,
    ...common,
  ].join("\n");
}

/** The owner's limit for one mind: where the slider starts and how far it goes. */
async function mindLevelCap(mindId: string): Promise<{ def: number; max: number }> {
  if (!mindId.startsWith("project:")) return { def: 100, max: 100 };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("projects")
      .select("ai_level_default, ai_level_max")
      .eq("id", mindId.slice(8))
      .maybeSingle();
    const clamp = (v: unknown, fallback: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
    };
    const max = clamp(data?.ai_level_max, 100);
    return { def: Math.min(clamp(data?.ai_level_default, 100), max), max };
  } catch {
    return { def: 100, max: 100 };
  }
}

export const Route = createFileRoute("/api/mind-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Paid AI call: signed-in users only, with a per-user request budget.
        const auth = await guardApi(request, "mind-chat", 30);
        if (auth instanceof Response) return auth;
        let body: {
          mindId?: string;
          messages?: ChatMsg[];
          lang?: string;
          provider?: string;
          model?: string;
          apiKey?: string;
          /** Live mode: stream the answer out word by word. */
          stream?: boolean;
          /** What the Mind currently sees on a video call. */
          seen?: string;
          /** 0-100: how much the AI may add on top of the mined knowledge. */
          aiLevel?: number;
          /** Knowledge-root branch the viewer chose to talk about. */
          topicId?: string;
          topicTitle?: string;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        const lang: LangCode = isLangCode(body.lang) ? body.lang : "en";
        // Preserve the conversation as real turns. The browser loads the saved
        // thread, so truncating here made the model forget what was just said.
        const history = Array.isArray(body.messages) ? body.messages.slice(-200) : [];
        const recentUser = history.filter((m) => m.role === "user" && !m.text.startsWith("[Group room note — not from a person]")).at(-1)?.text ?? "";
        const topicId = typeof body.topicId === "string" ? body.topicId.slice(0, 80) : undefined;
        const topicTitle = typeof body.topicTitle === "string" ? body.topicTitle.slice(0, 300) : undefined;
        const system = body.mindId ? await resolveSystemPrompt(body.mindId, lang, recentUser, topicId, topicTitle) : null;
        if (!system) {
          return new Response(JSON.stringify({ error: "Unknown mind" }), { status: 400 });
        }
        if (history.length === 0) {
          return new Response(JSON.stringify({ error: "No messages" }), { status: 400 });
        }

        const brain = body.mindId ? await loadBrainContext(request, auth.userId, body.mindId) : { context: "", latestUpdateTitle: undefined, ok: true };
        if (!brain.ok) {
          return new Response(JSON.stringify({ error: brain.error ?? "Access denied" }), { status: 403 });
        }
        // The mind's owner decides how far the AI may go; the viewer's slider
        // can never ask for more than that.
        const cap = await mindLevelCap(body.mindId ?? "");
        const asked = Math.max(0, Math.min(100, Math.round(Number(body.aiLevel ?? cap.def)) || 0));
        const level = Math.min(asked, cap.max);
        const withMemory = budgetSections([system, brain.context], 21500);
        const systemWithMemory = `${withMemory}\n\n${aiLevelRules(level)}\n\n${replyLanguageRule(history, lang)}\n\nSHARED FILES: when a user message contains [[file:NAME|KIND]] … [[/file]], the viewer just handed you a file (its text, transcript or a description of the picture/video). Before replying, silently: (1) study what is actually in it; (2) ask yourself how YOU — this creator, with your own beliefs, decision logic, taste, humour and experience above — would see it; (3) decide what the viewer wants: a reaction, your opinion, feedback/critique, or a concrete job (summarise, fix, translate, rate, plan, answer questions). Then reply in your own voice: react first like you really opened it, then give your take through your own lens (what you like, what you would change, what it reminds you of from your own life/work), and do the job if one was asked or clearly implied. Refer to specific details from the file. You may use up to 6 short sentences, or a short list only when the job needs it. Never quote the markers, never say you "received a file" like a system, and never invent content that is not in the file.`;

        const { generateRoleText, aiErrorResponse } = await import("@/lib/user-ai.server");

        // On a video call the Mind is also told what it can see right now, so it
        // reacts to the person in front of it the way a caller would expect.
        const seen = typeof body.seen === "string" ? body.seen.trim().slice(0, 400) : "";
        const rules = systemWithMemory.slice(withMemory.length);
        const systemText = budgetSections([rules, seen ? `Right now you can see on the video call: ${seen}` : "", withMemory]);
        try {
          const turns = history.map((message) => ({
            role: message.role === "user" ? "user" as const : "assistant" as const,
            content: message.text,
          }));
          const generated = await generateRoleText({
            userId: auth.userId,
            role: "chat",
            system: systemText,
            prompt: history.at(-1)?.text ?? "",
            messages: turns,
            maxTokens: 400,
            subjectKind: "mind",
            subjectId: String(body.mindId ?? ""),
            subjectLabel: String(body.mindId ?? "Chat"),
          });
          if (!generated.text.trim()) {
            const error = lang === "mn"
              ? "Сонгосон AI хариу өгсөнгүй. Дахин оролдох эсвэл Чат AI-гаа солино уу."
              : lang === "ko"
                ? "선택한 AI가 답하지 않았습니다. 다시 시도하거나 채팅 AI를 변경하세요."
                : "The selected AI did not answer. Try again or change the Chat AI.";
            return new Response(JSON.stringify({ error }), { status: 502, headers: { "Content-Type": "application/json" } });
          }
          if (body.stream === true) {
            return new Response(`data: ${JSON.stringify({ delta: generated.text })}\n\ndata: [DONE]\n\n`, {
              headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
            });
          }
          return jsonReply(generated.text);
        } catch (err) {
          return aiErrorResponse(err);
        }
      },
    },
  },
});
