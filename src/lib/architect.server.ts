/**
 * EverMind AI Architect Co-Pilot tools.
 *
 * Read tools (scout, health, stress, fix draft) never write. Writing tools
 * (apply_fix, bind_persona) run only after the user presses a button in chat.
 * apply_fix adds FAQ patches/annotations beside the mined result; it never
 * edits mined transcript, journal or facts. All AI runs on the caller's pool.
 */
import type { MindPayload } from "@/lib/mind-json";

export type ArchitectCard =
  | { type: "video"; videoId: string; url: string; title: string; author: string; durationSec: number; thumbnail: string; projectId?: string; personaId?: string }
  | { type: "health"; projectId: string; title: string; score: number; strengths: string[]; gaps: string[] }
  | { type: "fix"; projectId: string; vaultId: string; patches: { question: string; answer: string }[]; notes: string[]; personaName?: string }
  | { type: "stress"; projectId: string; tests: { question: string; answer: string; verdict: string }[] }
  | { type: "projects"; projects: { id: string; title: string }[]; next: string }
  | { type: "persona"; projectId: string; name: string };

export type ArchitectResult = {
  text: string;
  provider?: string;
  model?: string;
  actions_taken: string[];
  interactive_cards: ArchitectCard[];
};

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
  const out = await generateRoleText({ userId, role: "chat", system, prompt, json: true, maxTokens: 2048, subjectKind: "project", subjectLabel: label });
  if (!out.text.trim()) throw new Error("The selected Chat AI returned an empty answer.");
  return out;
}

async function ownedProject(userId: string, projectId: string) {
  const { data } = await (await db()).from("projects").select("id,title,creator_name,persona_id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  return data as { id: string; title: string; creator_name: string | null; persona_id: string | null } | null;
}

async function projectVaults(userId: string, projectId: string) {
  const { data } = await (await db())
    .from("mind_vaults")
    .select("id,title,payload,updated_at")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("kind", "review")
    .order("updated_at", { ascending: false })
    .limit(40);
  return (data ?? []) as { id: string; title: string; payload: MindPayload }[];
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
  const cards: ArchitectCard[] = [{ type: "fix", projectId, vaultId: vaults[0].id, patches, notes: (p.notes ?? []).slice(0, 6).map(String) }];
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
