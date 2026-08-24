import type { Chunk } from "./chunking";
import { normalizeChunkResult, type ChunkResult } from "./gemini";
import {
  normalizeOwnership,
  signMind,
  type AccessLevel,
  type DigitalSignature,
  type Ownership,
  type RateUnit,
} from "./ownership";

export const MINE_FORMAT = "evermine.mine";
export const MINE_VERSION = 2;

export type MineResult = { index: number; chunk: Chunk; data: ChunkResult };

export type MineFile = {
  format: typeof MINE_FORMAT;
  version: number;
  savedAt: string;
  source: { name: string; size: number; duration: number | null };
  model: string;
  ownership: Ownership;
  chunks: Chunk[];
  results: MineResult[];
  log: string[];
};

export function buildMineFile(input: {
  source: { name: string; size: number; duration: number | null };
  model: string;
  ownership: Ownership;
  chunks: Chunk[];
  results: MineResult[];
  log: string[];
}): MineFile {
  return {
    format: MINE_FORMAT,
    version: MINE_VERSION,
    savedAt: new Date().toISOString(),
    ...input,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isChunk(v: unknown): v is Chunk {
  return isObj(v) && isNum(v['index']) && isNum(v['start']) && isNum(v['end']) && isNum(v['duration']);
}

/** Every pillar is optional on disk; `normalizeChunkResult` fills the gaps (v1 files included). */
function isChunkResultish(v: unknown): boolean {
  if (!isObj(v)) return false;
  const subtitle = v['subtitle'] ?? v['transcript'];
  if (subtitle !== undefined && !Array.isArray(subtitle)) return false;
  const face = v['faceData'] ?? v['scenes'];
  if (face !== undefined && !Array.isArray(face)) return false;
  if (v['voiceData'] !== undefined && !Array.isArray(v['voiceData'])) return false;
  if (v['story'] !== undefined && !isObj(v['story'])) return false;
  if (v['subconsciousness'] !== undefined && !isObj(v['subconsciousness'])) return false;
  return true;
}

/** Strictly validates a parsed .evermine.json payload. Throws with a readable reason. */
export function parseMineFile(raw: unknown): MineFile {
  if (!isObj(raw)) throw new Error("File is not a valid Evermine object.");
  if (raw['format'] !== MINE_FORMAT) throw new Error('Missing or wrong "format" field — not an Evermine mine file.');
  if (!isNum(raw['version']) || raw['version'] > MINE_VERSION) throw new Error("Unsupported Evermine file version.");
  if (!isStr(raw['savedAt'])) throw new Error('Invalid "savedAt" field.');
  if (!isStr(raw['model'])) throw new Error('Invalid "model" field.');

  const source = raw['source'];
  if (!isObj(source) || !isStr(source['name']) || !isNum(source['size'])) throw new Error('Invalid "source" section.');
  if (!(source['duration'] === null || isNum(source['duration']))) throw new Error('Invalid "source.duration".');

  if (!Array.isArray(raw['chunks']) || !raw['chunks'].every(isChunk)) throw new Error('Invalid "chunks" section.');
  if (!Array.isArray(raw['results'])) throw new Error('Invalid "results" section.');
  const results: MineResult[] = [];
  for (const r of raw['results']) {
    if (!isObj(r) || !isNum(r['index']) || !isChunk(r['chunk']) || !isChunkResultish(r['data']))
      throw new Error('Invalid entry in "results".');
    results.push({ index: r['index'], chunk: r['chunk'], data: normalizeChunkResult(r['data']) });
  }
  if (!Array.isArray(raw['log']) || !raw['log'].every(isStr)) throw new Error('Invalid "log" section.');

  return { ...(raw as unknown as MineFile), results, version: MINE_VERSION };
}

function safeBase(name: string, fallback: string) {
  return (name || fallback).replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || fallback;
}

function downloadJson(data: unknown, filename: string): string {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export function downloadMineFile(mine: MineFile): string {
  return downloadJson(mine, `${safeBase(mine.source.name, "mine")}.evermine.json`);
}

/** Lightweight brain bundle meant to be dropped into an AI agent as system context. */
export type AgentBrain = {
  format: "evermine.agent-brain";
  version: 2;
  createdAt: string;
  mindId: string;
  ownership: {
    creatorName: string;
    creatorEmail: string;
    accessLevel: AccessLevel;
    signature: DigitalSignature;
  };
  monetization: {
    accessLevel: AccessLevel;
    rate: number;
    currency: string;
    unit: RateUnit;
    priceLabel: string;
    listedOnMarketplace: boolean;
    licenseTerms: string;
  };
  persona: {
    source: string;
    videoDuration: number | null;
    segments: number;
    languageNote: string;
  };
  systemPrompt: string;
  narrative: { summary: string[]; tone: string[]; timeline: { timestamp: string; event: string; emotion: string }[] };
  subconsciousness: { skills: string[]; beliefs: string[]; decisionLogic: string[] };
  voiceCloning: { start: string; end: string; quality: string; note: string }[];
  faceCloning: {
    timestamp: string;
    description: string;
    gestures: string;
    lighting: string;
    faceAngle: string;
    cloneQuality: string;
  }[];
  transcript: { timestamp: string; speech: string }[];
};

export async function buildAgentBrain(input: {
  source: { name: string; duration: number | null };
  results: MineResult[];
  ownership: Ownership;
}): Promise<AgentBrain> {
  const ordered = [...input.results].sort((a, b) => a.index - b.index);
  const uniq = (xs: string[]) => Array.from(new Set(xs.map((s) => s.trim()).filter(Boolean)));
  const own = input.ownership;

  const skills = uniq(ordered.flatMap((r) => r.data.subconsciousness.skills));
  const beliefs = uniq(ordered.flatMap((r) => r.data.subconsciousness.beliefs));
  const decisionLogic = uniq(ordered.flatMap((r) => r.data.subconsciousness.decisionLogic));

  const systemPrompt = [
    `You are an AI avatar of the person recorded in "${input.source.name}".`,
    `Speak in their voice, in their own language (Mongolian and English mixed as they mix it). Never invent facts about their life.`,
    `This mind (${own.mindId}) is owned by ${own.creatorName || "its creator"}. Honour the licensing terms shipped with this file.`,
    ``,
    `SKILLS — what they know how to do:`,
    ...skills.map((s) => `- ${s}`),
    ``,
    `BELIEFS & OPINIONS — what they value, advocate or criticise:`,
    ...beliefs.map((s) => `- ${s}`),
    ``,
    `DECISION LOGIC — how they approach problems and choose:`,
    ...decisionLogic.map((s) => `- ${s}`),
  ].join("\n");

  const persona = {
    source: input.source.name,
    videoDuration: input.source.duration,
    segments: ordered.length,
    languageNote: "Verbatim source language preserved (Mongolian / English mix). Do not translate.",
  };
  const narrative = {
    summary: ordered.map((r) => r.data.story.summary).filter(Boolean),
    tone: uniq(ordered.map((r) => r.data.story.tone)),
    timeline: ordered.flatMap((r) => r.data.story.beats),
  };
  const subconsciousness = { skills, beliefs, decisionLogic };
  const voiceCloning = ordered.flatMap((r) => r.data.voiceData);
  const faceCloning = ordered.flatMap((r) => r.data.faceData);
  const transcript = ordered.flatMap((r) => r.data.transcript);

  const signature = await signMind(own, {
    persona,
    systemPrompt,
    narrative,
    subconsciousness,
    voiceCloning,
    faceCloning,
    transcript,
  });

  return {
    format: "evermine.agent-brain",
    version: 2,
    createdAt: new Date().toISOString(),
    mindId: own.mindId,
    ownership: {
      creatorName: own.creatorName,
      creatorEmail: own.creatorEmail,
      accessLevel: own.accessLevel,
      signature,
    },
    monetization: {
      accessLevel: own.accessLevel,
      rate: own.rate,
      currency: own.currency,
      unit: own.rateUnit,
      priceLabel: `${own.rate} ${own.currency} / ${own.rateUnit}`,
      listedOnMarketplace: own.accessLevel === "marketplace",
      licenseTerms: own.licenseTerms,
    },
    persona,
    systemPrompt,
    narrative,
    subconsciousness,
    voiceCloning,
    faceCloning,
    transcript,
  };
}


export function downloadAgentBrain(brain: AgentBrain, sourceName: string): string {
  return downloadJson(brain, `${safeBase(sourceName, "brain")}.agent-brain.json`);
}
