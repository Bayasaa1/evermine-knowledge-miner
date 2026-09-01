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

/** Rich metadata for zero-touch onboarding: oEmbed + watch-page scrape. */
export type VideoDetails = {
  videoId: string;
  url: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSec: number;
  thumbnail: string;
  channel: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function fetchVideoDetails(videoId: string): Promise<VideoDetails> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const details: VideoDetails = {
    videoId,
    url,
    title: "",
    description: "",
    publishedAt: "",
    durationSec: 0,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    channel: "",
  };

  // oEmbed is the most reliable source for title + author.
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { "User-Agent": UA } },
    );
    if (res.ok) {
      const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
      if (j.title) details.title = j.title;
      if (j.author_name) details.channel = j.author_name;
      if (j.thumbnail_url) details.thumbnail = j.thumbnail_url.replace("hqdefault", "maxresdefault");
    }
  } catch {
    // best effort
  }

  try {
    const html = await fetchText(url);
    const len = html.match(/"lengthSeconds":"(\d+)"/);
    if (len?.[1]) {
      const n = Number(len[1]);
      if (Number.isFinite(n) && n > 0) details.durationSec = n;
    }
    const desc =
      html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1] ??
      html.match(/<meta name="description" content="([^"]*)"/)?.[1] ??
      "";
    if (desc) {
      try {
        details.description = JSON.parse(`"${desc.replace(/"/g, '\\"').replace(/\\\\"/g, '\\"')}"`) as string;
      } catch {
        details.description = decodeEntities(desc.replace(/\\n/g, "\n"));
      }
    }
    const published =
      html.match(/"publishDate":"([^"]+)"/)?.[1] ??
      html.match(/<meta itemprop="datePublished" content="([^"]+)"/)?.[1] ??
      html.match(/"uploadDate":"([^"]+)"/)?.[1] ??
      "";
    if (published) details.publishedAt = published;
    if (!details.title) {
      const t = html.match(/<meta name="title" content="([^"]{1,200})"/);
      if (t?.[1]) details.title = decodeEntities(t[1]);
    }
    if (!details.channel) {
      const c = html.match(/"ownerChannelName":"([^"]{1,120})"/);
      if (c?.[1]) details.channel = decodeEntities(c[1]);
    }
  } catch {
    // best effort — the UI still gets whatever oEmbed returned
  }

  if (!details.title) details.title = videoId;
  return details;
}
