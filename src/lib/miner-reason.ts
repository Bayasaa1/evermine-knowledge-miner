/**
 * Stage 2 of the two-stage mining pipeline: the understanding pass.
 *
 * Stage 1 (sight and sound) always runs on the built-in Gemini engine and
 * produces the raw senses as text — transcript, face/movement descriptions,
 * emotion readings, voice segments. Stage 2 hands that material to the AI
 * the creator picked in step 3, which thinks over it and contributes extra
 * topics, beliefs, skills and knowledge. Text-only AIs like Groq therefore
 * never touch the footage — they reason over what Gemini saw using the creator's key.
 *
 * Team mode (knowledge/sales): 2–3 thinking AIs each analyze the same
 * material independently, then their answers are merged — the union is kept
 * with case-insensitive dedupe, so agreements reinforce and unique findings
 * survive. A member that fails (bad key, rate limit) is skipped, never fatal.
 */
import type { ChunkResult } from "./gemini";
import { recordUsage, readTokens } from "./token-usage";
import { findProviderInfo, rankedCredentials, type Credential } from "./key-manager";

/** How many saved keys think over one chunk — keeps mining fast and cheap. */
const MAX_THINKERS = 2;

export type ThinkerReport = {
  id: string;
  label: string;
  status: "ok" | "skipped" | "failed";
  detail: string;
};

type ThinkerOutput = {
  topics: string[];
  beliefs: string[];
  skills: string[];
  knowledge: string[];
};

const EMPTY_OUTPUT: ThinkerOutput = { topics: [], beliefs: [], skills: [], knowledge: [] };

/** Compact text brief of everything stage 1 perceived, capped for small contexts. */
function buildBrief(mined: ChunkResult, category: string): string {
  const transcript = mined.transcript
    .slice(0, 400)
    .map((l) => `[${l.timestamp ?? ""}] ${l.speaker ? `${l.speaker}: ` : ""}${l.speech}`)
    .join("\n");
  const emotions = mined.emotionTimeline
    .slice(0, 120)
    .map(
      (e) =>
        `[${e.timestamp_start ?? ""}→${e.timestamp_end ?? ""}] ${e.primary_emotion} (${Math.round((e.expression_intensity ?? 0) * 100)}%)` +
        `${e.facial_trigger ? ` — ${e.facial_trigger}` : ""}${e.evidence ? ` — ${e.evidence}` : ""}`,
    )
    .join("\n");
  const scenes = mined.scenes
    .slice(0, 120)
    .map((s) => `[${s.timestamp ?? ""}] ${s.description}`)
    .join("\n");
  const parts = [
    `Creation type: ${category}`,
    `Story summary: ${mined.story.summary ?? ""}`,
    `Tone: ${mined.story.tone ?? ""}`,
    scenes ? `Scenes and movement:\n${scenes}` : "",
    emotions ? `Emotion readings:\n${emotions}` : "",
    `Transcript:\n${transcript}`,
  ].filter(Boolean);
  return parts.join("\n\n").slice(0, 14000);
}

const THINK_PROMPT = `You are the understanding stage of a video-mining pipeline. Another engine already watched the video and extracted the material below (transcript, scenes, emotion readings). Your job is THINKING only: find what it missed.

Return strict JSON with exactly these keys:
- "topics": string[] — the video's main topics (up to 8)
- "beliefs": string[] — beliefs or values the speaker reveals (up to 8)
- "skills": string[] — skills demonstrated or taught (up to 8)
- "knowledge": string[] — concrete lessons, facts or insights worth remembering (up to 10)

Rules: no invented facts — only what the material supports. Short strings, one idea each. No commentary outside the JSON.`;

/** One chat completion against an OpenAI-compatible endpoint, parsed leniently. */
async function thinkOpenAICompatible(
  provider: string,
  base: string,
  key: string,
  model: string,
  brief: string,
  signal?: AbortSignal,
): Promise<ThinkerOutput> {
  const res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    signal: signal ?? null,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: THINK_PROMPT },
        { role: "user", content: brief },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  void recordUsage({ provider, model, stage: "thinking", ...readTokens(data) });
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return parseThinkerJson(text);
}

