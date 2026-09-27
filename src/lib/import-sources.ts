/**
 * Direct multi-source import. YouTube and Google Drive links are handed to the
 * Gemini multimodal API as-is — no downloading, converting or audio splitting on
 * the client. Every failure is expressed as a dictionary key so the UI can show a
 * human-readable, localized message instead of a developer log line.
 */

export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
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

/**
 * Extracts the video id from any YouTube form: watch, youtu.be short links,
 * shorts, embeds and live streams — with or without a scheme, and with any
 * tracking or timestamp query parameters attached.
 */
export function youtubeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^m\./, "");
  if (!YT_HOSTS.includes(u.hostname.toLowerCase()) && !YT_HOSTS.includes(host)) return null;
  if (host.endsWith("youtu.be")) {
    const id = u.pathname.slice(1).split("/")[0] ?? "";
    return /^[\w-]{6,}$/.test(id) ? id : null;
  }
  const v = u.searchParams.get("v");
  if (v && /^[\w-]{6,}$/.test(v)) return v;
  const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{6,})/);
  return m?.[2] ?? null;
}

/**
 * Extracts a playlist id from every YouTube playlist form:
 *   youtube.com/playlist?list=PL…
 *   youtube.com/watch?v=…&list=PL…
 *   m./music./youtu.be links, with or without a scheme.
 * Auto-generated mixes (RD…, radio) have no stable page and are rejected.
 */
export function youtubePlaylistId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, "")}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)youtube\.com$/.test(host) && !/(^|\.)youtu\.be$/.test(host)) return null;
  const list = u.searchParams.get("list");
  if (!list || !/^[\w-]{10,}$/.test(list)) return null;
  if (/^(RD|UL|LL|WL)/.test(list)) return null;
  return list;
}

/** True when the link points at a playlist (with or without a video id). */
export function isYoutubePlaylist(raw: string): boolean {
  return youtubePlaylistId(raw) !== null;
}

/** Canonical watch URL for any YouTube link form, or null when unrecognisable. */
export function normalizeYoutubeUrl(raw: string): string | null {
  const list = youtubePlaylistId(raw);
  const id = youtubeId(raw);
  if (list && !id) return `https://www.youtube.com/playlist?list=${list}`;
  if (id && list) return `https://www.youtube.com/watch?v=${id}&list=${list}`;
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
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
  const normalized = normalizeYoutubeUrl(url);
  if (!normalized) return { ok: false, error: { errorKey: "errUrlInvalid" } };
  return { ok: true, source: { kind: "youtube", url: normalized, label: url.trim() } };
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
  if (/SAFETY_BLOCKED|safety filter|safety|prohibited content|harm_category/i.test(msg)) return "errSafety";
  if (/quota|rate limit|exhaust/i.test(msg) || status === 429) return "errQuota";
  if (status === 401 || status === 403 || /api key/i.test(msg)) return "errKey";
  if (/private|not found|unavailable/i.test(msg) && /youtube/i.test(msg)) return "errUrlPrivate";
  if (/failed to fetch|network|offline|ECONN|timeout|aborted/i.test(msg) || status === 0) return "errNetwork";
  return "errGeneric";
}

/**
 * Non-YouTube video sites used where YouTube is blocked or slow (China, Russia)
 * plus plain video file links. Returns the official embed player for playback.
 */
export type OtherPlatform = "bilibili" | "vk" | "rutube" | "direct";
export type OtherVideo = { platform: OtherPlatform; url: string; embedUrl: string | null };

export function otherVideo(raw: string | null | undefined): OtherVideo | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (/(^|\.)bilibili\.com$/.test(host) || host === "b23.tv") {
    const bv = u.pathname.match(/(BV[\w]{10})/)?.[1];
    if (bv) return { platform: "bilibili", url: u.href, embedUrl: `https://player.bilibili.com/player.html?bvid=${bv}&autoplay=0&high_quality=1` };
    const av = u.pathname.match(/\/av(\d+)/)?.[1];
    if (av) return { platform: "bilibili", url: u.href, embedUrl: `https://player.bilibili.com/player.html?aid=${av}&autoplay=0&high_quality=1` };
    return null;
  }
  if (/(^|\.)(vk\.com|vkvideo\.ru|vk\.ru)$/.test(host)) {
    const m = (u.pathname + "?" + u.search).match(/video(-?\d+)_(\d+)/);
    if (m) return { platform: "vk", url: u.href, embedUrl: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2` };
    return null;
  }
  if (/(^|\.)rutube\.ru$/.test(host)) {
    const id = u.pathname.match(/\/(?:video|play\/embed|shorts)\/([a-f0-9]{32})/i)?.[1];
    if (id) return { platform: "rutube", url: u.href, embedUrl: `https://rutube.ru/play/embed/${id}` };
    return null;
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { platform: "direct", url: u.href, embedUrl: null };
  return null;
}

/** Other-sites tab: direct video links can be mined straight from the link. */
export function checkLink(url: string): ImportCheck {
  const v = otherVideo(url);
  if (!v) return { ok: false, error: { errorKey: "errUrlInvalid" } };
  if (v.platform !== "direct") return { ok: false, error: { errorKey: "errPlatformUpload" } };
  return { ok: true, source: { kind: "drive", url: v.url, label: url.trim() } };
}
