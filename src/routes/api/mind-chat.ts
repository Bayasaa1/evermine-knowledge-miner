import { createFileRoute } from "@tanstack/react-router";
import { guardApi } from "@/lib/api-guard.server";
import { findMind } from "@/lib/minds";
import { LANGUAGES, isLangCode, type LangCode } from "@/lib/languages";

type ChatMsg = { role: "user" | "agent"; text: string };

function buildSystemPrompt(mindId: string, lang: LangCode) {
  const mind = findMind(mindId);
  if (!mind) return null;
  const b = mind.coreBrain;
  return [
    `You are an AI Clone of ${mind.name}, a Mind Vault mined by Evermine from the Primary Owner's own videos.`,
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
    `- Keep answers short: 2-5 sentences, or a tight markdown list. Use markdown (bold, lists, links, fenced code) when it genuinely helps.`,
  ].join("\n");
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
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
        }

        const lang: LangCode = isLangCode(body.lang) ? body.lang : "en";
        const system = body.mindId ? buildSystemPrompt(body.mindId, lang) : null;
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

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI is not configured" }), { status: 500 });
        }

        const input = [
          { role: "developer", content: [{ type: "input_text", text: system }] },
          ...history.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: [
              m.role === "user"
                ? { type: "input_text", text: m.text }
                : { type: "output_text", text: m.text },
            ],
          })),
        ];

        let res: Response;
        try {
          res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": apiKey,
              "X-Lovable-AIG-SDK": "fetch",
            },
            body: JSON.stringify({
              model: "openai/gpt-5.6-luna",
              input,
              stream: true,
              store: false,
            }),
          });
        } catch {
          return new Response(JSON.stringify({ error: "Could not reach the AI service" }), {
            status: 502,
          });
        }

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          const message =
            res.status === 429
              ? "This mind is busy right now — try again in a moment."
              : res.status === 402
                ? "AI credits are exhausted for this workspace."
                : res.status === 403
                  ? "AI access is blocked for this workspace."
                  : `AI request failed (${res.status}).`;
          console.error("mind-chat gateway error", res.status, detail.slice(0, 500));
          return new Response(JSON.stringify({ error: message }), { status: res.status });
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const evt = JSON.parse(payload) as {
                type?: string;
                delta?: string;
                response?: { output_text?: string };
              };
              if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
                text += evt.delta;
              } else if (evt.type === "response.completed" && !text) {
                text = evt.response?.output_text ?? "";
              }
            } catch {
              /* ignore keep-alive fragments */
            }
          }
        }

        return new Response(JSON.stringify({ text: text.trim() }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
