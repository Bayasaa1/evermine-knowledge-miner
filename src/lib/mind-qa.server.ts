/**
 * Creator-written extras for a project mind: official stances (Q&A), bio,
 * tags and greeting. Read with the service client, but only for PUBLISHED
 * projects, and only creator-authored fields are returned.
 */
export type CreatorExtras = {
  personaName: string;
  bio: string;
  greeting: string;
  tags: string[];
  qa: { question: string; answer: string; suggest: boolean }[];
  topics: string[];
};

export async function loadCreatorExtras(mindId: string): Promise<CreatorExtras | null> {
  if (!mindId.startsWith("project:")) return null;
  const projectId = mindId.slice(8);
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, persona_id, creator_name, published")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || !project.published) return null;
  const [persona, qa, concepts] = await Promise.all([
    project.persona_id
      ? supabaseAdmin.from("creator_personas").select("name, bio, greeting, tags").eq("id", project.persona_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from("mind_qa").select("question, answer, suggest").eq("project_id", projectId).order("sort").limit(50),
    supabaseAdmin.from("project_concepts").select("label, count").eq("project_id", projectId).order("count", { ascending: false }).limit(8),
  ]);
  const p = persona.data as { name: string; bio: string; greeting: string; tags: string[] } | null;
  return {
    personaName: p?.name ?? project.creator_name ?? "",
    bio: p?.bio ?? "",
    greeting: p?.greeting ?? "",
    tags: p?.tags ?? [],
    qa: (qa.data ?? []).filter((r) => r.question.trim()),
    topics: (concepts.data ?? []).map((c) => c.label).filter(Boolean),
  };
}
