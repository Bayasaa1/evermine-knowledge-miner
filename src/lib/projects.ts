/**
 * Projects: a creator owns unlimited Projects, and each Project holds content of
 * two kinds:
 *   VISUAL_CONTENT — playable YouTube videos shown in the public TikTok-style feed.
 *   TRAINING_ONLY  — long-form training material that feeds the AI brain but never
 *                    appears in the public feed.
 */
import { supabase } from "@/integrations/supabase/client";
import { currentOwnerId, NOT_SIGNED_IN } from "@/lib/owner";
import type { Json } from "@/integrations/supabase/types";
import type { CreationCategory } from "@/lib/creation-category";

export type ContentKind = "VISUAL_CONTENT" | "TRAINING_ONLY";
export type SubtitleCue = { timestamp: string; speech: string; speaker: string; role: string };

export type Project = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  cover_url: string | null;
  creator_name: string;
  creator_avatar_url: string | null;
  price: number;
  currency: string;
  published: boolean;
  /** Creator-wide subscription lengths mirrored onto each project. */
  plan_tiers?: Json;
  persona_id: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
};

/** One mined moment aligned to the playing video. */
export type TimelineMark = {
  t: number;
  label: string;
  emotion?: string;
};

export type ProjectContent = {
  id: string;
  project_id: string;
  user_id: string;
  kind: ContentKind;
  /** Creation type this video was mined as (knowledge/robot/voice/sales/gaming). */
  category: CreationCategory;
  youtube_id: string;
  source_url: string;
  title: string;
  description: string;
  tags: string[];
  timeline: TimelineMark[];
  emotion_timeline: TimelineMark[];
  transcript: SubtitleCue[];
  mind_id: string;
  view_count: number;
  created_at: string;
  updated_at: string;
};

const PROJECT_COLS =
  "id,user_id,title,description,cover_url,creator_name,creator_avatar_url,price,currency,published,persona_id,view_count,created_at,updated_at";
const CONTENT_COLS =
  "id,project_id,user_id,kind,category,youtube_id,source_url,title,description,tags,timeline,emotion_timeline,transcript,mind_id,view_count,created_at,updated_at";

export async function listMyProjects(userId: string): Promise<Project[]> {
  // My Vaults is not a public-project lookup. Refuse stale or caller-supplied
  // account ids even though published projects are readable in the news feed.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user || auth.user.id !== userId) return [];
  const { data } = await supabase
    .from("projects")
    .select(PROJECT_COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as Project[] | null) ?? [];
}

export async function createProject(
  userId: string,
  input: {
    title: string;
    description?: string;
    creatorName?: string;
    creatorAvatarUrl?: string | null;
    price?: number;
    personaId?: string | null;
  },
): Promise<{ project: Project | null; error: string | null }> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      title: input.title.trim() || "Untitled Project",
      description: input.description?.trim() ?? "",
      creator_name: input.creatorName?.trim() || "Evermind creator",
      creator_avatar_url: input.creatorAvatarUrl ?? null,
      price: input.price ?? 0,
      persona_id: input.personaId ?? null,
      // Private until the creator deliberately shares it.
      published: false,
    })
    .select(PROJECT_COLS)
    .single();
  return { project: (data as Project | null) ?? null, error: error?.message ?? null };
}

/**
 * The creator's existing card for one YouTube video, if any. Re-mining a video
 * must refresh that card instead of creating a second project + duplicate feed
 * entry for the same source.
 */
