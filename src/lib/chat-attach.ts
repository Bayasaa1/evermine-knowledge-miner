/**
 * Turns a chat attachment into text the Mind can read. Word, Excel, CSV and
 * text files are read on the device; pictures, voice, video and PDF are read by
 * the user's own Gemini key. The result rides inside the user's message.
 */
import { apiFetch } from "@/lib/api-fetch";

export const ATTACH_ACCEPT =
  "image/*,audio/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.json";

const FILE_OPEN = "\n\n[[file:";
const MAX_TEXT = 12_000;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function kindOf(file: File): "image" | "audio" | "video" | "pdf" | "word" | "excel" | "text" | null {
  const n = file.name.toLowerCase();
  const t = file.type;
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx") || n.endsWith(".doc")) return "word";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "excel";
  if (/\.(csv|txt|md|json)$/.test(n) || t.startsWith("text/")) return "text";
  return null;
}

export async function readAttachment(file: File): Promise<string> {
  const kind = kindOf(file);
  if (!kind) throw new Error("This file type is not supported.");
  if (file.size > 15 * 1024 * 1024) throw new Error("File is larger than 15 MB.");
  let text = "";
  if (kind === "text") text = await file.text();
  else if (kind === "word") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else if (kind === "excel") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    text = wb.SheetNames.map((s) => `# ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s]!)}`).join("\n\n");
  } else {
    const mime = kind === "pdf" ? "application/pdf" : file.type;
    const res = await apiFetch("/api/chat-attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, mime, data: toBase64(await file.arrayBuffer()) }),
    });
    const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok || !json.text) throw new Error(json.error ?? "The file could not be read.");
    text = json.text;
  }
  text = text.trim();
  if (!text) throw new Error("The file looks empty.");
  return `${FILE_OPEN}${file.name}|${kind}]]\n${text.slice(0, MAX_TEXT)}\n[[/file]]`;
}

/** Splits a saved message into what the user typed and its attached file names. */
export function splitAttachments(text: string): { body: string; files: { name: string; kind: string }[] } {
  const files: { name: string; kind: string }[] = [];
  const body = text
    .replace(/\n*\[\[file:([^|\]]+)\|([a-z]+)\]\][\s\S]*?\[\[\/file\]\]/g, (_m, name: string, kind: string) => {
      files.push({ name, kind });
      return "";
    })
    .trim();
  return { body, files };
}