async function thinkClaude(key: string, brief: string, signal?: AbortSignal): Promise<ThinkerOutput> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: signal ?? null,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1500,
      system: THINK_PROMPT,
      messages: [{ role: "user", content: brief }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  void recordUsage({ provider: "claude", model: "claude-3-5-haiku-latest", stage: "thinking", ...readTokens(data) });
  const text: string = (data?.content ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  return parseThinkerJson(text);
}

async function thinkGemini(key: string, brief: string, signal?: AbortSignal): Promise<ThinkerOutput> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      signal: signal ?? null,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${THINK_PROMPT}\n\n${brief}` }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  void recordUsage({ provider: "gemini", model: "gemini-3.1-flash-lite", stage: "thinking", ...readTokens(data) });
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return parseThinkerJson(text);
}

/** Extracts the JSON object even when the model wraps it in prose or fences. */
function parseThinkerJson(text: string): ThinkerOutput {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON in reply");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim()) : [];
  return {
    topics: arr(parsed['topics']),
    beliefs: arr(parsed['beliefs']),
    skills: arr(parsed['skills']),
    knowledge: arr(parsed['knowledge']),
  };
}

/** Runs one thinking AI over the stage-1 material, using a saved key. */
async function thinkWith(cred: Credential, brief: string, signal?: AbortSignal): Promise<ThinkerOutput> {
  if (cred.provider === "anthropic") return thinkClaude(cred.apiKey, brief, signal);
  if (cred.provider === "gemini") return thinkGemini(cred.apiKey, brief, signal);
  if (!cred.baseUrl) throw new Error("no endpoint set for this AI");
  return thinkOpenAICompatible(cred.provider, cred.baseUrl, cred.apiKey, cred.model, brief, signal);
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const k = item.toLowerCase().replace(/\s+/g, " ").trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item.trim());
  }
  return out;
}

/**
 * Runs the understanding pass over a mined chunk. Returns the enriched result
 * plus a per-thinker report so the terminal can show who contributed.
 *
 * The thinkers come straight from the creator's own numbered key list: Gemini
 * already did the seeing and hearing in stage 1, so the next keys in the order
 * do the thinking. A key that is out of tokens, switched off or over its cap is
 * never handed back by `rankedCredentials`, so the one below it takes the work.
 * No-op when Gemini is the only saved key.
 */
export async function runUnderstandingPass(
  mined: ChunkResult,
  category: string,
  signal?: AbortSignal,
): Promise<{ result: ChunkResult; reports: ThinkerReport[] }> {
  const chain = await rankedCredentials();
  const thinkers: Credential[] = chain.filter((c) => c.provider !== "gemini").slice(0, MAX_THINKERS);
  if (thinkers.length === 0) return { result: mined, reports: [] };

  const brief = buildBrief(mined, category);
  const outputs: ThinkerOutput[] = [];
  const reports: ThinkerReport[] = [];

  for (const cred of thinkers) {
    const label = findProviderInfo(cred.provider)?.label ?? cred.provider;
    try {
      const out = await thinkWith(cred, brief, signal);
      outputs.push(out);
      reports.push({
        id: cred.provider,
        label,
        status: "ok",
        detail: `${out.knowledge.length + out.topics.length + out.beliefs.length + out.skills.length} findings`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reports.push({ id: cred.provider, label, status: "failed", detail: msg });
    }
  }


  if (outputs.length === 0) return { result: mined, reports };

  // Merge: union with dedupe — agreements reinforce, unique findings survive.
  const knowledge = dedupe([...mined.knowledge, ...outputs.flatMap((o) => [...o.knowledge, ...o.topics])]);
  const beliefs = dedupe([...mined.subconsciousness.beliefs, ...outputs.flatMap((o) => o.beliefs)]);
  const skills = dedupe([...mined.subconsciousness.skills, ...outputs.flatMap((o) => o.skills)]);

  return {
    result: {
      ...mined,
      knowledge,
      subconsciousness: { ...mined.subconsciousness, beliefs, skills },
    },
    reports,
  };
}
