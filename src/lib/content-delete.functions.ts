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

    const { data: allOwnedContent, error: allContentError } = await context.supabase
      .from("project_content").select("id, project_id, mind_id, youtube_id, source_url").eq("user_id", context.userId);
    if (allContentError) throw new Error(allContentError.message);
    // Only a valid 11-character id or the exact selected row can match — never an empty value.
    const contentRows = (allOwnedContent ?? []).filter((row) =>
      (data.contentId && row.id === data.contentId) ||
      (videoId !== null && (youtubeIdFrom(row.youtube_id) === videoId || youtubeIdFrom(row.source_url) === videoId)),
    );
    if (new Set(contentRows.map((r) => youtubeIdFrom(r.youtube_id) ?? r.id)).size > 1) {
      throw new Error("Refusing to delete: request matched more than one video");
    }

    // Only this video's own Mind ids. Project-wide chats, reviews and settings
    // are never touched by deleting a video, even its last one.
    const mindIds = new Set<string>();
    for (const row of contentRows) {
      if (row.mind_id && !row.mind_id.startsWith("project:")) mindIds.add(row.mind_id);
    }
    const matchingVaultIds = new Set(requestedVaultIds);
    for (const row of ownedVaults ?? []) {
      const id = vaultYoutubeId(row.payload);
      if (videoId !== null && id === videoId) matchingVaultIds.add(row.id);
    }

    // Ownership is established above. Admin access removes public interactions
    // and purchase links made by other users, leaving no reference behind.
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
      const { error: versionsError } = await supabaseAdmin.from("mind_versions").delete().in("vault_id", ids);
      if (versionsError) throw new Error(versionsError.message);
      const { error: vaultError } = await supabaseAdmin.from("mind_vaults").delete().eq("user_id", context.userId).in("id", ids);
      if (vaultError) throw new Error(vaultError.message);
    }

    const { data: jobs, error: jobsReadError } = await supabaseAdmin
      .from("mining_jobs").select("id, source_url").eq("user_id", context.userId);
    if (jobsReadError) throw new Error(jobsReadError.message);
    const jobIds = videoId === null ? [] : (jobs ?? []).filter((job) => youtubeIdFrom(job.source_url) === videoId).map((job) => job.id);
    if (jobIds.length > 0) {
      const { error } = await supabaseAdmin.from("mining_jobs").delete().in("id", jobIds);
      if (error) throw new Error(error.message);
    }

    const contentIds = contentRows.map((row) => row.id);
    if (contentIds.length > 0) {
      const { error } = await supabaseAdmin.from("project_content").delete().eq("user_id", context.userId).in("id", contentIds);
      if (error) throw new Error(error.message);
    }
    return { ok: true, deletedContent: contentIds.length, deletedVaults: matchingVaultIds.size };
  });