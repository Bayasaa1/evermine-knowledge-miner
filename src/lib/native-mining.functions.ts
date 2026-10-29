import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { splitIntoChunks } from "@/lib/chunking";

/**
 * Creates the mining record for a video the creator uploaded or recorded.
 * The file already sits in the creator's own storage folder; the browser
 * then mines it part by part through /api/native-mine.
 */
export const startUploadMining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        personaId: z.string().uuid(),
        projectId: z.string().uuid(),
        storagePath: z.string().min(3).max(300),
        thumbnailPath: z.string().max(300).nullable(),
        title: z.string().min(1).max(200),
        durationSec: z.number().positive().max(6 * 3600),
        sourceType: z.enum(["native_upload", "camera_record"]),
        category: z.string().max(40).default("knowledge"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertNotBanned } = await import("@/lib/api-guard.server");
    await assertNotBanned(context.supabase, context.userId);
    if (!data.storagePath.startsWith(`${context.userId}/`)) throw new Error("That file is not yours.");
    const { data: project } = await context.supabase
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", context.userId)
      .eq("persona_id", data.personaId)
      .maybeSingle();
    if (!project) throw new Error("That project does not belong to the selected persona.");
    const { data: persona } = await context.supabase
      .from("creator_personas")
      .select("name")
      .eq("id", data.personaId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const chunks = splitIntoChunks(data.durationSec);
    const meta = JSON.stringify({ sourceTitle: data.title, sourceType: data.sourceType, thumbnailPath: data.thumbnailPath, durationSec: Math.round(data.durationSec) });
    const { data: row, error } = await context.supabase
      .from("mining_jobs")
      .insert({
        user_id: context.userId,
        source_kind: "upload",
        source_url: data.storagePath,
        source_label: data.title,
        custom_instructions: meta,
        chunks: chunks as never,
        results: [] as never,
        next_index: 0,
        total_chunks: chunks.length,
        status: "running",
        persona_id: data.personaId,
        project_id: data.projectId,
        category: data.category,
        publish_to_feed: false,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Could not start mining.");
    return {
      jobId: row.id as string,
      personaName: (persona?.name as string | undefined) ?? "",
      plan: chunks.map((c) => ({ index: c.index, startSec: c.start, endSec: c.end })),
    };
  });
