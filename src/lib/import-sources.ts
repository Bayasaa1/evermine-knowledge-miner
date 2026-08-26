/**
 * Direct multi-source import. YouTube and Google Drive links are handed to the
 * Gemini multimodal API as-is — no downloading, converting or audio splitting on
 * the client. Every failure is expressed as a dictionary key so the UI can show a
 * human-readable, localized message instead of a developer log line.
 */

export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
export const MAX_DURATION_SEC = 2 * 60 * 60; // 2 hours
export const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const ALLOWED_EXT = [".mp4", ".mov", ".webm"];

export type SourceKind = "youtube" | "drive" | "file";

export type ImportSource =
  | { kind: "youtube"; url: string; label: string }
  | { kind: "drive"; url: string; label: string }
  | { kind: "file"; file: File; label: string };

/** Dictionary key of a human-readable error, see src/lib/i18n.ts. */
export type ImportError = { errorKey: string };

export type ImportCheck = { ok: true; source: ImportSource } | { ok: false; error: ImportError };

const YT_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"];

export function youtubeId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!YT_HOSTS.includes(u.hostname)) return null;
  if (u.hostname.endsWith("youtu.be")) {
    const id = u.pathname.slice(1);
    return id.length >= 6 ? id : null;
  }
  const v = u.searchParams.get("v");
  if (v && v.length >= 6) return v;
  const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{6,})/);
  return m?.[2] ?? null;
}

export function driveFileId(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!u.hostname.endsWith("drive.google.com") && !u.hostname.endsWith("docs.google.com")) return null;
  const m = u.pathname.match(/\/d\/([\w-]{10,})/);
  if (m?.[1]) return m[1];
  const id = u.searchParams.get("id");
  return id && id.length >= 10 ? id : null;
}

export function checkYoutube(url: string): ImportCheck {
  const id = youtubeId(url);
  if (!id) return { ok: false, error: { errorKey: "errUrlInvalid" } };
  return { ok: true, source: { kind: "youtube", url: `https://www.youtube.com/watch?v=${id}`, label: url.trim() } };
}

export function checkDrive(url: string): ImportCheck {
  const id = driveFileId(url);
  if (!id) return { ok: false, error: { errorKey: "errUrlInvalid" } };
  return { ok: true, source: { kind: "drive", url: `https://drive.google.com/uc?export=download&id=${id}`, label: url.trim() } };
}

export function checkFile(file: File): ImportCheck {
  const name = file.name.toLowerCase();
  const typeOk = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXT.some((e) => name.endsWith(e));
  if (!typeOk) return { ok: false, error: { errorKey: "errFileType" } };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: { errorKey: "errFileSize" } };
  return { ok: true, source: { kind: "file", file, label: file.name } };
}

/** Maps any thrown value onto a localized dictionary key. */
export function errorKeyFor(err: unknown): string {
  const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : 0;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/quota|rate limit|exhaust/i.test(msg) || status === 429) return "errQuota";
  if (status === 401 || status === 403 || /api key/i.test(msg)) return "errKey";
  if (/private|not found|unavailable/i.test(msg) && /youtube/i.test(msg)) return "errUrlPrivate";
  if (/failed to fetch|network|offline|ECONN|timeout|aborted/i.test(msg) || status === 0) return "errNetwork";
  return "errGeneric";
}