export async function findContentByVideo(
  userId: string,
  youtubeId: string,
): Promise<ProjectContent | null> {
  if (!youtubeId) return null;
  const { data } = await supabase
    .from("project_content")
    .select(CONTENT_COLS)
    .eq("user_id", userId)
    .eq("youtube_id", youtubeId)
    .order("created_at", { ascending: true })
    .limit(1);
  const rows = normalizeMany(data);
  return rows[0] ?? null;
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<string | null> {
  const owner = await currentOwnerId();
  if (!owner) return NOT_SIGNED_IN;
  const { error } = await supabase.from("projects").update(patch).eq("id", id).eq("user_id", owner);
  return error?.message ?? null;
}

export async function deleteProject(id: string): Promise<string | null> {
  const owner = await currentOwnerId();
  if (!owner) return NOT_SIGNED_IN;
  const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", owner);
  return error?.message ?? null;
}

export async function listProjectContent(projectId: string): Promise<ProjectContent[]> {
  const { data } = await supabase
    .from("project_content")
    .select(CONTENT_COLS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return normalizeMany(data);
}

export async function addProjectContent(
  userId: string,
  input: {
    projectId: string;
    kind: ContentKind;
    youtubeId: string;
    sourceUrl: string;
    title: string;
    description?: string;
    tags?: string[];
    timeline?: TimelineMark[];
    emotionTimeline?: Json;
    transcript?: SubtitleCue[];
  },
): Promise<string | null> {
  const { error } = await supabase.from("project_content").insert({
    project_id: input.projectId,
    user_id: userId,
    kind: input.kind,
    youtube_id: input.youtubeId,
    source_url: input.sourceUrl,
    title: input.title.trim() || "Untitled clip",
    description: input.description?.trim() ?? "",
    tags: input.tags ?? [],
    timeline: input.timeline ?? [],
    emotion_timeline: input.emotionTimeline ?? [],
    transcript: input.transcript ?? [],
  });
  return error?.message ?? null;
}

/** Projects that belong to one persona (or the master account when null). */
export async function listProjectsByPersona(userId: string, personaId: string | null): Promise<Project[]> {
  const all = await listMyProjects(userId);
  return all.filter((p) => (p.persona_id ?? null) === personaId);
}

/** Edits the editable metadata of one mined video card. */
export async function updateProjectContent(
  id: string,
  patch: {
    title?: string;
    description?: string;
    tags?: string[];
    kind?: ContentKind;
    transcript?: SubtitleCue[];
    emotionTimeline?: Json;
  },
): Promise<string | null> {
  const { emotionTimeline, ...rest } = patch;
  const owner = await currentOwnerId();
  if (!owner) return NOT_SIGNED_IN;
  const { error } = await supabase
    .from("project_content")
    .update({
      ...rest,
      ...(patch.transcript ? { transcript: patch.transcript as unknown as Json } : {}),
      ...(emotionTimeline ? { emotion_timeline: emotionTimeline } : {}),
    })
    .eq("id", id)
    .eq("user_id", owner);
  return error?.message ?? null;
}

/** Moves one mined video card into another project of the same owner. */
export async function moveProjectContent(id: string, projectId: string): Promise<string | null> {
  const owner = await currentOwnerId();
  if (!owner) return NOT_SIGNED_IN;
  const { error } = await supabase
    .from("project_content")
    .update({ project_id: projectId })
    .eq("id", id)
    .eq("user_id", owner);
  return error?.message ?? null;
}

export async function deleteProjectContent(id: string): Promise<string | null> {
  const owner = await currentOwnerId();
  if (!owner) return NOT_SIGNED_IN;
  const { error } = await supabase.from("project_content").delete().eq("id", id).eq("user_id", owner);
  return error?.message ?? null;
}

/** Public playable clips for the vertical feed, newest first. */
export async function listPublicVisualContent(limit = 60): Promise<
  Array<ProjectContent & { project: Pick<Project, "id" | "title" | "creator_name" | "creator_avatar_url" | "price" | "currency"> | null }>
> {
  const { data, error } = await supabase
    .from("project_content")
    // Only clips whose parent project is published reach the public feed.
    .select(`${CONTENT_COLS},projects!inner(id,title,creator_name,creator_avatar_url,price,currency,published,plan_tiers)`)
    .eq("kind", "VISUAL_CONTENT")
    .eq("projects.published", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data as unknown as Array<Record<string, unknown>> | null) ?? [];
  return rows.map((row) => ({
    ...(normalizeOne(row) as ProjectContent),
    project: (row["projects"] as Project | null) ?? null,
  }));
}

/**
 * Feed listing without the heavy mined arrays. Transcripts alone can be
 * hundreds of lines per video, so the scroll list stays light and each card
 * pulls its own subtitles/timeline only when it is the one being watched.
 */
const CONTENT_LIGHT_COLS =
  "id,project_id,user_id,kind,category,youtube_id,source_url,title,description,tags,mind_id,view_count,created_at,updated_at";

export type PublicFeedRow = Omit<ProjectContent, "timeline" | "emotion_timeline" | "transcript"> & {
  project: Pick<Project, "id" | "title" | "creator_name" | "creator_avatar_url" | "price" | "currency" | "plan_tiers"> | null;
};

export async function listPublicVisualContentLight(limit = 30): Promise<PublicFeedRow[]> {
  const { data, error } = await supabase
    .from("project_content")
    .select(`${CONTENT_LIGHT_COLS},projects!inner(id,title,creator_name,creator_avatar_url,price,currency,published,plan_tiers)`)
    .eq("kind", "VISUAL_CONTENT")
    .eq("projects.published", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data as unknown as Array<Record<string, unknown>> | null) ?? [];
  return rows.map((row) => ({
    ...(row as unknown as PublicFeedRow),
    tags: Array.isArray(row["tags"]) ? (row["tags"] as string[]) : [],
    project: (row["projects"] as Project | null) ?? null,
  }));
}

/** Subtitles + mined moments for one clip, fetched only when it is watched. */
export async function getPublicContentTracks(contentId: string): Promise<{
  timeline: TimelineMark[];
  emotion_timeline: TimelineMark[];
  transcript: SubtitleCue[];
}> {
  const { data, error } = await supabase
    .from("project_content")
    .select("timeline,emotion_timeline,transcript")
    .eq("id", contentId)
    .maybeSingle();
  if (error) throw error;
  const row = (data as Record<string, unknown> | null) ?? {};
  return {
    timeline: marks(row["timeline"]),
    emotion_timeline: marks(row["emotion_timeline"]),
    transcript: subtitleCues(row["transcript"]),
  };
}


function normalizeMany(data: unknown): ProjectContent[] {
  return (Array.isArray(data) ? data : []).map((row) => normalizeOne(row as Record<string, unknown>));
}

function normalizeOne(row: Record<string, unknown>): ProjectContent {
  return {
    ...(row as unknown as ProjectContent),
    category: (row["category"] as CreationCategory) ?? "knowledge",
    tags: Array.isArray(row["tags"]) ? (row["tags"] as string[]) : [],
    timeline: marks(row["timeline"]),
    emotion_timeline: marks(row["emotion_timeline"]),
    transcript: subtitleCues(row["transcript"]),
  };
}

function subtitleCues(value: unknown): SubtitleCue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const cue = (entry ?? {}) as Record<string, unknown>;
      return {
        timestamp: String(cue["timestamp"] ?? ""),
        speech: String(cue["speech"] ?? ""),
        speaker: String(cue["speaker"] ?? ""),
        role: String(cue["role"] ?? "unknown"),
      };
    })
    .filter((cue) => cue.speech.length > 0);
}

