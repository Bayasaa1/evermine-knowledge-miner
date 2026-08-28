/**
 * Server-only YouTube metadata helpers.
 * Used to plan the 5-minute chunk schedule and to expand playlist links into
 * the individual videos that get queued through the mining pipeline.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Fallback plan length when YouTube does not expose a duration. */
export const FALLBACK_DURATION_SEC = 20 * 60;

export type VideoMeta = { videoId: string; url: string; title: string; durationSec: number };

/** Shared with the client parser so every playlist URL form behaves the same. */
export { youtubePlaylistId as playlistId } from "@/lib/import-sources";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
  if (!res.ok) throw new Error(`Could not read ${url} (${res.status}).`);
  return res.text();
}

/** Every unique video id inside a public YouTube playlist, in playlist order. */
export async function fetchPlaylistVideoIds(list: string, limit = 50): Promise<string[]> {
  const html = await fetchText(`https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/"videoId":"([\w-]{11})"/g)) {
    const id = m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

export async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let title = videoId;
  let durationSec = FALLBACK_DURATION_SEC;
  try {
    const html = await fetchText(url);
    const len = html.match(/"lengthSeconds":"(\d+)"/);
    if (len?.[1]) {
      const n = Number(len[1]);
      if (Number.isFinite(n) && n > 0) durationSec = n;
    }
    const t = html.match(/<meta name="title" content="([^"]{1,200})"/);
    if (t?.[1]) title = t[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  } catch {
    // Metadata is best effort — the chunk plan falls back to a safe default.
  }
  return { videoId, url, title, durationSec };
}
