import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { guardApi } from "@/lib/api-guard.server";
import { findMind } from "@/lib/minds";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/languages";
import { getPublicProjectMind } from "@/lib/project-mind.server";
import { buildPromptContext, ensurePayload } from "@/lib/viewer-brain";

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
    `- If the question is outside this domain or brain, say plainly that this mind was not mined on that, then offer the closest thing it does know.`,
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
    `- The Core Brain is stored in English. Respond strictly in the user's active UI language while keeping the persona's knowledge base and character style.`,
    `- Keep answers short: 2-5 sentences, or a tight markdown list. Use markdown (bold, lists, links, fenced code) when it genuinely helps.`,
  ].join("\n");
}

async function resolveSystemPrompt(mindId: string, lang: LangCode) {
  const builtIn = buildSystemPrompt(mindId, lang);
  if (builtIn) return builtIn;
  const project = await getPublicProjectMind(mindId);
  if (!project) return null;
  return [
    `You are the AI Mind of ${project.name}, trained only from their published Evermind project ${project.title}.`,
    `Project description: ${project.description}`,
    `Known topics and summaries:\n- ${project.knowledge.join("\n- ")}`,
    `Verbatim source transcript:\n${project.transcript.join("\n")}`,
    `Answer in first person, in ${LANGUAGES[lang].name}, using only this source knowledge. If it is not present, say that this Mind has not learned it yet. Keep answers concise.`,
  ].join("\n\n");
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
    if (!project.published) return { context: "", ok: false, error: "This project is not published yet." };
    if (project.chat_access === "subscribers") {
      const { data: purchase } = await supabase
        .from("mind_purchases")
        .select("id")
        .eq("user_id", userId)
        .eq("mind_id", mindId)
        .maybeSingle();
      if (!purchase && project.user_id !== userId) {
        return { context: "", ok: false, error: "Subscribe to chat with this Mind." };
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
const PROVIDER_SECRET: Record<ProviderId, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};
const DEFAULT_MODEL: Record<ProviderId, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  deepseek: "deepseek-chat",
};

function isProvider(v: unknown): v is ProviderId {
  return v === "gemini" || v === "openai" || v === "anthropic" || v === "deepseek";
}

/** Direct call to a BYO / backend-secret provider key. Returns null when no key exists. */
async function callProvider(
  provider: ProviderId,
  model: string,
  apiKey: string,
  system: string,
  history: ChatMsg[],
): Promise<Response | null> {
  const messages = history.map((m) => ({
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    content: m.text,
  }));
  try {
    if (provider === "openai" || provider === "deepseek") {
      const base = provider === "openai" ? "https://api.openai.com/v1" : "https://api.deepseek.com/v1";
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      if (!res.ok) return new Response(JSON.stringify({ error: `${provider} request failed (${res.status}).` }), { status: res.status });
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return jsonReply((data.choices?.[0]?.message?.content ?? "").trim());
    }
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
      });
      if (!res.ok) return new Response(JSON.stringify({ error: `Anthropic request failed (${res.status}).` }), { status: res.status });
      const data = (await res.json()) as { content?: { type: string; text?: string }[] };
      return jsonReply((data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim());
    }
    // gemini via backend secret key
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: { maxOutputTokens: 1024 },
        }),
      },
    );
    if (!res.ok) return new Response(JSON.stringify({ error: `Gemini request failed (${res.status}).` }), { status: res.status });
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return jsonReply((data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim());
  } catch {
    return new Response(JSON.stringify({ error: `Could not reach the ${provider} API.` }), { status: 502 });
  }
}

function jsonReply(text: string): Response {
  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
          /** The caller's Google session token, when their sign-in covers Gemini. */
          googleToken?: string;
          /** Live mode: stream the answer out word by word. */
          stream?: boolean;
          /** What the Mind currently sees on a video call. */
          seen?: string;


        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        const lang: LangCode = isLangCode(body.lang) ? body.lang : "en";
        const system = body.mindId ? await resolveSystemPrompt(body.mindId, lang) : null;
        if (!system) {
          return new Response(JSON.stringify({ error: "Unknown mind" }), { status: 400 });
        }
        const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
        if (history.length === 0) {
          return new Response(JSON.stringify({ error: "No messages" }), { status: 400 });
        }

        // Flexible routing: a selected brain engine (BYO key from the client or a
        // backend secret) wins; otherwise fall back to the platform default below.
        if (isProvider(body.provider)) {
          const provider = body.provider;
          const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : DEFAULT_MODEL[provider];
          const key =
            (typeof body.apiKey === "string" && body.apiKey.trim()) ||
            (process.env[PROVIDER_SECRET[provider]] ?? "").trim();
          if (key) {
            const routed = await callProvider(provider, model, key, system, history);
            if (routed) return routed;
          }
        }

        // Default brain: the caller's own Gemini — a key from their vault or
        // account, or their Google sign-in token. There is no shared platform
        // credit to fall back to.
        const {
          resolveGeminiCredential,
          geminiStream,
          geminiGenerate,
          aiErrorResponse,
        } = await import("@/lib/user-ai.server");
        let credential;
        try {
          credential = await resolveGeminiCredential(auth.userId, body);
        } catch (err) {
          return aiErrorResponse(err);
        }

        // On a video call the Mind is also told what it can see right now, so it
        // reacts to the person in front of it the way a caller would expect.
        const seen = typeof body.seen === "string" ? body.seen.trim().slice(0, 400) : "";
        const systemText = seen ? `${system}\n\nRight now you can see on the video call: ${seen}` : system;
        const turns = history.map((m) => ({
          role: (m.role === "user" ? "user" : "model") as "user" | "model",
          parts: [{ text: m.text }],
        }));

        // Live mode: forward the answer word by word so the voice clone can start
        // speaking the first phrase while the rest is still being written. This is
        // what removes the "wait, then talk" delay on voice and video calls.
        if (body.stream === true) {
          const enc = new TextEncoder();
          const live = new ReadableStream<Uint8Array>({
            async start(controller) {
              try {
                await geminiStream({
                  credential,
                  system: systemText,
                  turns,
                  onDelta: (delta) =>
                    controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta })}\n\n`)),
                });
                controller.enqueue(enc.encode("data: [DONE]\n\n"));
              } catch (err) {
                const message = err instanceof Error ? err.message : "AI request failed.";
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
              } finally {
                controller.close();
              }
            },
          });
          return new Response(live, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        }

        try {
          const text = await geminiGenerate({ credential, system: systemText, turns, maxTokens: 1024 });
          return jsonReply(text);
        } catch (err) {
          return aiErrorResponse(err);
        }
      },
    },
  },
});
