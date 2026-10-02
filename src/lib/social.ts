import { idbGet, idbSet, STORES } from "@/lib/store";
import { MINDS, type Mind, type SourceClip } from "@/lib/minds";
import { scopedKey, whenScopeReady } from "@/lib/user-scope";

// Follows, favourites and notifications are personal. They are filed under the
// signed-in account so a second person on the same browser never inherits them.
const FOLLOWS_KEY = () => scopedKey("social_follows");
const FAVORITES_KEY = () => scopedKey("social_favorite_clips");
const NOTIFS_KEY = () => scopedKey("social_notifications");
const SEEN_KEY = () => scopedKey("social_seen_updates");

export type FavoriteClip = {
  clipId: string;
  mindId: string;
  savedAt: string;
};

export type CreatorUpdateKind = "video" | "brain";

export type CreatorNotification = {
  id: string;
  mindId: string;
  kind: CreatorUpdateKind;
  title: string;
  body: string;
  at: string;
  read: boolean;
};

/* ---------------- follows ---------------- */

export async function loadFollows(): Promise<string[]> {
  await whenScopeReady();
  return (await idbGet<string[]>(STORES.SETTINGS, FOLLOWS_KEY())) ?? [];
}

export async function saveFollows(ids: string[]): Promise<void> {
  await whenScopeReady();
  await idbSet(STORES.SETTINGS, FOLLOWS_KEY(), ids);
}

export function toggleFollow(ids: string[], mindId: string): string[] {
  return ids.includes(mindId) ? ids.filter((id) => id !== mindId) : [...ids, mindId];
}

/* ---------------- favorite clips ---------------- */

export async function loadFavorites(): Promise<FavoriteClip[]> {
  await whenScopeReady();
  return (await idbGet<FavoriteClip[]>(STORES.SETTINGS, FAVORITES_KEY())) ?? [];
}

export async function saveFavorites(list: FavoriteClip[]): Promise<void> {
  await whenScopeReady();
  await idbSet(STORES.SETTINGS, FAVORITES_KEY(), list);
}

export function isFavorite(list: FavoriteClip[], clipId: string): boolean {
  return list.some((f) => f.clipId === clipId);
}

export function toggleFavorite(list: FavoriteClip[], mindId: string, clipId: string): FavoriteClip[] {
  return isFavorite(list, clipId)
    ? list.filter((f) => f.clipId !== clipId)
    : [...list, { clipId, mindId, savedAt: new Date().toISOString() }];
}

export function resolveFavorite(fav: FavoriteClip): { mind: Mind; clip: SourceClip } | null {
  const mind = MINDS.find((m) => m.id === fav.mindId);
  const clip = mind?.clips.find((c) => c.id === fav.clipId);
  return mind && clip ? { mind, clip } : null;
}

/* ---------------- notifications ---------------- */

export async function loadNotifications(): Promise<CreatorNotification[]> {
  await whenScopeReady();
  return (await idbGet<CreatorNotification[]>(STORES.SETTINGS, NOTIFS_KEY())) ?? [];
}

export async function saveNotifications(list: CreatorNotification[]): Promise<void> {
  await whenScopeReady();
  await idbSet(STORES.SETTINGS, NOTIFS_KEY(), list.slice(-40));
}

export function unreadCount(list: CreatorNotification[]): number {
  return list.filter((n) => !n.read).length;
}

/** Ask once for OS-level push permission and register the notification worker. */
export async function enablePushNotifications(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm === "granted" && "serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/evermind-sw.js");
    } catch {
      /* notifications still work without the worker on desktop */
    }
  }
  return perm;
}

/** Deliver an OS/mobile notification; returns false when the browser blocked it. */
export async function pushNotification(n: CreatorNotification): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  const options: NotificationOptions = {
    body: n.body,
    tag: n.id,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { url: "/", mindId: n.mindId },
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/evermind-sw.js");
      if (reg) {
        await reg.showNotification(n.title, options);
        return true;
      }
    }
    new Notification(n.title, options);
    return true;
  } catch {
    return false;
  }
}

/* ---------------- creator update stream ---------------- */

type CreatorUpdate = {
  id: string;
  mindId: string;
  kind: CreatorUpdateKind;
  headline: string;
};

/** Updates published by creators; polled for the Minds the user follows. */
const UPDATE_STREAM: CreatorUpdate[] = [
  {
    id: "upd_horse_video",
    mindId: "mind_horsemaster",
    kind: "video",
    headline: "New video mined: “Winter conditioning across open steppe”",
  },
  {
    id: "upd_horse_brain",
    mindId: "mind_horsemaster",
    kind: "brain",
    headline: "AI Brain updated: 6 new beliefs on reading lameness",
  },
  {
    id: "upd_chef_video",
    mindId: "mind_chef",
    kind: "video",
    headline: "New video mined: “Airag fermentation, day by day”",
  },
  {
    id: "upd_founder_brain",
    mindId: "mind_founder",
    kind: "brain",
    headline: "AI Brain updated: new decision logic on cutting features",
  },
  {
    id: "upd_dancer_video",
    mindId: "mind_dancer",
    kind: "video",
    headline: "New video mined: “Release sweep, slowed to breath count”",
  },
  {
    id: "upd_chef_brain",
    mindId: "mind_chef",
    kind: "brain",
    headline: "AI Brain updated: 4 new cultural expressions decoded",
  },
];

async function loadSeen(): Promise<string[]> {
  await whenScopeReady();
  return (await idbGet<string[]>(STORES.SETTINGS, SEEN_KEY())) ?? [];
}

function toNotification(u: CreatorUpdate): CreatorNotification {
  const mind = MINDS.find((m) => m.id === u.mindId);
  return {
    id: u.id,
    mindId: u.mindId,
    kind: u.kind,
    title: `${mind?.shortName ?? "A Mind"} ${u.kind === "video" ? "uploaded a new video" : "updated their AI Brain"}`,
    body: u.headline,
    at: new Date().toISOString(),
    read: false,
  };
}

/**
 * Returns the next unseen update from a followed creator, marking it as seen.
 * Called on an interval so followers get one notification at a time.
 */
export async function nextCreatorUpdate(follows: string[]): Promise<CreatorNotification | null> {
  if (follows.length === 0) return null;
  const seen = await loadSeen();
  const next = UPDATE_STREAM.find((u) => follows.includes(u.mindId) && !seen.includes(u.id));
  if (!next) return null;
  await idbSet(STORES.SETTINGS, SEEN_KEY(), [...seen, next.id]);
  return toNotification(next);
}
