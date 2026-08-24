import type { Chunk } from "./chunking";
import type { ChunkResult } from "./gemini";

export const MINE_FORMAT = "evermine.mine";
export const MINE_VERSION = 1;

export type MineResult = { index: number; chunk: Chunk; data: ChunkResult };

export type MineFile = {
  format: typeof MINE_FORMAT;
  version: number;
  savedAt: string;
  source: { name: string; size: number; duration: number | null };
  model: string;
  chunks: Chunk[];
  results: MineResult[];
  log: string[];
};

export function buildMineFile(input: {
  source: { name: string; size: number; duration: number | null };
  model: string;
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

function isChunkResult(v: unknown): v is ChunkResult {
  if (!isObj(v)) return false;
  const transcript = v['transcript'], scenes = v['scenes'], knowledge = v['knowledge'];
  return (
    Array.isArray(transcript) &&
    transcript.every((l) => isObj(l) && isStr(l['timestamp']) && isStr(l['speech'])) &&
    Array.isArray(scenes) &&
    scenes.every((s) => isObj(s) && isStr(s['timestamp']) && isStr(s['description'])) &&
    Array.isArray(knowledge) &&
    knowledge.every(isStr)
  );
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
  for (const r of raw['results']) {
    if (!isObj(r) || !isNum(r['index']) || !isChunk(r['chunk']) || !isChunkResult(r['data']))
      throw new Error('Invalid entry in "results".');
  }
  if (!Array.isArray(raw['log']) || !raw['log'].every(isStr)) throw new Error('Invalid "log" section.');

  return raw as unknown as MineFile;
}

export function downloadMineFile(mine: MineFile): string {
  const base = (mine.source['name'] || "mine").replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "_") || "mine";
  const filename = `${base}.evermine.json`;
  const blob = new Blob([JSON.stringify(mine, null, 2)], { type: "application/json" });
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
