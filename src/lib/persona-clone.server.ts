/**
 * Server-side lookup of a persona's live clones.
 *
 * Clone rows are owner-only, so a listener's browser can never read them. The
 * call endpoints resolve the clone here instead, and only ever return the
 * engine id needed to speak — never keys, samples or settings.
 */
export type LiveClone = { engine: string; remoteId: string; ownerId: string };

export async function getLiveClone(mindId: string, kind: "voice" | "face"): Promise<LiveClone | null> {
  if (!mindId.startsWith("project:")) return null;
  const projectId = mindId.slice("project:".length);
  if (!projectId) return null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("persona_id,published")
      .eq("id", projectId)
      .maybeSingle();
    if (!project?.persona_id || !project.published) return null;

    const { data: clone } = await supabaseAdmin
      .from("persona_clones")
      .select("engine,remote_id,status,consent,user_id")
      .eq("persona_id", project.persona_id)
      .eq("kind", kind)
      .maybeSingle();
    if (!clone || clone.status !== "ready" || !clone.consent || !clone.remote_id) return null;
    // The clone's owner pays with their own voice key, never the platform.
    return { engine: clone.engine, remoteId: clone.remote_id, ownerId: clone.user_id };
  } catch {
    return null;
  }
}
