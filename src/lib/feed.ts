/**
 * Global Home Feed: the TikTok/Reels-style content stream. Seeded from the
 * public Mind marketplace, plus everything the signed-in creator publishes
 * from their own dashboard (stored device-locally, scoped to the account).
 */
import { MINDS } from "./minds";
import { idbGet, idbSet, STORES } from "./store";
import { scopedKey } from "./user-scope";
import { listPublicVisualContent, type TimelineMark } from "./projects";
import type { CreationCategory } from "./creation-category";

export type FeedItem = {
  id: string;
  /** Marketplace mind this clip belongs to, when it is a published Mind. */
  mindId: string | null;
  creator: string;
  handle: string;
  title: string;
  description: string;
  category: CreationCategory;
  /** Video source; when absent the poster is shown as a still. */
  src: string | null;
  /** YouTube video id — rendered with the YouTube Iframe player, no hosting cost. */
  youtubeId?: string | null;
  /** Mined knowledge moments aligned to playback time. */
  timeline?: TimelineMark[];
  /** Mined emotion tags aligned to playback time. */
  emotionTimeline?: TimelineMark[];
  poster: string;
  tags: string[];
  /** Monthly subscription price set by the creator. 0 = free. */
  price: number;
  currency: string;
  /** Robot deployment token, when a Robot Brain package was published. */
  deployToken?: string;
  publishedAt: string;
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

/** Full home feed: your published minds first, then the marketplace. */
export async function loadFeed(): Promise<FeedItem[]> {
  const mine = await listPublished().catch(() => [] as FeedItem[]);
  return [...mine, ...marketplaceFeed()];
}
