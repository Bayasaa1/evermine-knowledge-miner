import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deleteInput = z.object({
  contentId: z.string().uuid().optional(),
  vaultIds: z.array(z.string().uuid()).max(100).optional(),
  youtubeId: z.string().trim().max(32).optional(),
  sourceUrl: z.string().trim().max(2_048).optional(),
});

function youtubeIdFrom(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)?.[1] ?? value.match(/^([\w-]{11})$/)?.[1] ?? null;
}

function vaultYoutubeId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  const video = value["video"] && typeof value["video"] === "object" ? value["video"] as Record<string, unknown> : {};
  const source = value["source"] && typeof value["source"] === "object" ? value["source"] as Record<string, unknown> : {};
  return youtubeIdFrom(video["videoId"]) ?? youtubeIdFrom(video["url"]) ?? youtubeIdFrom(source["url"]) ?? youtubeIdFrom(source["label"]);
}

/** Permanently removes one owned video and every app record derived from it. */
export const permanentlyDeleteVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteInput.parse(input))
  .handler(async ({ data, context }) => {
    const requestedVaultIds = [...new Set(data.vaultIds ?? [])];
    if (!data.contentId && requestedVaultIds.length === 0 && !data.youtubeId && !data.sourceUrl) throw new Error("A video is required");

    const { data: ownedVaults, error: vaultReadError } = await context.supabase
      .from("mind_vaults").select("id, project_id, payload").eq("user_id", context.userId);
    if (vaultReadError) throw new Error(vaultReadError.message);
    const requestedVaultRows = (ownedVaults ?? []).filter((row) => requestedVaultIds.includes(row.id));
    if (requestedVaultRows.length !== requestedVaultIds.length) throw new Error("Saved Mind not found");

    // Only the one requested video row may seed the match list. Without a
    // contentId this must stay empty — reading every owned row here used to
    // add every video's id and wipe the creator's whole library.
    let initialContent: { id: string; project_id: string; mind_id: string; youtube_id: string; source_url: string }[] = [];
    if (data.contentId) {
      const { data: rows, error: contentReadError } = await context.supabase
        .from("project_content").select("id, project_id, mind_id, youtube_id, source_url")
        .eq("user_id", context.userId).eq("id", data.contentId);
      if (contentReadError) throw new Error(contentReadError.message);
      if (!(rows ?? []).length) throw new Error("Video not found");
      initialContent = rows ?? [];
    }

    const inferredIds = new Set<string>();
    const explicitId = youtubeIdFrom(data.youtubeId) ?? youtubeIdFrom(data.sourceUrl);
    if (explicitId) inferredIds.add(explicitId);
    for (const row of requestedVaultRows) {
      const id = vaultYoutubeId(row.payload);
      if (id) inferredIds.add(id);
    }
    for (const row of initialContent ?? []) {
      const id = youtubeIdFrom(row.youtube_id);
      if (id) inferredIds.add(id);
    }
    // One delete = one video. Refuse anything that would touch several videos.
    if (inferredIds.size > 1) throw new Error("Refusing to delete: request matched more than one video");
    const videoId = [...inferredIds][0] ?? null;

    // Strict scope: never sweep the library by YouTube id. Only the exact
    // selected row, or — for a Saved Minds card — the row of that same video
    // inside the same project as the selected vaults.
    const vaultProjectIds = new Set(requestedVaultRows.map((r) => r.project_id).filter(Boolean) as string[]);
    const { data: allOwnedContent, error: allContentError } = await context.supabase
      .from("project_content").select("id, project_id, mind_id, youtube_id, source_url").eq("user_id", context.userId);
    if (allContentError) throw new Error(allContentError.message);
    const contentRows = data.contentId
      ? (allOwnedContent ?? []).filter((row) => row.id === data.contentId)
      : (allOwnedContent ?? []).filter((row) =>
          videoId !== null && vaultProjectIds.has(row.project_id) &&
          (youtubeIdFrom(row.youtube_id) === videoId || youtubeIdFrom(row.source_url) === videoId),
        );
    if (contentRows.length > 1) throw new Error("Refusing to delete: request matched more than one video");

    const mindIds = new Set<string>();
    for (const row of contentRows) {
      if (row.mind_id && !row.mind_id.startsWith("project:")) mindIds.add(row.mind_id);
    }
    // Only the vaults the user explicitly selected.
    const matchingVaultIds = new Set(requestedVaultIds);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const deleteIds = async (table: "chat_messages" | "mind_comments" | "mind_reviews" | "mind_purchases" | "mind_specs" | "robot_packages") => {
      if (mindIds.size === 0) return;
      const { error } = await supabaseAdmin.from(table).delete().in("mind_id", [...mindIds]);
      if (error) throw new Error(error.message);
    };
    await Promise.all([
      deleteIds("chat_messages"), deleteIds("mind_comments"), deleteIds("mind_reviews"),
      deleteIds("mind_purchases"), deleteIds("mind_specs"), deleteIds("robot_packages"),
    ]);

    if (matchingVaultIds.size > 0) {
      const ids = [...matchingVaultIds];
      const { error: versionsError } = await supabaseAdmin.from("mind_versions").delete().eq("user_id", context.userId).in("vault_id", ids);
      if (versionsError) throw new Error(versionsError.message);
      const { error: vaultError } = await supabaseAdmin.from("mind_vaults").delete().eq("user_id", context.userId).in("id", ids);
      if (vaultError) throw new Error(vaultError.message);
    }

    // Only mining jobs tied to a deleted vault, or to this video in the same project.
    const projectIds = new Set([...vaultProjectIds, ...contentRows.map((r) => r.project_id)]);
    const { data: jobs, error: jobsReadError } = await supabaseAdmin
      .from("mining_jobs").select("id, source_url, vault_id, project_id").eq("user_id", context.userId);
    if (jobsReadError) throw new Error(jobsReadError.message);
    const jobIds = (jobs ?? []).filter((job) =>
      (job.vault_id && matchingVaultIds.has(job.vault_id)) ||
      (videoId !== null && job.project_id && projectIds.has(job.project_id) && youtubeIdFrom(job.source_url) === videoId),
    ).map((job) => job.id);
    if (jobIds.length > 0) {
      const { error } = await supabaseAdmin.from("mining_jobs").delete().eq("user_id", context.userId).in("id", jobIds);
      if (error) throw new Error(error.message);
    }

    const contentIds = contentRows.map((row) => row.id);
    if (contentIds.length > 0) {
      const { error } = await supabaseAdmin.from("project_content").delete().eq("user_id", context.userId).in("id", contentIds);
      if (error) throw new Error(error.message);
    }
    return { ok: true, deletedContent: contentIds.length, deletedVaults: matchingVaultIds.size };
  });