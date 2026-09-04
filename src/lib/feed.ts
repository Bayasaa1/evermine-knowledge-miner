/**
 * Global Home Feed: the TikTok/Reels-style content stream. Seeded from the
 * public Mind marketplace, plus everything the signed-in creator publishes
 * from their own dashboard (stored device-locally, scoped to the account).
 */
import { MINDS } from "./minds";
import { idbGet, idbSet, STORES } from "./store";
import { scopedKey } from "./user-scope";
import { listPublicVisualContent, type SubtitleCue, type TimelineMark } from "./projects";
import type { CreationCategory } from "./creation-category";

export type FeedItem = {
  id: string;
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
  /** Mined knowledge moments aligned to playback time. */
  timeline?: TimelineMark[];
  /** Mined emotion tags aligned to playback time. */
  emotionTimeline?: TimelineMark[];
  /** Verbatim mined subtitles aligned to playback time. */
  transcript?: SubtitleCue[];
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

/** Playable YouTube clips published inside public Projects. */
export async function projectFeed(): Promise<FeedItem[]> {
  const rows = await listPublicVisualContent();
  return rows
    .filter((row) => row.youtube_id)
    .map((row) => ({
      id: `project:${row.id}`,
      mindId: `project:${row.project_id}`,
      creator: row.project?.creator_name ?? "Evermind creator",
      avatarUrl: row.project?.creator_avatar_url ?? null,
      handle: `@${(row.project?.title ?? "project").toLowerCase().replace(/\s+/g, "")}`,
      title: row.title,
      description: row.description,
      category: "knowledge" as CreationCategory,
      src: null,
      youtubeId: row.youtube_id,
      timeline: row.timeline,
      emotionTimeline: row.emotion_timeline,
      transcript: row.transcript,
      poster: `https://i.ytimg.com/vi/${row.youtube_id}/hqdefault.jpg`,
      tags: row.tags,
      price: Number(row.project?.price ?? 0),
      currency: row.project?.currency ?? "USD",
      publishedAt: row.created_at,
    }));
}

/** Full home feed: project videos, your published minds, then the marketplace. */
export async function loadFeed(): Promise<FeedItem[]> {
  const [projects, mine] = await Promise.all([
    projectFeed(),
    listPublished().catch(() => [] as FeedItem[]),
  ]);
  const creatorContent = [...projects, ...mine];
  return creatorContent.length > 0 ? creatorContent : marketplaceFeed();
}

