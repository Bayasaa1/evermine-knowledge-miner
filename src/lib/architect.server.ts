/**
 * EverMind AI Architect Co-Pilot tools.
 *
 * Read tools (scout, health, stress, fix draft) never write. Writing tools
 * (apply_fix, bind_persona) run only after the user presses a button in chat.
 * apply_fix adds FAQ patches/annotations beside the mined result; it never
 * edits mined transcript, journal or facts. All AI runs on the caller's pool.
 */
import type { MindPayload } from "@/lib/mind-json";

import type { ArchitectCard, ArchitectResult, SystemAuditIssue, AttachedMind, MindDirective } from "@/lib/architect-types";
import { generateMindDirectives, normalizeMindRoster, stalledJob } from "@/lib/mind-directives";
import { automaticDirective, strongestModel, sourceVideoUrl, missingPostResult } from "@/lib/architect-operator";
import { allowedOperator, operatorLens, builtinOperator } from "@/lib/operator-mind";
import { analyzeTiming, findMineProblems, stampToSeconds, type TranscriptLine, type PartPlan } from "@/lib/subtitle-health";
import { isValidUuid } from "./mind-id";
export type { ArchitectCard, ArchitectResult };

type Db = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];
async function db(): Promise<Db> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

const parseJson = <T>(text: string): T | null => {
  const m = text.match(/[[{][\s\S]*[\]}]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
};

async function ask(userId: string, system: string, prompt: string, label: string) {
  const { generateRoleText } = await import("@/lib/user-ai.server");
  const out = await generateRoleText({ userId, role: "assistant", system, prompt, json: true, maxTokens: 2048, subjectKind: "project", subjectLabel: label });
  if (!out.text.trim()) throw new Error("The selected Chat AI returned an empty answer.");
  return out;
}

async function ownedProject(userId: string, projectId: string) {
  if (!isValidUuid(projectId)) return null;
  const { data } = await (await db()).from("projects").select("id,title,creator_name,persona_id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  return data as { id: string; title: string; creator_name: string | null; persona_id: string | null } | null;
}

/** Roster and health are owner-scoped, read-only and never call an AI. */
export async function attachedMindChoices(userId: string): Promise<AttachedMind[]> {
  const sb = await db();
  const [projects, personas] = await Promise.all([
    sb.from("projects").select("id,title,creator_avatar_url").eq("user_id", userId).order("title"),
    sb.from("creator_personas").select("id,name,avatar_url").eq("user_id", userId).order("name"),
  ]);
  if (projects.error || personas.error) throw new Error(projects.error?.message || personas.error?.message);
  return [...(personas.data ?? []).map((p) => ({ mindId: `persona:${p.id}`, name: p.name, avatar: p.avatar_url, kind: "persona" as const })), ...(projects.data ?? []).map((p) => ({ mindId: `project:${p.id}`, name: p.title, avatar: p.creator_avatar_url, kind: "project" as const }))];
}

/** Operator knowledge is always resolved from this account; never accepts client prompt prose. */
export async function resolveOperatorMind(userId: string, requested: unknown) {
  const preset = builtinOperator(requested);
  if (preset) return { id: preset.id, name: preset.name, prompt: operatorLens(preset.id) };
  const choices = await attachedMindChoices(userId);
  const id = allowedOperator(requested, choices);
  const name = choices.find((m) => m.mindId === id)?.name ?? (id === "builtin:musk" ? "Elon Musk-inspired Operator" : id === "builtin:ramsay" ? "Gordon Ramsay-inspired Operator" : "System Architect");
  if (id.startsWith("builtin:")) return { id, name, prompt: operatorLens(id) };
  const sb = await db();
  let query = sb.from("mind_vaults").select("deep:payload->result->deepBrain,rebuilt:payload->deepBrainRebuild,core:payload->core_brain,sub:payload->result->subconsciousness,owner:payload->result->ownerBrain").eq("user_id", userId).in("kind", ["mine", "core_brain"]);
  query = id.startsWith("project:") ? query.eq("project_id", id.slice(8)) : query.eq("persona_id", id.slice(8));
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(40);
  if (error) throw new Error(error.message);
  const parts = (data ?? []).flatMap((row) => [row.deep, ...(Array.isArray(row.rebuilt) ? row.rebuilt : [])].filter(Boolean).map((deep) => ({ deep })));
  const { synthesizeCoreBrain } = await import("@/lib/project-mind.server");
  return { id, name, prompt: operatorLens(id, { name, coreBrain: synthesizeCoreBrain(parts), savedCoreBrains: (data ?? []).map((row) => row.core).filter(Boolean), savedPersonality: (data ?? []).map((row) => row.sub).filter(Boolean), ownerVoice: (data ?? []).map((row) => row.owner).filter(Boolean) }) };
}

async function inspectProject(userId: string, projectId: string) {
  if (!isValidUuid(projectId)) throw new Error("Invalid project ID.");
  const sb = await db();
  const [jobs, vaults, videos, project] = await Promise.all([
    sb.from("mining_jobs").select("id,status,updated_at,source_url,next_index,chunks").eq("user_id", userId).eq("project_id", projectId),
    sb.from("mind_vaults").select("id,deep:payload->result->deepBrain,rebuilt:payload->deepBrainRebuild").eq("user_id", userId).eq("project_id", projectId).eq("kind", "mine"),
    sb.from("project_content").select("youtube_id,transcript").eq("user_id", userId).eq("project_id", projectId),
    sb.from("projects").select("published").eq("user_id", userId).eq("id", projectId).maybeSingle(),
  ]);
  if (jobs.error || vaults.error || videos.error) throw new Error(jobs.error?.message || vaults.error?.message || videos.error?.message);
  const stalled = (jobs.data ?? []).filter((j) => stalledJob(j.status, j.updated_at));
  const failed = (jobs.data ?? []).filter((j) => j.status === "error");
  const shallow = (vaults.data ?? []).filter((v) => !v.deep && !(Array.isArray(v.rebuilt) && v.rebuilt.length));
  const timingJobs: string[] = []; let missing = 0;
  for (const video of videos.data ?? []) {
    const lines = (Array.isArray(video.transcript) ? video.transcript : []) as TranscriptLine[];
    const job = (jobs.data ?? []).find((j) => j.status === "done" && video.youtube_id && j.source_url.includes(video.youtube_id));
    if (!job) continue;
    const parts = (Array.isArray(job.chunks) ? job.chunks : []) as PartPlan[];
    const problems = findMineProblems(lines, parts, job.next_index);
    const gaps = problems.filter((p) => p.kind === "empty_part" && problems.every((q) => q.kind !== "unfinished"));
    // Only surrounded silence is a gap, not a genuinely quiet video.
    const hasSpeech = (index: number) => {
      const part = parts[index];
      return !!part && lines.some((line) => { const at = stampToSeconds(line.timestamp); return at != null && at >= part.start && at < part.end; });
    };
    const surrounded = gaps.filter((p) => hasSpeech(p.part - 1) && hasSpeech(p.part + 1));
    missing += surrounded.length;
    if ((lines.length && analyzeTiming(lines).status !== "synced") || problems.some((p) => p.kind === "time_jump") || surrounded.length) timingJobs.push(job.id);
  }
  return { stalled, failed, shallow, timingJobs, missing, unposted: project.data?.published === false ? videos.data?.length ?? 0 : 0 };
}

export async function inspectAttachedMinds(userId: string, ids: unknown, lang = "en"): Promise<MindDirective[]> {
  const roster = normalizeMindRoster(ids);
  const choices = await attachedMindChoices(userId);
  const sb = await db();
  const { data, error } = await sb.from("projects").select("id,persona_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const directives: MindDirective[] = [];
  const health = new Map<string, Awaited<ReturnType<typeof inspectProject>>>();
  for (const id of roster) {
    const mind = choices.find((m) => m.mindId === id);
    if (!mind) continue;
    const projects = (data ?? []).filter((p) => id === `project:${p.id}` || id === `persona:${p.persona_id}`);
    for (const project of projects) {
      let h = health.get(project.id);
      if (!h) { h = await inspectProject(userId, project.id); health.set(project.id, h); }
      directives.push(...generateMindDirectives({ mindId: id, mindName: mind.name, mindAvatar: mind.avatar, projectId: project.id, stalled: h.stalled.length, failed: h.failed.length, shallow: h.shallow.length, timing: h.timingJobs.length, missing: h.missing, unposted: h.unposted }, lang));
    }
  }
  return directives;
}

/** Never trust a client-supplied tool/target: re-read ownership and the condition. */
export async function executeMindDirective(userId: string, ids: unknown, directiveId: string, lang = "en", operatorMindId: unknown = "builtin:architect"): Promise<ArchitectResult> {
  const directives = await inspectAttachedMinds(userId, ids, lang);
  const directive = directives.find((d) => d.id === directiveId);
  if (!directive) throw new Error("Directive is no longer active or this Mind is not yours.");
  if (directive.suggestedTool === "draft_post") return runOperatorSkill(userId, ids, directive.targetProjectId, "draft_post", lang, operatorMindId);
  const h = await inspectProject(userId, directive.targetProjectId);
  const sb = await db(); let count = 0;
  if (directive.suggestedTool === "resume_mining" || directive.suggestedTool === "clear_failed_jobs") {
    const rows = directive.suggestedTool === "resume_mining" ? h.stalled : h.failed;
    for (const job of rows) {
      const { data, error } = await sb.from("mining_jobs").update({ status: "queued", last_error: null, retry_after: null }).eq("id", job.id).eq("user_id", userId).eq("status", job.status).eq("updated_at", job.updated_at).select("id");
      if (error) throw new Error(error.message);
      count += data?.length ?? 0;
    }
  } else if (directive.suggestedTool === "deepen_legacy_vaults" || directive.suggestedTool === "rebuild_core_brain") {
    const row = h.shallow[0];
    if (row) { const saved = await deepenLegacyVault(userId, row.id); count = saved.actions_taken.length ? 1 : 0; }
  } else {
    const jobId = h.timingJobs[0];
    if (jobId) { const { autoRepairFinishedVideos } = await import("@/lib/auto-repair.server"); count = await autoRepairFinishedVideos(sb, Date.now() + 45_000, jobId); }
  }
  const text = lang === "mn" ? `${directive.mindName}: ${count} мөр боловсруулагдлаа. Үлдсэн асуудлыг дахин шалгалаа.` : lang === "ko" ? `${directive.mindName}: ${count}건 복구. 남은 문제를 다시 확인했습니다.` : `${directive.mindName}: ${count} record(s) updated. Remaining issues rechecked.`;
  return { text, actions_taken: count > 0 ? [directive.suggestedTool] : [], counts: { affected: count }, interactive_cards: [], directives: await inspectAttachedMinds(userId, ids, lang) };
}

async function projectVaults(userId: string, projectId: string) {
  if (!isValidUuid(projectId)) return [];
  const { data } = await (await db())
    .from("mind_vaults")
    .select("id,title,payload,updated_at")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .in("kind", ["mine", "review"])
    .order("updated_at", { ascending: false })
    .limit(40);
  return (data ?? []) as { id: string; title: string; payload: MindPayload }[];
}

/** Explicit operator scope: a selected project must belong to an attached owned Mind. */
export async function operatorProject(userId: string, ids: unknown, projectId: string) {
  const project = await ownedProject(userId, projectId);
  const roster = normalizeMindRoster(ids);
  if (!project || !roster.some((id) => id === `project:${project.id}` || id === `persona:${project.persona_id}`)) throw new Error("Select an attached project you own.");
  return project;
}

export async function operatorTick(userId: string, ids: unknown, lang: string, approved: boolean): Promise<ArchitectResult> {
  const directives = await inspectAttachedMinds(userId, ids, lang);
  const next = automaticDirective(directives);
  if (!approved || !next) return { text: lang === "mn" ? "Mind-уудыг шалгалаа. Автомат засвар шаардлагагүй." : lang === "ko" ? "마인드 점검 완료. 자동 복구 없음." : "Minds checked. No automatic repair needed.", actions_taken: [], interactive_cards: [], directives };
  // Polling only requeues stale jobs. AI timing re-mining needs an explicit action.
  if (next.suggestedTool !== "resume_mining") return { text: next.issueSummary, actions_taken: [], interactive_cards: [], directives };
  const result = await executeMindDirective(userId, ids, next.id, lang);
  return result;
}

export async function operatorProjects(userId: string, ids: unknown): Promise<AttachedMind[]> {
  const roster = normalizeMindRoster(ids);
  const { data, error } = await (await db()).from("projects").select("id,title,persona_id,creator_avatar_url").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((p) => roster.includes(`project:${p.id}`) || roster.includes(`persona:${p.persona_id}`)).map((p) => ({ mindId: `project:${p.id}`, name: p.title, avatar: p.creator_avatar_url, kind: "project" }));
}

export async function runOperatorSkill(userId: string, ids: unknown, projectId: string, skill: string, lang = "en", operatorMindId: unknown = "builtin:architect"): Promise<ArchitectResult> {
  const project = await operatorProject(userId, ids, projectId);
  const sb = await db();
  if (skill === "team_briefing") {
    // Read-only: aggregates every attached Mind's deterministic health report.
    const { teamBriefing } = await import("@/lib/architect-operator");
    const directives = await inspectAttachedMinds(userId, ids, lang);
    return { text: teamBriefing(directives, lang), actions_taken: [], interactive_cards: [], directives };
  }
  if (skill === "advance_mining") {
    const h = await inspectProject(userId, projectId);
    for (const job of [...h.stalled, ...h.failed].slice(0, 1)) {
      const { error } = await sb.from("mining_jobs").update({ status: "queued", retry_after: null, last_error: null }).eq("id", job.id).eq("user_id", userId).eq("updated_at", job.updated_at);
      if (error) throw new Error(error.message);
    }
    const { data, error } = await sb.from("mining_jobs").select("id").eq("user_id", userId).eq("project_id", projectId).eq("source_kind", "youtube").eq("status", "queued").order("queue_position").limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return { text: data ? "Mining checkpoint selected." : "No queued YouTube checkpoint. Native uploads require the original file.", actions_taken: [], interactive_cards: [], operator: { projectId, ...(data ? { jobId: data.id } : {}) } };
  }
  if (skill === "deepen_brains") {
    const h = await inspectProject(userId, projectId);
    const first = h.shallow[0];
    if (first) await deepenLegacyVault(userId, first.id);
    const { synthesizeCoreBrain } = await import("@/lib/project-mind.server");
    const vaults = await projectVaults(userId, projectId);
    const parts = vaults.flatMap((v) => [{ deep: v.payload.result?.["deepBrain"] }, ...(Array.isArray(v.payload["deepBrainRebuild"]) ? v.payload["deepBrainRebuild"].map((deep: unknown) => ({ deep })) : [])]);
    const core = synthesizeCoreBrain(parts);
    // Preview only: live Mind chats already synthesize from these evidence layers.
    const summary = JSON.stringify(core, null, 2);
    return { text: summary, actions_taken: ["deepen_brains"], interactive_cards: [] };
  }
  if (skill !== "draft_post") throw new Error("Unknown operator skill.");
  const vaults = await projectVaults(userId, projectId);
  for (const vault of vaults) {
    const r = vault.payload.result ?? {};
    const deep = (r["deepBrain"] ?? {}) as Record<string, unknown>;
    const model = strongestModel(deep["mentalModels"]);
    if (!model) continue;
    const source = sourceVideoUrl(vault.payload["source"]);
    const videoId = /(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(source)?.[1];
    if (!videoId) continue;
    const { data: video } = await sb.from("project_content").select("id").eq("user_id", userId).eq("project_id", projectId).eq("youtube_id", videoId).maybeSingle();
    if (!video) continue;
    const stamp = model["timestamp"] ?? model["timestamp_start"] ?? model["sourceTimestamp"];
    const start = typeof stamp === "number" ? stamp : stampToSeconds(String(stamp ?? ""));
    if (start == null || !Number.isFinite(start) || start < 0) continue;
    const clipUrl = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(start)}s`;
    let draft = `${project.title}\n${String(model["name"] ?? model["title"] ?? model["model"] ?? "")}\n${String(model["principle"] ?? model["explanation"] ?? model["description"] ?? model["reasoning"] ?? "")}\n${clipUrl}`;
    const brain = await resolveOperatorMind(userId, operatorMindId);
    if (brain.id !== "builtin:architect") {
      const { generateRoleText } = await import("@/lib/user-ai.server");
      const generated = await generateRoleText({ userId, role: "assistant", system: `${brain.prompt}\nWrite a short feed-post draft in ${lang}. Use only the supplied source facts. Do not invent quotes, facts or video times. Do not impersonate the real person. Omit the link; it will be appended by the system.`, prompt: JSON.stringify({ project: project.title, mentalModel: model }), maxTokens: 500, subjectKind: "project", subjectId: projectId, subjectLabel: "Operator post draft" });
      if (!generated.text.trim()) throw new Error("Operator returned an empty draft.");
      const { toneGuard } = await import("@/lib/architect-operator");
      draft = `${toneGuard(generated.text.trim()).clean}\n${clipUrl}`;
    }
    return { text: draft, actions_taken: [], interactive_cards: [], operator: { projectId, draft, clipUrl } };
  }
  return missingPostResult(lang);
}

export async function publishOperatorPost(userId: string, ids: unknown, projectId: string, approvedDraft: string): Promise<ArchitectResult> {
  const current = await runOperatorSkill(userId, ids, projectId, "draft_post");
  if (!current.operator?.clipUrl || !approvedDraft.endsWith(current.operator.clipUrl) || approvedDraft.length > 6000) throw new Error("Video evidence changed. Review the draft again before publishing.");
  const { toneGuard } = await import("@/lib/architect-operator");
  if (toneGuard(approvedDraft).flagged > 0) throw new Error("The draft contains offensive words. Edit it before publishing.");
  const sb = await db();
  const { data: profile } = await sb.from("profiles").select("display_name,avatar_url").eq("id", userId).maybeSingle();
  const { data, error } = await sb.from("user_posts").insert({ user_id: userId, author_name: profile?.display_name || "Creator", author_avatar: profile?.avatar_url ?? null, body: approvedDraft, media_kind: "none" }).select("id").single();
  if (error) throw new Error(error.message);
  return { text: "Post published.", actions_taken: ["publish_post"], interactive_cards: [], operator: { postId: data.id, published: true } };
}

export async function operatorChallengePack(userId: string, ids: unknown, projectId: string, operatorMindId: unknown, lang = "en"): Promise<ArchitectResult> {
  await operatorProject(userId, ids, projectId);
  const [brain, target] = await Promise.all([resolveOperatorMind(userId, operatorMindId), resolveOperatorMind(userId, `project:${projectId}`)]);
  const { challengeGenerateRules, parseChallenge } = await import("@/lib/mastery-challenge");
  const { generateRoleText } = await import("@/lib/user-ai.server");
  const generated = await generateRoleText({ userId, role: "assistant", system: `${brain.prompt}\nGenerate three challenges in ${lang}, using ONLY the target Mind's stored evidence. Return JSON {"challenges":[level1,level2,level3]} where each challenge uses this shape:\n${challengeGenerateRules(1, "knowledge")}\n${challengeGenerateRules(2, "knowledge")}\n${challengeGenerateRules(3, "knowledge")}\nTarget evidence:\n${target.prompt}`, prompt: "Build Levels 1, 2 and 3 now. No saved knowledge changes.", json: true, maxTokens: 3000, subjectKind: "project", subjectId: projectId, subjectLabel: "Operator Mastery pack" });
  const raw = parseJson<{ challenges?: unknown[] }>(generated.text)?.challenges;
  const challenges = [1, 2, 3].map((level) => parseChallenge(JSON.stringify(raw?.[level - 1] ?? {}), level as 1 | 2 | 3));
  if (challenges.some((challenge) => !challenge || challenge.pass_criteria.length === 0)) throw new Error("The Operator returned an incomplete challenge pack. Nothing was saved.");
  return { text: challenges.map((c) => c ? `Level ${c.level}: ${c.title}\n${c.scenario}\n${c.task_steps.join("\n")}\n${c.pass_criteria.join("\n")}\n${c.source_video_ref}` : "").join("\n\n"), actions_taken: ["challenge_pack"], interactive_cards: [], operatorMind: { id: brain.id, name: brain.name }, provider: generated.provider };
}

export async function undoOperatorPost(userId: string, postId: string): Promise<ArchitectResult> {
  if (!isValidUuid(postId)) throw new Error("Invalid post ID.");
  const { error } = await (await db()).from("user_posts").delete().eq("id", postId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { text: "Post removed.", actions_taken: ["undo_post"], interactive_cards: [] };
}

export async function projectChoices(userId: string, next: string): Promise<ArchitectResult> {
  const { data } = await (await db()).from("projects").select("id,title").eq("user_id", userId).order("created_at", { ascending: false }).limit(30);
  return {
    text: "Choose the project to work on.",
    actions_taken: ["Listed your projects"],
    interactive_cards: [{ type: "projects", projects: (data ?? []) as { id: string; title: string }[], next }],
  };
}

/** a) Find real, verified YouTube videos. AI only suggests; every pick is checked on YouTube. */
export async function scoutYoutubeSources(userId: string, topic: string, projectId?: string): Promise<ArchitectResult> {
  const project = projectId ? await ownedProject(userId, projectId) : null;
  const subject = topic.trim() || project?.creator_name || project?.title || "";
  if (!subject) return { text: "Tell me a creator or topic to search for.", actions_taken: [], interactive_cards: [] };
  const out = await ask(
    userId,
    "You recommend long, information-dense YouTube videos (interviews, lectures, podcasts) for building an AI clone of a person or topic. Return ONLY JSON: {\"videos\":[{\"url\":\"https://www.youtube.com/watch?v=...\",\"why\":\"...\"}]} with up to 8 real videos you are confident exist.",
    `Creator or topic: ${subject}`,
    "Architect: scout videos",
  );
  const picks = parseJson<{ videos?: { url?: string }[] }>(out.text)?.videos ?? [];
  const { youtubeId } = await import("@/lib/import-sources");
  const { fetchVideoDetails } = await import("@/lib/youtube-meta.server");
  const seen = new Set<string>();
  const cards: ArchitectCard[] = [];
  for (const p of picks.slice(0, 8)) {
    const id = youtubeId(String(p.url ?? ""));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    try {
      const d = await fetchVideoDetails(id);
      if (!d.title) continue;
      cards.push({ type: "video", videoId: id, url: d.url, title: d.title, author: d.authorName || d.channel, durationSec: d.durationSec, thumbnail: d.thumbnail, projectId: project?.id, personaId: project?.persona_id ?? undefined });
    } catch {
      /* not a real video: drop it */
    }
  }
  return {
    text: cards.length ? `Found ${cards.length} verified videos for “${subject}”.` : `No verified videos found for “${subject}”. Try a more specific name.`,
    provider: out.provider,
    actions_taken: [`Asked ${out.provider} for candidates`, `Checked ${seen.size} links on YouTube`, `${cards.length} confirmed`],
    interactive_cards: cards,
  };
}

/** b) Health score from what is actually saved. Pure read, no AI. */
export async function analyzeBrainHealth(userId: string, projectId: string): Promise<ArchitectResult> {
  const project = await ownedProject(userId, projectId);
  if (!project) return { text: "Project not found.", actions_taken: [], interactive_cards: [] };
  const vaults = await projectVaults(userId, projectId);
  const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);
  let transcript = 0, facts = 0, models = 0, quotes = 0, rules = 0, steps = 0, patches = 0;
  for (const v of vaults) {
    const r = (v.payload?.result ?? {}) as Record<string, unknown>;
    const deep = (r["deep"] ?? r) as Record<string, unknown>;
    transcript += len(r["transcript"]) + len(r["journal"]);
    facts += len(r["facts"]) + len(r["claims"]) + len(r["knowledge"]);
    models += len(deep["mental_models"]) + len(deep["core_mental_models"]);
    quotes += len(deep["verbatim_quotes"]) + len(deep["signature_quotes_and_stories"]);
    rules += len(deep["decision_rules"]) + len(deep["decision_playbooks"]);
    steps += len(r["steps"]) + len(r["movementSteps"]) + len(r["actions"]);
    patches += len(v.payload?.faqPatches);
  }
  const checks: [boolean, string, string][] = [
    [!!project.persona_id, "Persona identity is bound", "No persona is bound to this project"],
    [vaults.length >= 5, `${vaults.length} mined videos`, `Only ${vaults.length} mined videos (aim for 5+)`],
    [transcript >= 200, `${transcript} timed moments`, `Few timed moments (${transcript})`],
    [facts >= 50, `${facts} facts/claims`, `Shallow facts (${facts})`],
    [models >= 5, `${models} mental models`, `Mental models missing or few (${models})`],
    [quotes >= 10, `${quotes} verbatim quotes`, `Few verbatim quotes (${quotes})`],
    [rules >= 5, `${rules} decision rules`, `Few decision rules (${rules})`],
    [steps > 0 || patches > 0, `${steps} action steps, ${patches} fixes`, "No movement/robot/game steps or fixes yet"],
  ];
  const score = Math.round((checks.filter((c) => c[0]).length / checks.length) * 100);
  return {
    text: `Health score for “${project.title}”: ${score}/100.`,
    actions_taken: [`Read ${vaults.length} mined videos`, "Checked persona binding, depth, quotes, rules and steps"],
    interactive_cards: [{ type: "health", projectId, title: project.title, score, strengths: checks.filter((c) => c[0]).map((c) => c[1]), gaps: checks.filter((c) => !c[0]).map((c) => c[2]) }],
  };
}

async function brief(userId: string, projectId: string) {
  const { buildAuditBrief } = await import("@/lib/mind-audit");
  const vaults = await projectVaults(userId, projectId);
  return { vaults, text: vaults.slice(0, 3).map((v) => `## ${v.title}\n${buildAuditBrief(v.payload).slice(0, 6000)}`).join("\n\n") };
}

/** c) Draft a fix. Nothing is saved until the user presses "Apply Brain Fix". */
export async function autoFixBrain(userId: string, projectId: string, instructions: string): Promise<ArchitectResult> {
  const project = await ownedProject(userId, projectId);
  if (!project) return { text: "Project not found.", actions_taken: [], interactive_cards: [] };
  const { vaults, text } = await brief(userId, projectId);
  if (!vaults.length) return { text: "This project has no mined videos yet. Mine a video first.", actions_taken: [], interactive_cards: [] };
  const out = await ask(
    userId,
    "You deepen an AI Mind using ONLY the evidence given. Write first-person Q&A patches that turn shallow summaries into mental models (if X → Y, because Z), verbatim quotes with timestamps, and step-by-step playbooks. Never invent facts. Return ONLY JSON: {\"patches\":[{\"question\":\"\",\"answer\":\"\"}],\"notes\":[\"\"],\"persona_name\":\"\"} with 3-8 patches.",
    `Project: ${project.title}\nCreator: ${project.creator_name ?? ""}\nUser instructions: ${instructions || "deepen the weakest parts"}\n\n${text}`,
    "Architect: fix draft",
  );
  const p = parseJson<{ patches?: { question?: string; answer?: string }[]; notes?: string[]; persona_name?: string }>(out.text) ?? {};
  const patches = (p.patches ?? []).filter((x) => x.question && x.answer).slice(0, 8).map((x) => ({ question: String(x.question).slice(0, 500), answer: String(x.answer).slice(0, 2000) }));
  const cards: ArchitectCard[] = [{ type: "fix", projectId, vaultId: vaults[0]!.id, patches, notes: (p.notes ?? []).slice(0, 6).map(String) }];
  const name = (project.creator_name || p.persona_name || "").trim();
  if (!project.persona_id && name) cards.push({ type: "persona", projectId, name });
  return { text: `Drafted ${patches.length} improvements. Review and press Apply to save them.`, provider: out.provider, actions_taken: [`Read ${Math.min(3, vaults.length)} videos`, `Drafted fix with ${out.provider}`], interactive_cards: cards };
}

/** d) Three hard questions answered from current evidence. */
export async function stressTestMind(userId: string, projectId: string): Promise<ArchitectResult> {
  const project = await ownedProject(userId, projectId);
  if (!project) return { text: "Project not found.", actions_taken: [], interactive_cards: [] };
  const { vaults, text } = await brief(userId, projectId);
  if (!vaults.length) return { text: "This project has no mined videos yet.", actions_taken: [], interactive_cards: [] };
  const out = await ask(
    userId,
    "You stress-test an AI Mind. Write 3 tough questions a real fan would ask, answer each in first person using ONLY the evidence, and give a verdict: \"strong\", \"weak\" or \"missing\". Return ONLY JSON: {\"tests\":[{\"question\":\"\",\"answer\":\"\",\"verdict\":\"\"}]}",
    `Project: ${project.title}\n\n${text}`,
    "Architect: stress test",
  );
  const tests = (parseJson<{ tests?: { question?: string; answer?: string; verdict?: string }[] }>(out.text)?.tests ?? []).slice(0, 3).map((t) => ({ question: String(t.question ?? ""), answer: String(t.answer ?? ""), verdict: String(t.verdict ?? "weak") }));
  return { text: `Ran ${tests.length} hard questions.`, provider: out.provider, actions_taken: [`Simulated answers with ${out.provider}`], interactive_cards: [{ type: "stress", projectId, tests }] };
}

/** User-approved: add patches beside mined data (never edits the mined result). */
export async function applyBrainFix(userId: string, vaultId: string, patches: { question: string; answer: string }[]): Promise<ArchitectResult> {
  if (!isValidUuid(vaultId)) throw new Error("Invalid vault ID.");
  const sb = await db();
  const { data } = await sb.from("mind_vaults").select("id,payload").eq("id", vaultId).eq("user_id", userId).maybeSingle();
  if (!data) return { text: "Mind not found.", actions_taken: [], interactive_cards: [] };
  const payload = (data.payload ?? {}) as MindPayload;
  const now = new Date().toISOString();
  const added = patches.slice(0, 8).map((p, i) => ({ id: `p_${Date.now().toString(36)}_${i}`, question: String(p.question).slice(0, 500), answer: String(p.answer).slice(0, 2000), createdAt: now }));
  const { error } = await sb.from("mind_vaults").update({ payload: { ...payload, faqPatches: [...(payload.faqPatches ?? []), ...added] } as never }).eq("id", vaultId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { text: `Saved ${added.length} improvements. You can remove them in the Mind editor.`, actions_taken: [`Added ${added.length} FAQ patches`], interactive_cards: [] };
}

/** User-approved: bind a persona the user confirmed by pressing the button. */
export async function bindPersona(userId: string, projectId: string, name: string): Promise<ArchitectResult> {
  const project = await ownedProject(userId, projectId);
  if (!project) return { text: "Project not found.", actions_taken: [], interactive_cards: [] };
  const sb = await db();
  const { ensurePersonaForCreator } = await import("@/lib/personas");
  const persona = await ensurePersonaForCreator(sb as never, userId, name);
  if (!persona) return { text: "Could not create the persona.", actions_taken: [], interactive_cards: [] };
  await sb.from("projects").update({ persona_id: persona.id, creator_name: project.creator_name || persona.name }).eq("id", projectId).eq("user_id", userId);
  return { text: `Bound ${persona.name} (${persona.handle}) to “${project.title}”.`, actions_taken: ["Bound persona to project"], interactive_cards: [] };
}

// ---------------------------------------------------------------------------
// Full System Audit (read-only) and Auto-Heal (runs only from a user button).
// Healing never edits mined transcripts/journals/facts: it binds personas,
// re-queues stuck jobs, and adds a deepBrainRebuild layer beside mined results.
// ---------------------------------------------------------------------------

const STUCK_MS = 30 * 60 * 1000;
const HEAL_DEEPEN_LIMIT = 3;

type MineRow = { id: string; project_id: string | null; title: string; payload: Record<string, unknown> };

/** Explicit owner action; no AI credits, re-mining or source-data changes. */
export async function deepenLegacyVault(userId: string, vaultId: string): Promise<ArchitectResult> {
  if (!isValidUuid(vaultId)) throw new Error("Invalid vault ID.");
  const sb = await db();
  const { data } = await sb.from("mind_vaults").select("id,project_id,payload,updated_at").eq("id", vaultId).eq("user_id", userId).eq("kind", "mine").maybeSingle();
  if (!data || !data.project_id || !await ownedProject(userId, data.project_id)) throw new Error("Owned mined Mind not found.");
  const payload = (data.payload ?? {}) as Record<string, unknown>;
  const result = (payload["result"] ?? {}) as Record<string, unknown>;
  if (result["deepBrain"]) return { text: "This Mind already has its deep layer.", actions_taken: [], interactive_cards: [] };
  const { fuseVisualAndTranscriptBrain } = await import("@/lib/project-mind.server");
  const layer = fuseVisualAndTranscriptBrain(result);
  if (!layer) throw new Error("No saved speech or visual steps to deepen.");
  const prev = Array.isArray(payload["deepBrainRebuild"]) ? payload["deepBrainRebuild"] as unknown[] : [];
  if (prev.some((x) => x && typeof x === "object" && (x as Record<string, unknown>)["source"] === "visual-transcript-fusion")) return { text: "This Mind is already deepened.", actions_taken: [], interactive_cards: [] };
  const { data: saved, error } = await sb.from("mind_vaults").update({ payload: { ...payload, deepBrainRebuild: [...prev, layer] } as never }).eq("id", vaultId).eq("user_id", userId).eq("updated_at", data.updated_at).select("id");
  if (error || !saved?.length) throw new Error(error?.message || "Mind changed while deepening. Try again.");
  return { text: "Saved speech and visual playbooks added; original data preserved.", actions_taken: ["Added a separate evidence layer without AI"], interactive_cards: [] };
}

const isShallow = (p: Record<string, unknown>) => {
  const result = (p["result"] ?? {}) as Record<string, unknown>;
  const deep = (result["deepBrain"] ?? {}) as Record<string, unknown>;
  const has = (k: string) => Array.isArray(deep[k]) && (deep[k] as unknown[]).length > 0;
  const rebuilt = Array.isArray(p["deepBrainRebuild"]) && (p["deepBrainRebuild"] as unknown[]).length > 0;
  return !rebuilt && !(has("mentalModels") && has("verbatimQuotes") && has("frameworks"));
};

async function auditData(userId: string) {
  const sb = await db();
  const [projects, jobs, mines, keys, roles] = await Promise.all([
    sb.from("projects").select("id,title,creator_name,persona_id").eq("user_id", userId),
    sb.from("mining_jobs").select("id,status,updated_at,project_id,persona_id,source_label").eq("user_id", userId).in("status", ["running", "doing", "error", "paused_quota"]),
    sb.from("mind_vaults").select("id,project_id,title,payload").eq("user_id", userId).eq("kind", "mine").limit(400),
    sb.from("user_ai_keys").select("id,enabled,status").eq("user_id", userId),
    sb.from("user_ai_roles").select("role,key_id,team_key_ids").eq("user_id", userId),
  ]);
  const projectRows = (projects.data ?? []) as { id: string; title: string; creator_name: string | null; persona_id: string | null }[];
  const now = Date.now();
  const stuck = ((jobs.data ?? []) as { id: string; status: string; updated_at: string }[]).filter(
    (j) => j.status === "error" || ((j.status === "running" || j.status === "doing") && now - new Date(j.updated_at).getTime() > STUCK_MS),
  );
  const jobsNoPersona = ((jobs.data ?? []) as { id: string; project_id: string | null; persona_id: string | null }[]).filter((j) => j.project_id && !j.persona_id);
  const shallow = ((mines.data ?? []) as MineRow[]).filter((m) => m.project_id && isShallow(m.payload ?? {}));
  const keyRows = (keys.data ?? []) as { id: string; enabled: boolean; status: string }[];
  const working = new Set(keyRows.filter((k) => k.enabled && k.status === "ok").map((k) => k.id));
  const roleRows = (roles.data ?? []) as { role: string; key_id: string | null; team_key_ids: string[] | null }[];
  const brokenRoles = roleRows.filter((r) => ![r.key_id, ...(r.team_key_ids ?? [])].some((id) => id && working.has(id))).map((r) => r.role);
  return {
    orphanProjects: projectRows.filter((p) => !p.persona_id),
    stuck,
    jobsNoPersona,
    shallow,
    workingKeys: working.size,
    totalKeys: keyRows.length,
    brokenRoles,
    projectCount: projectRows.length,
  };
}

/** Read-only health check of the caller's own data. */
export async function auditEntireSystem(userId: string): Promise<ArchitectResult> {
  const d = await auditData(userId);
  const keyIssue = d.workingKeys === 0 ? 1 : 0;
  const issues: SystemAuditIssue[] = [
    { id: "personas", label: "Projects without a Persona", count: d.orphanProjects.length, detail: d.orphanProjects.slice(0, 5).map((p) => p.title).join(", "), fixable: true },
    { id: "jobs", label: "Stuck or failed mining jobs", count: d.stuck.length, detail: `${d.jobsNoPersona.length} active jobs also miss a persona link`, fixable: true },
    { id: "brains", label: "Mined parts with a shallow Core Brain", count: d.shallow.length, detail: `Up to ${HEAL_DEEPEN_LIMIT} parts are deepened per run, on your own AI key`, fixable: true },
    { id: "keys", label: "AI keys / roles without a working key", count: keyIssue + d.brokenRoles.length, detail: `${d.workingKeys}/${d.totalKeys} keys working${d.brokenRoles.length ? `; roles: ${d.brokenRoles.join(", ")}` : ""}`, fixable: false },
  ];
  const weights = { personas: 8, jobs: 4, brains: 1, keys: 15 } as const;
  const penalty = issues.reduce((sum, i) => sum + Math.min(30, i.count * weights[i.id as keyof typeof weights]), 0);
  const score = Math.max(0, 100 - penalty);
  const total = issues.reduce((n, i) => n + i.count, 0);
  return {
    text: `System health ${score}/100 — ${total} issue(s) across ${d.projectCount} projects.`,
    actions_taken: ["Audited projects, personas, mining jobs, brains, keys and roles (read-only)"],
    interactive_cards: [{ type: "system_audit", score, issues, fixable: issues.some((i) => i.fixable && i.count > 0) }],
  };
}

async function deepenVault(userId: string, row: MineRow): Promise<boolean> {
  const result = (row.payload["result"] ?? {}) as Record<string, unknown>;
    const evidence = JSON.stringify({ journal: result["journal"], transcript: result["transcript"], knowledge: result["knowledge"], knowledgeNodes: result["knowledgeNodes"], screenItems: result["screenItems"] }).slice(0, 14000);
  if (evidence.length < 200) return false;
  const out = await ask(
    userId,
    'Extract the primary speaker\'s deep thinking from this already-mined video part, using ONLY the evidence. Quotes must be copied exactly. Return ONLY JSON: {"mentalModels":[{"name","principle","causeEffect","firstPrinciples","timestamp","weight"}],"verbatimQuotes":[{"quote","timestamp","context"}],"frameworks":[{"name","trigger","action","because","steps":[],"timestamp"}],"voice":{"tone":[],"catchphrases":[],"contrarianBeliefs":[],"metaphors":[]}}',
    evidence,
    row.title,
  );
  const deep = parseJson<Record<string, unknown>>(out.text);
  if (!deep || typeof deep !== "object" || Array.isArray(deep)) return false;
  const prev = Array.isArray(row.payload["deepBrainRebuild"]) ? (row.payload["deepBrainRebuild"] as unknown[]) : [];
  const { error } = await (await db())
    .from("mind_vaults")
    .update({ payload: { ...row.payload, deepBrainRebuild: [...prev, deep] } as never })
    .eq("id", row.id)
    .eq("user_id", userId);
  return !error;
}

/** Runs only when the user presses "Fix All Issues Automatically". */
export async function autoHealSystem(userId: string): Promise<ArchitectResult> {
  const sb = await db();
  const d = await auditData(userId);
  const { ensurePersonaForCreator } = await import("@/lib/personas");
  const done: string[] = [];
  const notes: string[] = [];

  let bound = 0;
  for (const p of d.orphanProjects) {
    const name = (p.creator_name ?? "").trim();
    if (!name) {
      notes.push(`“${p.title}” has no creator name — pick a persona for it yourself.`);
      continue;
    }
    const persona = await ensurePersonaForCreator(sb as never, userId, name);
    if (!persona) continue;
    const { error } = await sb.from("projects").update({ persona_id: persona.id }).eq("id", p.id).eq("user_id", userId);
    if (!error) bound++;
  }

  // Active jobs inherit their project's persona.
  const { data: linked } = await sb.from("projects").select("id,persona_id").eq("user_id", userId).not("persona_id", "is", null);
  const personaOf = new Map(((linked ?? []) as { id: string; persona_id: string }[]).map((p) => [p.id, p.persona_id]));
  let jobsLinked = 0;
  for (const j of d.jobsNoPersona) {
    const pid = j.project_id ? personaOf.get(j.project_id) : undefined;
    if (!pid) continue;
    const { error } = await sb.from("mining_jobs").update({ persona_id: pid }).eq("id", j.id).eq("user_id", userId);
    if (!error) jobsLinked++;
  }

  let requeued = 0;
  if (d.stuck.length) {
    const { data } = await sb
      .from("mining_jobs")
      .update({ status: "queued", last_error: null, retry_after: null })
      .in("id", d.stuck.map((j) => j.id))
      .eq("user_id", userId)
      .select("id");
    requeued = data?.length ?? 0;
  }

  let deepened = 0;
  for (const row of d.shallow.slice(0, HEAL_DEEPEN_LIMIT)) {
    try {
      if (await deepenVault(userId, row)) deepened++;
    } catch (e) {
      notes.push(`Could not deepen “${row.title}”: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }
  const brainsLeft = Math.max(0, d.shallow.length - deepened);
  if (brainsLeft) notes.push(`${brainsLeft} shallow part(s) left — press Fix again to continue.`);
  if (d.workingKeys === 0 || d.brokenRoles.length) notes.push("Some AI roles have no working key — add or switch keys in API Manager.");

  if (bound) done.push(`Bound personas to ${bound} project(s)`);
  if (jobsLinked) done.push(`Linked ${jobsLinked} mining job(s) to their persona`);
  if (requeued) done.push(`Re-queued ${requeued} stuck/failed mining job(s)`);
  if (deepened) done.push(`Deepened ${deepened} Core Brain part(s)`);
  return {
    text: done.length ? "Auto-heal finished." : "Nothing could be fixed automatically.",
    actions_taken: done,
    interactive_cards: [{ type: "heal_result", fixed: done, notes, remaining: brainsLeft }],
  };
}

async function minableProjects(userId: string) {
  const { data } = await (await db()).from("projects").select("id,title,persona_id").eq("user_id", userId).not("persona_id", "is", null).order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as { id: string; title: string; persona_id: string }[]).map((p) => ({ id: p.id, title: p.title, personaId: p.persona_id }));
}

/** Pasted YouTube links: verify each on YouTube, offer a mine button. Read-only. */
export async function chatYoutubeLinks(userId: string, urls: string[]): Promise<ArchitectResult> {
  const { youtubeId } = await import("@/lib/import-sources");
  const { fetchVideoDetails } = await import("@/lib/youtube-meta.server");
  const projects = await minableProjects(userId);
  const cards: ArchitectCard[] = [];
  for (const url of urls.slice(0, 10)) {
    const id = youtubeId(url);
    if (!id) { if (/list=/.test(url)) cards.push({ type: "mine_link", url, title: "YouTube playlist", author: "", durationSec: 0, thumbnail: "", projects }); continue; }
    try {
      const d = await fetchVideoDetails(id);
      if (d.title) cards.push({ type: "mine_link", url: d.url, title: d.title, author: d.authorName || d.channel, durationSec: d.durationSec, thumbnail: d.thumbnail, projects });
    } catch { /* removed or fake video */ }
  }
  return { text: cards.length ? "Choose a project, then press Mine." : "These links could not be found on YouTube.", actions_taken: [`Checked ${urls.length} link(s) on YouTube`], interactive_cards: cards };
}

/** Lists every video of a project so the creator can confirm a full re-mine. */
export async function remineChoices(userId: string, projectId: string): Promise<ArchitectResult> {
  if (!projectId) {
    const projects = await minableProjects(userId);
    return { text: "Which project should be re-mined?", actions_taken: [], interactive_cards: [{ type: "projects", projects, next: "remine_preview" }] };
  }
  const project = await ownedProject(userId, projectId);
  if (!project?.persona_id) return { text: "This project needs a persona before it can be mined.", actions_taken: [], interactive_cards: [] };
  const { data } = await (await db()).from("mining_jobs").select("source_url,source_kind").eq("user_id", userId).eq("project_id", projectId).limit(1000);
  const urls = [...new Set(((data ?? []) as { source_url: string; source_kind: string | null }[]).filter((j) => (j.source_kind ?? "youtube") !== "upload").map((j) => j.source_url))];
  return { text: urls.length ? `${project.title}: ${urls.length} video(s) can be re-mined with your current Mining keys.` : "No YouTube videos found in this project.", actions_taken: ["Counted project videos"], interactive_cards: urls.length ? [{ type: "remine", projectId, personaId: project.persona_id, title: project.title, urls }] : [] };
}

/** Preview of the Smart split; nothing is written until the user confirms. */
export async function roleSplitPreview(userId: string, confirmed: boolean): Promise<ArchitectResult> {
  const { smartSplitPlan } = await import("@/lib/chat-commands");
  const sb = await db();
  const { data } = await sb.from("user_ai_keys").select("id,provider,enabled").eq("user_id", userId).eq("provider", "gemini").order("rank");
  const ids = ((data ?? []) as { id: string; enabled: boolean | null }[]).filter((k) => k.enabled !== false).map((k) => k.id);
  const plan = smartSplitPlan(ids);
  if (!plan) return { text: "Add at least 2 Gemini keys first.", actions_taken: [], interactive_cards: [] };
  const live = Math.min(3, ids.length - 1);
  if (!confirmed) return { text: "Proposed split of your keys:", actions_taken: [], interactive_cards: [{ type: "role_split", keyCount: ids.length, liveKeys: live, backgroundKeys: ids.length - live }] };
  const now = new Date().toISOString();
  for (const [role, team] of plan) {
    const { error } = await sb.from("user_ai_roles").upsert({ user_id: userId, role, provider: "gemini", key_id: team[0] ?? null, key_tail: null, auto_fallback: true, team_key_ids: team, exclusive: false, updated_at: now }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
  }
  return { text: `Done: chat, assistant and translation use ${live} key(s); mining, subtitles and brain share ${ids.length - live}.`, actions_taken: ["Saved 6 job assignments"], interactive_cards: [] };
}
