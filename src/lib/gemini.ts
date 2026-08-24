const BASE = "https://generativelanguage.googleapis.com";

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

export function describeError(err: unknown): string {
  if (err instanceof GeminiError) {
    if (err.status === 401 || err.status === 403) return `Invalid or unauthorized API key (${err.status}): ${err.message}`;
    if (err.status === 429) return `Quota / rate limit reached (429): ${err.message}`;
    if (err.status >= 500) return `Gemini service error (${err.status}): ${err.message}`;
    return `Request failed (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function readError(res: Response): Promise<GeminiError> {
  let msg = res.statusText || "Unknown error";
  try {
    const body = await res.json();
    msg = body?.error?.message ?? msg;
  } catch {
    /* ignore */
  }
  return new GeminiError(msg, res.status);
}

export async function validateApiKey(key: string): Promise<string[]> {
  const res = await fetch(`${BASE}/v1beta/models?pageSize=50&key=${encodeURIComponent(key)}`);
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  return (data.models ?? []).map((m: { name: string }) => m.name);
}

export type UploadedFile = { uri: string; mimeType: string; name: string };

/** Uploads a video with the resumable File API and waits until it is ACTIVE. */
export async function uploadVideo(
  key: string,
  file: File,
  opts: { signal?: AbortSignal; onState?: (state: string) => void } = {},
): Promise<UploadedFile> {
  const mimeType = file.type || "video/mp4";
  const startRes = await fetch(`${BASE}/upload/v1beta/files?key=${encodeURIComponent(key)}`, {
    method: "POST",
    signal: opts.signal ?? null,
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: file.name } }),
  });
  if (!startRes.ok) throw await readError(startRes);
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new GeminiError("Upload URL missing from Gemini response", startRes.status);

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    signal: opts.signal ?? null,
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: file,
  });
  if (!uploadRes.ok) throw await readError(uploadRes);
  const uploaded = await uploadRes.json();
  let info = uploaded.file as { uri: string; name: string; state: string; mimeType?: string };

  while (info.state === "PROCESSING") {
    opts.onState?.(info.state);
    await new Promise((r) => setTimeout(r, 3000));
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const pollRes = await fetch(`${BASE}/v1beta/${info.name}?key=${encodeURIComponent(key)}`, { signal: opts.signal ?? null });
    if (!pollRes.ok) throw await readError(pollRes);
    info = await pollRes.json();
  }
  if (info.state !== "ACTIVE") throw new GeminiError(`Video processing failed (state ${info.state})`, 400);
  opts.onState?.(info.state);
  return { uri: info.uri, mimeType: info.mimeType ?? mimeType, name: info.name };
}

export type TranscriptLine = { timestamp: string; speech: string };
export type SceneNote = { timestamp: string; description: string };
export type ChunkResult = {
  transcript: TranscriptLine[];
  scenes: SceneNote[];
  knowledge: string[];
};

const responseSchema = {
  type: "object",
  properties: {
    transcript: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          speech: { type: "string" },
        },
        required: ["timestamp", "speech"],
      },
    },
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          description: { type: "string" },
        },
        required: ["timestamp", "description"],
      },
    },
    knowledge: { type: "array", items: { type: "string" } },
  },
  required: ["transcript", "scenes", "knowledge"],
};

const PROMPT = `You are analysing one segment of a personal-archive video.

Return JSON with three fields:
1. "transcript": the EXACT VERBATIM transcript of everything spoken, split into short lines, each with a "timestamp" in MM:SS or HH:MM:SS form relative to the start of the whole video. NEVER translate or paraphrase. Keep the original language exactly as spoken, preserving any mix of Mongolian (Cyrillic) and English word for word, including filler words.
2. "scenes": what can be SEEN on screen, as short visual descriptions with timestamps (people, place, objects, actions, on-screen text).
3. "knowledge": short bulleted factual statements of what the speaker knows or believes (facts, opinions, values, memories, skills). One idea per bullet, written in the speaker's original language.

Only cover the requested time range. Output JSON only.`;

export async function mineChunk(
  key: string,
  model: string,
  fileRef: UploadedFile,
  startSec: number,
  endSec: number,
  signal?: AbortSignal,
): Promise<ChunkResult> {
  const res = await fetch(
    `${BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      signal: signal ?? null,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: { fileUri: fileRef.uri, mimeType: fileRef.mimeType },
                videoMetadata: {
                  startOffset: `${Math.floor(startSec)}s`,
                  endOffset: `${Math.ceil(endSec)}s`,
                },
              },
              {
                text: `${PROMPT}\n\nTime range for this segment: ${Math.floor(startSec)}s to ${Math.ceil(endSec)}s of the video.`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    },
  );
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new GeminiError("Gemini returned an empty response for this piece", 500);
  let parsed: ChunkResult;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError("Could not parse JSON returned by Gemini", 500);
  }
  return {
    transcript: Array.isArray(parsed.transcript) ? parsed.transcript : [],
    scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
    knowledge: Array.isArray(parsed.knowledge) ? parsed.knowledge : [],
  };
}

export async function deleteFile(key: string, name: string): Promise<void> {
  try {
    await fetch(`${BASE}/v1beta/${name}?key=${encodeURIComponent(key)}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}
