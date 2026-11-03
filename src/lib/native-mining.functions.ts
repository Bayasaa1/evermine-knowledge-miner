import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { splitIntoChunks } from "@/lib/chunking";

/** Provision only the canonical private video bucket; never expose admin access. */
export const ensureVideoStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertNotBanned } = await import("@/lib/api-guard.server");
    await assertNotBanned(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bucket = "creator-videos";
    const { error } = await supabaseAdmin.storage.getBucket(bucket);
    if (error) {
      if (!/not found|does not exist/i.test(error.message)) throw new Error(`Video storage unavailable: ${error.message}`);
      // Legacy storage stays private; never turn it into a public bucket.
      for (const fallback of ["user_media", "user-media"]) {
        const { data: legacy } = await supabaseAdmin.storage.getBucket(fallback);
        if (legacy && !legacy.public) return { bucket: fallback };
      }
      throw new Error("Private video storage is unavailable.");
    }
    return { bucket };
  });

export const reportUploadMiningError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid(), message: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("mining_jobs").select("updated_at,status").eq("id", data.jobId).eq("user_id", context.userId).maybeSingle();
    if (!row || row.status === "done" || row.status === "paused_quota") return { ok: true };
    const { error } = await context.supabase.from("mining_jobs")
      .update({ status: "error", last_error: data.message })
      .eq("id", data.jobId).eq("user_id", context.userId).eq("source_kind", "upload")
      .eq("updated_at", row.updated_at)
      .in("status", ["queued", "running", "error"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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
        language: z.string().max(8).default("en"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertNotBanned } = await import("@/lib/api-guard.server");
    await assertNotBanned(context.supabase, context.userId);
    const match = /^(creator-videos|user_media|user-media):\/(.+)$/.exec(data.storagePath);
    const path = match?.[2] ?? data.storagePath;
    if (!path.startsWith(`${context.userId}/${data.projectId}/`) || path.includes("..")) throw new Error("That file is not in your project.");
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
    const { packInstructions } = await import("@/lib/mining-jobs");
    const meta = packInstructions({ sourceTitle: data.title, speakerIdentity: (persona?.name as string | undefined) ?? "", outputLanguage: data.language } as never);
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
        status: "queued",
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

/** Owner-only signed playback, supports canonical and legacy private source pointers. */
export const nativePlaybackUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ jobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: job } = await context.supabase.from("mining_jobs").select("source_url").eq("id", data.jobId).eq("user_id", context.userId).eq("source_kind", "upload").maybeSingle();
    if (!job) throw new Error("Uploaded video not found.");
    const match = /^(creator-videos|user_media|user-media):\/(.+)$/.exec(job.source_url);
    const path = match?.[2] ?? job.source_url;
    if (!path.startsWith(`${context.userId}/`)) throw new Error("Not your video.");
    for (const bucket of match?.[1] ? [match[1]] : ["creator-videos", "user_media", "user-media"]) {
      const { data: signed } = await context.supabase.storage.from(bucket).createSignedUrl(path, 60);
      if (signed) return { url: signed.signedUrl };
    }
    throw new Error("Video is unavailable in private storage.");
  });
