/**
 * Server-side finalisation of a finished mining job.
 *
 * Historically the mined checkpoints were only turned into a Mind (vault +
 * version + project card) by the creator's open tab. If the tab was closed the
 * background worker mined everything and then left the results stranded inside
 * mining_jobs.results — the creator saw nothing in My Vaults and no video in
 * the feed. This module does exactly what the tab used to do, using the admin
 * client but always scoped to the job's own user_id.
 */
import { mergeChunkResults } from "@/lib/merge-results";
import type { ChunkResult } from "@/lib/gemini";
import { unpackInstructions } from "@/lib/mining-jobs";

type JobRow = {
  id: string;
  user_id: string;
  source_url: string;
  source_label: string;
  custom_instructions: string | null;
  results: unknown;
  vault_id: string | null;
  persona_id: string | null;
  project_id: string | null;
  content_kind: string | null;
  publish_to_feed: boolean | null;
};

function youtubeIdOf(url: string): string {
  const m =
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(url ?? "");
  return m?.[1] ?? "";
}

/**
 * Writes a completed job into the creator's Mind vault, version history and
 * project. Safe to call twice: a job that already carries a vault_id is
 * skipped.
 */
export async function finalizeMiningJob(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  job: JobRow,
): Promise<string | null> {
  if (job.vault_id) return job.vault_id;
  const results = (Array.isArray(job.results) ? job.results : []) as ChunkResult[];
  const mined = mergeChunkResults(results);
  if (!mined) return null;

  const meta = unpackInstructions(job.custom_instructions ?? "");
  // The wizard's sourceTitle belongs to the batch, not to this video, so a
  // queue of videos would all inherit one title. The per-job label always wins
  // when it is a real title rather than a bare link or video id.
  const label = (job.source_label || "").trim();
  const labelIsTitle = label.length > 0 && !/^https?:\/\//i.test(label) && !/^[A-Za-z0-9_-]{11}$/.test(label);
  const title =
    (labelIsTitle ? label : "") ||
    mined.story?.summary?.slice(0, 60) ||
    (meta.sourceTitle || "").trim() ||
    label ||
    "New Mind";

  const payload = {
    source: { kind: "youtube", label: job.source_label, url: job.source_url },
    minedAt: new Date().toISOString(),
    status: "mined",
    result: mined,
  };

  // 1. Persona for branding (falls back to the creator's active persona).
  let personaId = job.persona_id;
  let persona: { id: string; name: string; avatar_url: string | null } | null = null;
  if (personaId) {
    const { data } = await admin
      .from("creator_personas")
      .select("id,name,avatar_url")
      .eq("id", personaId)
      .eq("user_id", job.user_id)
      .maybeSingle();
    persona = data ?? null;
  }
  if (!persona) {
    const { data } = await admin
      .from("creator_personas")
      .select("id,name,avatar_url")
      .eq("user_id", job.user_id)
      .eq("is_active", true)
      .maybeSingle();
    persona = data ?? null;
    personaId = persona?.id ?? personaId;
  }

  // 2. Destination project — reuse the chosen one, the card this video already
  //    has, or create one so the mind is never homeless.
  const videoId = youtubeIdOf(job.source_url);
  let projectId = job.project_id;
  let existingContent: { id: string; project_id: string } | null = null;
  if (videoId) {
    const { data } = await admin
      .from("project_content")
      .select("id,project_id")
      .eq("user_id", job.user_id)
      .eq("youtube_id", videoId)
      .limit(1)
      .maybeSingle();
    existingContent = data ?? null;
  }
  if (!projectId && existingContent) projectId = existingContent.project_id;
  if (projectId) {
    const { data } = await admin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (!data) projectId = null;
  }
  if (!projectId) {
    const { data } = await admin
      .from("projects")
      .insert({
        user_id: job.user_id,
        title,
        description: mined.story?.summary ?? "",
        persona_id: personaId ?? null,
        creator_name: persona?.name ?? "Evermind creator",
        creator_avatar_url: persona?.avatar_url ?? null,
      })
      .select("id")
      .single();
    projectId = data?.id ?? null;
  }

  // 3. Mind vault + version row. One vault per source video: a second mining
  //    pass of the same link updates the existing brain instead of creating a
  //    duplicate card in Saved Minds.
  let vault: { id: string } | null = null;
  if (videoId) {
    const { data: existingVault } = await admin
      .from("mind_vaults")
      .select("id")
      .eq("user_id", job.user_id)
      .eq("kind", "mine")
      .like("payload->source->>url", `%${videoId}%`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existingVault) {
      const { data: updated } = await admin
        .from("mind_vaults")
        .update({
          title,
          payload: payload as never,
          persona_id: personaId ?? null,
          project_id: projectId,
        })
        .eq("id", existingVault.id)
        .eq("user_id", job.user_id)
        .select("id")
        .single();
      vault = updated ?? existingVault;
    }
  }
  if (!vault) {
    const { data: inserted, error: vaultErr } = await admin
      .from("mind_vaults")
      .insert({
        user_id: job.user_id,
        title,
        kind: "mine",
        payload: payload as never,
        persona_id: personaId ?? null,
        project_id: projectId,
      })
      .select("id")
      .single();
    if (vaultErr || !inserted) return null;
    vault = inserted;
  }
  if (!vault) return null;
  const savedVault: { id: string } = vault;


  const { data: last } = await admin
    .from("mind_versions")
    .select("version_num")
    .eq("vault_id", savedVault.id)
    .order("version_num", { ascending: false })
    .limit(1)
    .maybeSingle();
  const versionNum = (last?.version_num ?? 0) + 1;
  await admin.from("mind_versions").insert({
    user_id: job.user_id,
    vault_id: savedVault.id,
    mind_id: savedVault.id,
    title,
    version: `v1.${versionNum - 1}`,
    version_num: versionNum,
    release_notes: `Mined from ${job.source_label}`,
    payload: payload as never,
    is_active: true,
  });

  // 4. Project card so the video shows up in the feed / project view.
  const kind = job.content_kind || "VISUAL_CONTENT";
  const description = (meta.sourceDescription || mined.story?.summary || "").slice(0, 500);
  const tags = (mined.subconsciousness?.skills ?? []).slice(0, 6);
  if (projectId) {
    if (existingContent) {
      await admin
        .from("project_content")
        .update({
          title,
          description,
          tags,
          kind,
          transcript: mined.transcript as never,
          emotion_timeline: mined.emotionTimeline as never,
          mind_id: savedVault.id,
        })
        .eq("id", existingContent.id)
        .eq("user_id", job.user_id);
    } else {
      await admin.from("project_content").insert({
        project_id: projectId,
        user_id: job.user_id,
        kind,
        youtube_id: videoId,
        source_url: job.source_url,
        title,
        description,
        tags,
        transcript: mined.transcript as never,
        emotion_timeline: mined.emotionTimeline as never,
        mind_id: savedVault.id,
      });
    }
    if (job.publish_to_feed !== false && kind === "VISUAL_CONTENT") {
      await admin.from("projects").update({ published: true }).eq("id", projectId).eq("user_id", job.user_id);
    }
  }

  await admin
    .from("mining_jobs")
    .update({ vault_id: savedVault.id, status: "done" })
    .eq("id", job.id);

  return savedVault.id as string;
}
