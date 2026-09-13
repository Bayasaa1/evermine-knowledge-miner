/**
 * The Auditor: a second AI reviews what the miner produced.
 *
 * An auditor reads the mined material (story, transcript, topics, emotions,
 * knowledge) and returns its own independent reading plus a score, what is
 * right, what is wrong and what to do about it. An AI never audits its own
 * work — the pool always excludes the engine that mined the video.
 *
 * Audits are stored inside the saved mind itself and are never hidden: every
 * audit ever made stays listed, one under the other.
 */
import { auditWithBuiltIn } from "./mind-audit.functions";
import type { MindPayload } from "./mind-json";
import {
  MINERS,
  existingKeyFor,
  findMiner,
  type MinerChoice,
  type MinerId,
  type MinerOption,
} from "./miner-pool";
import { recordUsage, readTokens } from "./token-usage";

export type AuditOwnResult = {
  summary: string;
  topics: string[];
  beliefs: string[];
  skills: string[];
  knowledge: string[];
};

export type AuditRecord = {
  id: string;
  auditorId: MinerId;
  auditorLabel: string;
  createdAt: string;
  /** 0–100 quality score the auditor gave the mining result. */
  score: number;
  verdict: string;
  strengths: string[];
  issues: string[];
  recommendations: string[];
  ownResult: AuditOwnResult;
};

/** Audits already stored on a saved mind, newest first. */
export function auditsOf(payload: MindPayload): AuditRecord[] {
  const raw = payload['audits'];
  if (!Array.isArray(raw)) return [];
  return (raw as AuditRecord[]).filter((a) => a && typeof a.id === "string");
}

/** The audit the creator picked to feed the Core Brain, if any. */
export function chosenAuditId(payload: MindPayload): string | null {
  const v = payload['chosenAuditId'];
  return typeof v === "string" ? v : null;
}

/** Which AI mined this result (stored at mining time), when known. */
export function minedBy(payload: MindPayload): MinerId | null {
  const v = payload['minedBy'];
  return typeof v === "string" && findMiner(v) ? (v as MinerId) : null;
}

/**
 * Auditors worth offering: AIs that can reason over text, minus the engine
 * that produced the result (no self-marking) and minus the manual slot when
 * it is not configured.
 */
export function auditorsFor(payload: MindPayload, choice: MinerChoice): MinerOption[] {
  const mined = minedBy(payload);
  return MINERS.filter((m) => {
    if (m.id === mined) return false;
    if (!m.senses.includes("text")) return false;
    if (m.id === "custom") return !!choice.custom.endpoint.trim();
    return true;
  });
}

const AUDIT_PROMPT = `You are an independent AUDITOR of a video-mining result produced by another AI. You receive the material the miner extracted from a video.

Do two jobs:
1. Produce your OWN independent reading of the same material.
2. Judge the miner's work: what is correct, what is wrong, missing, invented or badly timed.

Return strict JSON with exactly these keys:
- "score": number 0-100 — overall quality of the mining result
- "verdict": string — one short sentence summing up your judgement
- "strengths": string[] — what the miner got right (up to 6)
- "issues": string[] — concrete problems: wrong or missing timestamps, invented facts, thin topics, mislabelled emotions, broken story (up to 8)
- "recommendations": string[] — what to do to fix it, actionable (up to 6)
- "ownResult": { "summary": string, "topics": string[], "beliefs": string[], "skills": string[], "knowledge": string[] }

Rules: judge only what the material supports, never invent facts about the video. Short strings, one idea each. No text outside the JSON.`;

/** Compact brief of the mined material, capped so small contexts still work. */
export function buildAuditBrief(payload: MindPayload): string {
  const result = (payload.result ?? {}) as Record<string, unknown>;
  const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const story = (result['story'] ?? {}) as Record<string, unknown>;
  const sub = (result['subconsciousness'] ?? {}) as Record<string, unknown>;

  const transcript = list(result['transcript'])
    .slice(0, 350)
    .map((l) => `[${String(l['timestamp'] ?? "")}] ${l['speaker'] ? `${String(l['speaker'])}: ` : ""}${String(l['speech'] ?? "")}`)
    .join("\n");
  const emotions = list(result['emotionTimeline'])
    .slice(0, 80)
    .map((e) => `[${String(e['timestamp_start'] ?? e['timestamp'] ?? "")}] ${String(e['primary_emotion'] ?? "")}`)
    .join("\n");
  const scenes = list(result['scenes'])
    .slice(0, 80)
    .map((s) => `[${String(s['timestamp'] ?? "")}] ${String(s['description'] ?? "")}`)
    .join("\n");
  const strings = (v: unknown): string =>
    Array.isArray(v) ? v.filter((s) => typeof s === "string").join(", ") : "";

  return [
    `Creation type: ${String(payload['category'] ?? "knowledge")}`,
    `Miner's story summary: ${String(story['summary'] ?? "")}`,
    `Miner's tone: ${String(story['tone'] ?? "")}`,
    `Miner's topics: ${strings(result['topics'])}`,
    `Miner's beliefs: ${strings(sub['beliefs'])}`,
    `Miner's skills: ${strings(sub['skills'])}`,
    scenes ? `Scenes:\n${scenes}` : "",
    emotions ? `Emotion readings:\n${emotions}` : "",
    `Transcript with timestamps:\n${transcript}`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 14000);
}

