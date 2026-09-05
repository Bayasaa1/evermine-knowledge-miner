/**
 * Stage 2 of the two-stage mining pipeline: the understanding pass.
 *
 * Stage 1 (sight and sound) always runs on the built-in Gemini engine and
 * produces the raw senses as text — transcript, face/movement descriptions,
 * emotion readings, voice segments. Stage 2 hands that material to the AI
 * the creator picked in step 3, which thinks over it and contributes extra
 * topics, beliefs, skills and knowledge. Text-only AIs like Groq therefore
 * never touch the footage — they reason over what the built-in engine saw.
 *
 * Team mode (knowledge/sales): 2–3 thinking AIs each analyze the same
 * material independently, then their answers are merged — the union is kept
 * with case-insensitive dedupe, so agreements reinforce and unique findings
 * survive. A member that fails (bad key, rate limit) is skipped, never fatal.
 */
import type { ChunkResult } from "./gemini";
import {
  existingKeyFor,
  findMiner,
  isTeamEligible,
  sensePlan,
  type MinerChoice,
  type MinerId,
  type MinerOption,
} from "./miner-pool";

export type ThinkerReport = {
  id: MinerId;
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
  const text: string = (data?.content ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  return parseThinkerJson(text);
}

async function thinkGemini(key: string, brief: string, signal?: AbortSignal): Promise<ThinkerOutput> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
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

/** Runs one thinking AI over the stage-1 material. */
async function thinkWith(
  id: MinerId,
  opt: MinerOption,
  choice: MinerChoice,
  brief: string,
  signal?: AbortSignal,
): Promise<ThinkerOutput> {
  if (id === "custom") {
    const key = await existingKeyFor("custom");
    if (!key || !choice.custom.endpoint.trim()) throw new Error("no key or endpoint");
    return thinkOpenAICompatible(choice.custom.endpoint, key, choice.custom.model || "gpt-4o-mini", brief, signal);
  }
  const key = await existingKeyFor(id);
  if (!key) throw new Error("no key");
  if (id === "claude") return thinkClaude(key, brief, signal);
  if (id === "gemini" || id === "gemini-pro") return thinkGemini(key, brief, signal);
  return thinkOpenAICompatible(opt.baseUrl, key, opt.testModel, brief, signal);
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
 * No-op when the single pick is the built-in Gemini engine (it already did
 * the thinking in stage 1) or when no picked AI has a key — the built-in
 * result stands on its own.
 */
export async function runUnderstandingPass(
  mined: ChunkResult,
  choice: MinerChoice,
  category: string,
  signal?: AbortSignal,
): Promise<{ result: ChunkResult; reports: ThinkerReport[] }> {
  // Team mode: main pick + up to 2 more thinkers (knowledge/sales only).
  const teamMode = isTeamEligible(category) && choice.team.length > 0;
  const thinkers: MinerId[] = teamMode
    ? dedupe([choice.id, ...choice.team] as string[]).slice(0, 3).map((id) => id as MinerId)
    : [choice.id];

  // Token discipline: when the picked AI already perceives everything this
  // creation type needs, no other AI is called at all — one engine, one bill.
  if (!teamMode && sensePlan(choice, category).selfSufficient) {
    return {
      result: mined,
      reports: [
        {
          id: choice.id,
          label: findMiner(choice.id)?.label ?? choice.id,
          status: "skipped",
          detail: "already did the thinking in stage 1 — no second AI called",
        },
      ],
    };
  }

  // The default Gemini pick already reasoned in stage 1 — nothing to add
  // unless team mode brings other brains in.
  const effective = thinkers.filter((id) => id !== "gemini");
  if (effective.length === 0) return { result: mined, reports: [] };

  const brief = buildBrief(mined, category);
  const outputs: ThinkerOutput[] = [];
  const reports: ThinkerReport[] = [];

  for (const id of effective) {
    const opt = findMiner(id);
    const label = id === "custom" ? choice.custom.label || "Custom AI" : opt?.label ?? id;
    if (!opt) continue;
    try {
      const out = await thinkWith(id, opt, choice, brief, signal);
      outputs.push(out);
      reports.push({ id, label, status: "ok", detail: `${out.knowledge.length + out.topics.length + out.beliefs.length + out.skills.length} findings` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reports.push({ id, label, status: msg === "no key" || msg === "no key or endpoint" ? "skipped" : "failed", detail: msg });
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