function marks(value: unknown): TimelineMark[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const e = entry as Record<string, unknown>;
      const t = Number(e["t"] ?? e["start"] ?? e["timestamp"] ?? 0);
      const label = String(e["label"] ?? e["summary"] ?? e["facial_trigger"] ?? e["primary_emotion"] ?? "");
      const emotion = e["primary_emotion"] ? String(e["primary_emotion"]) : undefined;
      return { t: Number.isFinite(t) ? t : 0, label, ...(emotion ? { emotion } : {}) };
    })
    .filter((m) => m.label.length > 0)
    .sort((a, b) => a.t - b.t);
}

/**
 * Files an existing project (and every Mind saved inside it) under one persona.
 * Videos mined before a persona was chosen ended up "unfiled" and vanished from
 * the profile — this puts them back where the creator expects them.
 */
export async function assignProjectToPersona(
  projectId: string,
  personaId: string | null,
  branding?: { creatorName?: string; creatorAvatarUrl?: string | null },
): Promise<string | null> {
  const { error } = await supabase
    .from("projects")
    .update({
      persona_id: personaId,
      ...(branding?.creatorName ? { creator_name: branding.creatorName } : {}),
      ...(branding?.creatorAvatarUrl !== undefined ? { creator_avatar_url: branding.creatorAvatarUrl } : {}),
    })
    .eq("id", projectId);
  if (error) return error.message;
  await supabase.from("mind_vaults").update({ persona_id: personaId }).eq("project_id", projectId);
  return null;
}

/** Projects of this owner that are not filed under any persona yet. */
export async function listUnfiledProjects(userId: string): Promise<Project[]> {
  const { data } = await supabase
    .from("projects")
    .select(PROJECT_COLS)
    .eq("user_id", userId)
    .is("persona_id", null)
    .order("created_at", { ascending: false });
  return (data as Project[] | null) ?? [];
}