function parseAudit(text: string): Omit<AuditRecord, "id" | "auditorId" | "auditorLabel" | "createdAt"> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The auditor did not return a readable report.");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim()) : [];
  const own = (parsed['ownResult'] ?? {}) as Record<string, unknown>;
  const rawScore = Number(parsed['score']);
  return {
    score: Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0,
    verdict: typeof parsed['verdict'] === "string" ? parsed['verdict'] : "",
    strengths: arr(parsed['strengths']),
    issues: arr(parsed['issues']),
    recommendations: arr(parsed['recommendations']),
    ownResult: {
      summary: typeof own['summary'] === "string" ? own['summary'] : "",
      topics: arr(own['topics']),
      beliefs: arr(own['beliefs']),
      skills: arr(own['skills']),
      knowledge: arr(own['knowledge']),
    },
  };
}

async function chatOpenAICompatible(
  provider: string,
  base: string,
  key: string,
  model: string,
  brief: string,
): Promise<string> {
  const res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: AUDIT_PROMPT },
        { role: "user", content: brief },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${provider} refused the audit (HTTP ${res.status}).`);
  const data = await res.json();
  void recordUsage({ provider, model, stage: "audit", ...readTokens(data) });
  return data?.choices?.[0]?.message?.content ?? "";
}

async function chatClaude(key: string, brief: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 2000,
      system: AUDIT_PROMPT,
      messages: [{ role: "user", content: brief }],
    }),
  });
  if (!res.ok) throw new Error(`Claude refused the audit (HTTP ${res.status}).`);
  const data = await res.json();
  void recordUsage({ provider: "claude", model: "claude-3-5-haiku-latest", stage: "audit", ...readTokens(data) });
  return (data?.content ?? []).map((p: { text?: string }) => p.text ?? "").join("");
}

async function chatGeminiKey(key: string, brief: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `${AUDIT_PROMPT}\n\n${brief}` }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini refused the audit (HTTP ${res.status}).`);
  const data = await res.json();
  void recordUsage({ provider: "gemini", model: "gemini-2.5-flash", stage: "audit", ...readTokens(data) });
  return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

/** Runs one auditor over a saved mind and returns the finished audit record. */
export async function runAudit(
  auditorId: MinerId,
  choice: MinerChoice,
  payload: MindPayload,
): Promise<AuditRecord> {
  const opt = findMiner(auditorId);
  if (!opt) throw new Error("Unknown auditor.");
  const label = auditorId === "custom" ? choice.custom.label || "Custom AI" : opt.label;
  const brief = buildAuditBrief(payload);

  let text = "";
  if (auditorId === "custom") {
    const key = await existingKeyFor("custom");
    if (!key) throw new Error("Add the API key for your own AI first.");
    text = await chatOpenAICompatible("custom", choice.custom.endpoint, key, choice.custom.model || "gpt-4o-mini", brief);
  } else {
    const key = await existingKeyFor(auditorId);
    if (auditorId === "gemini" && !key) {
      throw new Error("Add your free Gemini key in Engines first — the auditor runs on your own quota.");
    } else if (!key) {
      throw new Error(`${label} needs its API key before it can audit.`);
    } else if (auditorId === "claude") {
      text = await chatClaude(key, brief);
    } else if (auditorId === "gemini") {
      text = await chatGeminiKey(key, brief);
    } else {
      text = await chatOpenAICompatible(auditorId, opt.baseUrl, key, opt.testModel, brief);
    }
  }

  return {
    id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    auditorId,
    auditorLabel: label,
    createdAt: new Date().toISOString(),
    ...parseAudit(text),
  };
}
