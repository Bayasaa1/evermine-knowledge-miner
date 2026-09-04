import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicProjectMind = {
  name: string;
  title: string;
  description: string;
  knowledge: string[];
  transcript: string[];
};

/** Resolves only published project knowledge through the anonymous public policy. */
export async function getPublicProjectMind(mindId: string): Promise<PublicProjectMind | null> {
  if (!mindId.startsWith("project:")) return null;
  const projectId = mindId.slice("project:".length);
  if (!projectId) return null;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  const client = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("projects")
    .select("id,title,description,creator_name,project_content!inner(title,description,tags,transcript,kind)")
    .eq("id", projectId)
    .eq("published", true)
    .eq("project_content.kind", "VISUAL_CONTENT")
    .maybeSingle();
  if (error || !data) return null;
  const content = Array.isArray(data.project_content) ? data.project_content : [];
  const transcript = content.flatMap((item) => {
    if (!Array.isArray(item.transcript)) return [];
    return item.transcript
      .map((cue) => {
        const value = (cue ?? {}) as Record<string, unknown>;
        return String(value["speech"] ?? "").trim();
      })
      .filter(Boolean);
  });
  return {
    name: data.creator_name,
    title: data.title,
    description: data.description,
    knowledge: content.flatMap((item) => [...item.tags, item.title, item.description]).filter(Boolean).slice(0, 100),
    transcript: transcript.slice(0, 400),
  };
}