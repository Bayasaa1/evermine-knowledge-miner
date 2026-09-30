/**
 * Everyone is a creator: personal posts, 24-hour stories and profile pictures.
 * Media lives in the private "user-media" bucket, read through signed links.
 */
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "user-media";
/** Long-lived read link — the bucket stays private, the link is unguessable. */
const LINK_SECONDS = 60 * 60 * 24 * 365;

export type UserPost = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar: string | null;
  body: string;
  mediaUrl: string | null;
  mediaKind: string;
  createdAt: string;
};

export type UserStory = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatar: string | null;
  caption: string;
  mediaUrl: string | null;
  mediaKind: string;
  createdAt: string;
};

/** Upload a picture or clip into the signed-in person's own folder. */
export async function uploadUserMedia(file: File): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in first");
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function mediaLink(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, LINK_SECONDS);
  return data?.signedUrl ?? null;
}

async function withLinks<T extends { media_path: string | null }>(rows: T[]) {
  return Promise.all(rows.map(async (row) => ({ row, url: await mediaLink(row.media_path) })));
}

/** Replace the signed-in person's profile picture. */
export async function setProfilePicture(file: File): Promise<string> {
  const path = await uploadUserMedia(file);
  const url = await mediaLink(path);
  if (!url) throw new Error("Could not read the uploaded picture");
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: url, picture: url } });
  if (error) throw new Error(error.message);
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", auth.user.id);
  }
  return url;
}

export async function createPost(input: {
  body: string;
  file?: File | null;
  authorName: string;
  authorAvatar?: string | null | undefined;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in first");
  let mediaPath: string | null = null;
  let mediaKind = "none";
  if (input.file) {
    mediaPath = await uploadUserMedia(input.file);
    mediaKind = input.file.type.startsWith("video") ? "video" : "image";
  }
  const { error } = await supabase.from("user_posts").insert({
    user_id: uid,
    author_name: input.authorName,
    author_avatar: input.authorAvatar ?? null,
    body: input.body.trim(),
    media_path: mediaPath,
    media_kind: mediaKind,
  });
  if (error) throw new Error(error.message);
}

export async function listPosts(limit = 50): Promise<UserPost[]> {
  const { data, error } = await supabase
    .from("user_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const linked = await withLinks(data ?? []);
  return linked.map(({ row, url }) => ({
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar,
    body: row.body,
    mediaUrl: url,
    mediaKind: row.media_kind,
    createdAt: row.created_at,
  }));
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from("user_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createStory(input: {
  file: File;
  caption?: string;
  authorName: string;
  authorAvatar?: string | null | undefined;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in first");
  const path = await uploadUserMedia(input.file);
  const { error } = await supabase.from("user_stories").insert({
    user_id: uid,
    author_name: input.authorName,
    author_avatar: input.authorAvatar ?? null,
    caption: (input.caption ?? "").trim(),
    media_path: path,
    media_kind: input.file.type.startsWith("video") ? "video" : "image",
  });
  if (error) throw new Error(error.message);
}

/** Stories still inside their 24 hours, newest first. */
export async function listStories(): Promise<UserStory[]> {
  const { data, error } = await supabase
    .from("user_stories")
    .select("*")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  const linked = await withLinks(data ?? []);
  return linked.map(({ row, url }) => ({
    id: row.id,
    userId: row.user_id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar,
    caption: row.caption,
    mediaUrl: url,
    mediaKind: row.media_kind,
    createdAt: row.created_at,
  }));
}

export async function deleteStory(id: string): Promise<void> {
  const { error } = await supabase.from("user_stories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
