/**
 * Projects: a creator owns unlimited Projects, and each Project holds content of
 * two kinds:
 *   VISUAL_CONTENT — playable YouTube videos shown in the public TikTok-style feed.
 *   TRAINING_ONLY  — long-form training material that feeds the AI brain but never
 *                    appears in the public feed.
 */
import { supabase } from "@/integrations/supabase/client";

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
  "id,project_id,user_id,kind,youtube_id,source_url,title,description,tags,timeline,emotion_timeline,transcript,mind_id,view_count,created_at,updated_at";

export async function listMyProjects(userId: string): Promise<Project[]> {
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
    })
    .select(PROJECT_COLS)
    .single();
  return { project: (data as Project | null) ?? null, error: error?.message ?? null };
}

export async function updateProject(id: string, patch: Partial<Project>): Promise<string | null> {
  const { error } = await supabase.from("projects").update(patch).eq("id", id);
  return error?.message ?? null;
}

export async function deleteProject(id: string): Promise<string | null> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
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
    emotionTimeline?: unknown[];
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
  patch: { title?: string; description?: string; tags?: string[]; kind?: ContentKind },
): Promise<string | null> {
  const { error } = await supabase.from("project_content").update(patch).eq("id", id);
  return error?.message ?? null;
}

export async function deleteProjectContent(id: string): Promise<string | null> {
  const { error } = await supabase.from("project_content").delete().eq("id", id);
  return error?.message ?? null;
}

/** Public playable clips for the vertical feed, newest first. */
export async function listPublicVisualContent(limit = 60): Promise<
  Array<ProjectContent & { project: Pick<Project, "id" | "title" | "creator_name" | "creator_avatar_url" | "price" | "currency"> | null }>
> {
  const { data, error } = await supabase
    .from("project_content")
    // Only clips whose parent project is published reach the public feed.
    .select(`${CONTENT_COLS},projects!inner(id,title,creator_name,creator_avatar_url,price,currency,published)`)
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

function normalizeMany(data: unknown): ProjectContent[] {
  return (Array.isArray(data) ? data : []).map((row) => normalizeOne(row as Record<string, unknown>));
}

function normalizeOne(row: Record<string, unknown>): ProjectContent {
  return {
    ...(row as unknown as ProjectContent),
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
