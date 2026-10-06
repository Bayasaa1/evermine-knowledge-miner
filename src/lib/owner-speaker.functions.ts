import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Line = { speaker?: string; role?: string; speech?: string; timestamp?: string };

export type VideoSpeaker = { label: string; count: number; sample: string; isOwner: boolean };

async function load(supabase: any, userId: string, contentId: string) {
  const { data, error } = await supabase
    .from("project_content")
    .select("id, transcript, projects(persona_id)")
    .eq("id", contentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Video not found.");
  const personaId = (data as { projects?: { persona_id?: string | null } | null }).projects?.persona_id ?? null;
  let personaName = "";
  if (personaId) {
    const { data: p } = await supabase.from("creator_personas").select("name").eq("id", personaId).eq("user_id", userId).maybeSingle();
    personaName = (p?.name ?? "").trim();
  }
  const lines: Line[] = Array.isArray(data.transcript) ? data.transcript : [];
  return { lines, personaName };
}

/** Every voice the miner heard in one video, most-talking first. */
export const listVideoSpeakers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ personaName: string; speakers: VideoSpeaker[] }> => {
    const { lines, personaName } = await load(context.supabase, context.userId, data.contentId);
    const map = new Map<string, VideoSpeaker>();
    for (const l of lines) {
      const label = (l.speaker ?? "").trim() || "Unknown";
      const s = map.get(label) ?? { label, count: 0, sample: "", isOwner: !!personaName && label === personaName };
      s.count += 1;
      if (!s.sample && (l.speech ?? "").trim().length > 12) s.sample = String(l.speech).trim().slice(0, 90);
      map.set(label, s);
    }
    return { personaName, speakers: [...map.values()].sort((a, b) => b.count - a.count) };
  });

/**
 * The creator says which heard voices are the persona. Only the speaker name
 * on those lines changes — the words and times stay exactly as mined.
 */
export const setOwnerSpeakers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contentId: z.string().uuid(), labels: z.array(z.string().max(120)).min(1).max(40) }).parse(d))
  .handler(async ({ data, context }): Promise<{ changed: number }> => {
    const { lines, personaName } = await load(context.supabase, context.userId, data.contentId);
    if (!personaName) throw new Error("File this video under a persona first.");
    const chosen = new Set(data.labels);
    let changed = 0;
    const next = lines.map((l) => {
      const label = (l.speaker ?? "").trim() || "Unknown";
      if (!chosen.has(label) || label === personaName) return l;
      changed += 1;
      return { ...l, speaker: personaName, role: "primary" };
    });
    if (changed) {
      const { error } = await context.supabase
        .from("project_content")
        .update({ transcript: next as never })
        .eq("id", data.contentId)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
    }
    return { changed };
  });
