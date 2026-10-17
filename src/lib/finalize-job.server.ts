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
import { extractConcepts } from "@/lib/concepts";
import { ownerBrainFromJournal, subtitlesFromJournal, type OwnerBrain } from "@/lib/journal-build.server";
import { repairTimingsLocal } from "@/lib/repair-timings";

type JobRow = {
  id: string;
  user_id: string;
  source_url: string;
  source_label: string;
  custom_instructions: string | null;
  results: unknown;
  vault_id: string | null;
  persona_id: string | null;
  persona_name?: string | null;
  project_id: string | null;
  content_kind: string | null;
  category: string | null;
  publish_to_feed: boolean | null;
  chunks?: unknown;
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
  opts: { partial?: { done: number; total: number } } = {},
): Promise<string | null> {
  // A partial save never marks the job finished, so the final save still runs.
  if (job.vault_id) return job.vault_id;
  const partial = opts.partial;
  // Older results do not record their part; the job's own plan says where each one sits.
  const plan = (Array.isArray(job.chunks) ? job.chunks : []) as { start?: number; end?: number }[];
  const results = ((Array.isArray(job.results) ? job.results : []) as ChunkResult[]).map((r, i) => {
    const c = plan[i];
    return r.window || typeof c?.start !== "number" || typeof c?.end !== "number"
      ? r
      : { ...r, window: { start: c.start, end: c.end } };
  });
  const merged = mergeChunkResults(results);
  if (!merged) return null;
  const mined = merged;

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

  const category = job.category || "knowledge";
  const payload = {
    category,
    source: { kind: "youtube", label: job.source_label, url: job.source_url },
    minedAt: new Date().toISOString(),
    status: partial ? "partial" : "mined",
    ...(partial ? { progress: partial } : {}),
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

  // After the journal: (1) subtitles come straight from its speech lines,
  // (2) the Core Brain gets only the persona's own words and actions, in order.
  const ownerName = (job.persona_name || persona?.name || "").trim();
  // Lines that came back without a clock get an estimated time automatically,
  // so no creator ever has to press a "fix" button. Words are never touched.
  mined.transcript = repairTimingsLocal(subtitlesFromJournal(mined.journal, mined.transcript, ownerName) as never) as never;
  (mined as typeof mined & { ownerBrain?: OwnerBrain }).ownerBrain = ownerBrainFromJournal(mined.journal, ownerName);

  // 2. Destination project — only the creator's saved choice is valid. Mining
  //    must never invent a project or move a video between projects/personas.
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
      .select("id,persona_id")
      .eq("id", projectId)
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (!data) { console.warn("[finalize] project not found for job", job.id); return null; }
    if (!data.persona_id || (personaId && data.persona_id !== personaId)) {
      console.warn("[finalize] persona mismatch, saved parts kept on the job", job.id);
      return null;
    }
    personaId = data.persona_id;
  }
  if (!projectId || !personaId) return null;

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


  async function upsertContent(full: boolean) {
  // 4. Project card so the video shows up in the feed / project view.
  const kind = job.content_kind || "VISUAL_CONTENT";
  const description = (meta.sourceDescription || mined.story?.summary || "").slice(0, 500);
  const tags = (mined.subconsciousness?.skills ?? []).slice(0, 6);
  if (projectId) {
    let contentId: string | null = existingContent?.id ?? null;
    if (existingContent) {
      await admin
        .from("project_content")
        .update({
          title,
          description,
          tags,
          kind,
          category,
          transcript: mined.transcript as never,
          emotion_timeline: mined.emotionTimeline as never,
          mind_id: savedVault.id,
        })
        .eq("id", existingContent.id)
        .eq("user_id", job.user_id);
    } else {
      const { data: created } = await admin
        .from("project_content")
        .insert({
          project_id: projectId,
          user_id: job.user_id,
          kind,
          category,
          youtube_id: videoId,
          source_url: job.source_url,
          title,
          description,
          tags,
          transcript: mined.transcript as never,
          emotion_timeline: mined.emotionTimeline as never,
          mind_id: savedVault.id,
        })
        .select("id")
        .maybeSingle();
      contentId = (created?.id as string | undefined) ?? null;
    }

    // Keep the project's knowledge map current without rebuilding the whole
    // index: only this video's concepts are touched.
    if (contentId) {
      if (full) await indexVideoConcepts(admin, job.user_id, projectId, contentId, {
        tags,
        emotion_timeline: mined.emotionTimeline ?? [],
      });
    }

    // Only an explicit creator choice makes a project public.
    if (full && job.publish_to_feed === true && kind === "VISUAL_CONTENT") {
      await admin.from("projects").update({ published: true }).eq("id", projectId).eq("user_id", job.user_id);
    }
  }

  }

  // Mined-so-far saves only refresh the Mind; version history, knowledge map
  // and publishing happen once, when every part is done.
  if (partial) {
    await upsertContent(false);
    return savedVault.id as string;
  }

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

  await upsertContent(true);

  await admin
    .from("mining_jobs")
    .update({ vault_id: savedVault.id, status: "done" })
    .eq("id", job.id);

  // Roots grow by themselves once a video is fully mined; never blocks the save.
  if (!partial && projectId) {
    const { growProjectTopics } = await import("@/lib/topic-map.server");
    await growProjectTopics(admin, job.user_id, projectId).catch(() => 0);
  }

  return savedVault.id as string;
}

/**
 * Adds one video's concepts to its project's knowledge map.
 *
 * The map is a cache over data that already exists, so this only has to stay
 * roughly current: a full `rebuildProjectConcepts` can always restore it.
 */
async function indexVideoConcepts(
  admin: any,
  userId: string,
  projectId: string,
  contentId: string,
  row: { tags: unknown; emotion_timeline: unknown },
) {
  const concepts = extractConcepts(row);
  for (const c of concepts.slice(0, 60)) {
    const { data: existing } = await admin
      .from("project_concepts")
      .select("id,count,content_ids")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .eq("kind", c.kind)
      .eq("concept", c.concept)
      .maybeSingle();

    if (!existing) {
      await admin.from("project_concepts").insert({
        project_id: projectId,
        user_id: userId,
        concept: c.concept,
        label: c.label,
        kind: c.kind,
        count: 1,
        content_ids: [contentId],
      });
      continue;
    }

    const ids: string[] = Array.isArray(existing.content_ids) ? existing.content_ids : [];
    if (ids.includes(contentId)) continue;
    const next = [...ids, contentId].slice(0, 1000);
    await admin
      .from("project_concepts")
      .update({ count: next.length, content_ids: next })
      .eq("id", existing.id)
      .eq("user_id", userId);
  }
}
