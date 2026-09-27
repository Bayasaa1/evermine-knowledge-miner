import { otherVideo } from "@/lib/import-sources";
/**
 * Global Home Feed: the TikTok/Reels-style content stream. Seeded from the
 * public Mind marketplace, plus everything the signed-in creator publishes
 * from their own dashboard (stored device-locally, scoped to the account).
 */
import { MINDS } from "./minds";
import { idbGet, idbSet, STORES } from "./store";
import { scopedKey } from "./user-scope";
import {
  getPublicContentTracks,
  listPublicVisualContentLight,
  type SubtitleCue,
  type TimelineMark,
} from "./projects";

import { normalizeTiers, offeredTiers, type PlanLength } from "./subscription";

import type { CreationCategory } from "./creation-category";

export type FeedItem = {
  id: string;
  /** project_content row id, used to lazily load subtitles for this clip. */
  contentId?: string;

  /** Marketplace mind this clip belongs to, when it is a published Mind. */
  mindId: string | null;
  creator: string;
  handle: string;
  /** Persona / creator avatar shown on the feed card. */
  avatarUrl?: string | null;
  title: string;
  description: string;
  category: CreationCategory;
  /** Video source; when absent the poster is shown as a still. */
  src: string | null;
  /** YouTube video id — rendered with the YouTube Iframe player, no hosting cost. */
  youtubeId?: string | null;
  /** Bilibili / VK / Rutube player for clips hosted outside YouTube. */
  embedUrl?: string | null;
  /** Mined knowledge moments aligned to playback time. */
  timeline?: TimelineMark[];
  /** Mined emotion tags aligned to playback time. */
  emotionTimeline?: TimelineMark[];
  /** Verbatim mined subtitles aligned to playback time. */
  transcript?: SubtitleCue[];
  poster: string;
  tags: string[];
  /** Base subscription price set by the creator. 0 = free. */
  price: number;
  currency: string;
  /** Subscription lengths this creator offers (1 month / 3 months / 1 year / lifetime). */
  tiers?: Array<{ length: PlanLength; price: number }>;
  /** Robot deployment token, when a Robot Brain package was published. */
  deployToken?: string;
  publishedAt: string;
  /** Account that owns the clip — used only to mix creators in the feed. */
  ownerId?: string | null;
};

const FEED_KEY = () => scopedKey("publishedFeed");


/** Marketplace minds rendered as feed clips. */
export function marketplaceFeed(): FeedItem[] {
  return MINDS.flatMap((mind) =>
    mind.clips.map((clip, i) => ({
      id: `${mind.id}:${clip.id}`,
      mindId: mind.id,
      creator: mind.name,
      handle: `@${mind.shortName.toLowerCase().replace(/\s+/g, "")}`,
      title: i === 0 ? mind.highlight : clip.label,
      description: clip.quote,
      category: "knowledge" as CreationCategory,
      src: clip.src,
      poster: clip.poster,
      tags: mind.tags,
      price: mind.hourly,
      currency: "USD",
      publishedAt: "2026-01-01T00:00:00.000Z",
    })),
  );
}

export async function listPublished(): Promise<FeedItem[]> {
  const raw = await idbGet<FeedItem[]>(STORES.SETTINGS, FEED_KEY());
  return Array.isArray(raw) ? raw : [];
}

/** Publishes a mined mind onto the global home feed. Newest first. */
export async function publishToFeed(item: Omit<FeedItem, "publishedAt">): Promise<FeedItem[]> {
  const existing = await listPublished();
  const next: FeedItem = { ...item, publishedAt: new Date().toISOString() };
  const merged = [next, ...existing.filter((f) => f.id !== next.id)].slice(0, 50);
  await idbSet(STORES.SETTINGS, FEED_KEY(), merged);
  return merged;
}

export async function removeFromFeed(id: string): Promise<FeedItem[]> {
  const rest = (await listPublished()).filter((f) => f.id !== id);
  await idbSet(STORES.SETTINGS, FEED_KEY(), rest);
  return rest;
}

/** Playable YouTube clips published inside public Projects. */
export async function projectFeed(): Promise<FeedItem[]> {
  const rows = await listPublicVisualContentLight();
  return rows
    .filter((row) => row.youtube_id || otherVideo(row.source_url))
    .map((row) => {
      const other = row.youtube_id ? null : otherVideo(row.source_url);
      const raw = (row.project?.plan_tiers ?? null) as Record<string, unknown> | null;
      // A creator selling access marks plan_tiers.enabled; otherwise the mind is free.
      const tiers = raw?.['enabled'] === true ? offeredTiers(normalizeTiers(raw)) : [];
      const cheapest = tiers.length ? Math.min(...tiers.map((t) => t.price)) : null;
      return {
      id: `project:${row.id}`,
      contentId: row.id,
      mindId: `project:${row.project_id}`,
      creator: row.project?.creator_name ?? "Evermind creator",
      avatarUrl: row.project?.creator_avatar_url ?? null,
      handle: `@${(row.project?.title ?? "project").toLowerCase().replace(/\s+/g, "")}`,
      title: row.title,
      description: row.description,
      category: (row.category ?? "knowledge") as CreationCategory,
      src: other?.platform === "direct" ? other.url : null,
      youtubeId: row.youtube_id || null,
      embedUrl: other?.embedUrl ?? null,
      poster: row.youtube_id ? `https://i.ytimg.com/vi/${row.youtube_id}/hqdefault.jpg` : "",
      tags: row.tags,
      price: cheapest ?? Number(row.project?.price ?? 0),
      currency: (raw?.['currency'] as string | undefined) || row.project?.currency || "USD",
      tiers,
      publishedAt: row.created_at,
      ownerId: (row.project as { user_id?: string } | null)?.user_id ?? null,
      };
    });
}

/** Subtitles + mined moments for the clip currently on screen. */
export async function loadFeedTracks(contentId: string) {
  return getPublicContentTracks(contentId);
}

/**
 * Full home feed. The database is the single source of truth: only published
 * project videos that still exist are shown. Deleting a video removes it from
 * the feed immediately — no device-local copies, no demo filler.
 */
export async function loadFeed(): Promise<FeedItem[]> {
  const rows = await projectFeed();
  // One card per video: repeated minings of the same source collapse into the
  // newest one instead of stacking duplicates in the feed.
  const seen = new Set<string>();
  const unique = rows.filter((item) => {
    const key = item.youtubeId ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Mix creators: take one newest card from each creator in turn, so one
  // account's big batch can never push everyone else out of the feed.
  const byOwner = new Map<string, FeedItem[]>();
  for (const item of unique) {
    const owner = item.ownerId ?? item.creator;
    const list = byOwner.get(owner);
    if (list) list.push(item);
    else byOwner.set(owner, [item]);
  }
  const queues = [...byOwner.values()];
  const mixed: FeedItem[] = [];
  while (queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) mixed.push(next);
    }
  }
  return mixed;
}


