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


/**
 * InnerTube player endpoint — the only YouTube surface that reliably returns
 * duration, description and publish date from a server/edge runtime (the plain
 * watch page is frequently served as a consent/bot wall to datacenter IPs).
 */
type PlayerMeta = {
  title: string;
  description: string;
  durationSec: number;
  channel: string;
  publishedAt: string;
  thumbnail: string;
};

export async function fetchPlayerMeta(videoId: string): Promise<Partial<PlayerMeta>> {
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify({
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
        context: { client: { clientName: "WEB", clientVersion: "2.20240726.00.00", hl: "en", gl: "US" } },
      }),
    });
    if (!res.ok) return {};
    const j = (await res.json()) as {
      videoDetails?: {
        title?: string;
        shortDescription?: string;
        lengthSeconds?: string;
        author?: string;
        thumbnail?: { thumbnails?: { url?: string; width?: number }[] };
      };
      microformat?: { playerMicroformatRenderer?: { publishDate?: string; uploadDate?: string } };
    };
    const d = j.videoDetails;
    const micro = j.microformat?.playerMicroformatRenderer;
    const thumbs = d?.thumbnail?.thumbnails ?? [];
    const best = thumbs.slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
    const len = Number(d?.lengthSeconds ?? 0);
    return {
      title: d?.title || undefined,
      description: d?.shortDescription || undefined,
      durationSec: Number.isFinite(len) && len > 0 ? len : undefined,
      channel: d?.author || undefined,
      publishedAt: micro?.publishDate || micro?.uploadDate || undefined,
      thumbnail: best || undefined,
    };
  } catch {
    return {};
  }
}

export async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  let title = videoId;
  let durationSec = 0;

  const player = await fetchPlayerMeta(videoId);
  if (player.durationSec) durationSec = player.durationSec;
  if (player.title) title = player.title;
  if (durationSec > 0) return { videoId, url, title, durationSec };

  const complete = () =>
    !!details.title && !!details.description && !!details.publishedAt && details.durationSec > 0;

  try {
    if (complete()) return details;
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
  if (durationSec <= 0) durationSec = FALLBACK_DURATION_SEC;
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

  // InnerTube first: it returns duration, description and publish date reliably.
  const player = await fetchPlayerMeta(videoId);
  if (player.title) details.title = player.title;
  if (player.description) details.description = player.description;
  if (player.durationSec) details.durationSec = player.durationSec;
  if (player.channel) details.channel = player.channel;
  if (player.publishedAt) details.publishedAt = player.publishedAt;
  if (player.thumbnail) details.thumbnail = player.thumbnail;

  // oEmbed is a reliable secondary source for title + author.
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { "User-Agent": UA } },
    );
    if (res.ok) {
      const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
      if (j.title && !details.title) details.title = j.title;
      if (j.author_name && !details.channel) details.channel = j.author_name;
      if (j.thumbnail_url && !player.thumbnail)
        details.thumbnail = j.thumbnail_url.replace("hqdefault", "maxresdefault");
    }
  } catch {
    // best effort
  }

  try {
    const html = await fetchText(url);
    const len = html.match(/"lengthSeconds":"(\d+)"/);
    if (len?.[1] && details.durationSec <= 0) {
      const n = Number(len[1]);
      if (Number.isFinite(n) && n > 0) details.durationSec = n;
    }
    const desc = details.description ? "" :
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
    if (published && !details.publishedAt) details.publishedAt = published;
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
