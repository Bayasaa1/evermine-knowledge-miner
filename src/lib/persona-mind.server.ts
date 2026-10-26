/**
 * A Persona invited into a chat speaks from ALL of its published projects:
 * their mined knowledge and creator-written stances are merged into one mind.
 * Only published projects are ever read.
 */
import { getPublicProjectMind, type CoreBrain, type PublicProjectMind } from "@/lib/project-mind.server";
import { loadCreatorExtras, type CreatorExtras } from "@/lib/mind-qa.server";

const uniq = <T,>(xs: T[], key: (x: T) => string, limit: number) => {
  const seen = new Set<string>();
  return xs.filter((x) => { const k = key(x).toLowerCase(); return seen.has(k) ? false : (seen.add(k), true); }).slice(0, limit);
};

export async function getPersonaMind(mindId: string): Promise<{ mind: PublicProjectMind; extras: CreatorExtras | null } | null> {
  if (!mindId.startsWith("persona:")) return null;
  const personaId = mindId.slice(8);
  if (!/^[0-9a-f-]{36}$/i.test(personaId)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: projects } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("persona_id", personaId)
    .eq("published", true)
    .order("updated_at", { ascending: false })
    .limit(6);
  const ids = (projects ?? []).map((p) => `project:${p.id}`);
  if (!ids.length) return null;
  const minds = (await Promise.all(ids.map((id) => getPublicProjectMind(id).catch(() => null)))).filter(Boolean) as PublicProjectMind[];
  if (!minds.length) return null;
  const extrasAll = (await Promise.all(ids.map((id) => loadCreatorExtras(id).catch(() => null)))).filter(Boolean) as CreatorExtras[];
  const s = (pick: (m: PublicProjectMind) => string[], limit: number) => uniq(minds.flatMap(pick), (x) => x, limit);
  const mind: PublicProjectMind = {
    name: minds[0]!.name,
    title: minds.map((m) => m.title).join(" · "),
    description: minds.map((m) => `${m.title}: ${m.description}`).join(" | ").slice(0, 600),
    knowledge: s((m) => m.knowledge, 300),
    transcript: s((m) => m.transcript, 400),
    beliefs: s((m) => m.beliefs, 40),
    decisionLogic: s((m) => m.decisionLogic, 20),
    expressiveStyle: s((m) => m.expressiveStyle, 12),
    skills: s((m) => m.skills, 20),
    aestheticProfile: s((m) => m.aestheticProfile, 8),
    phrases: uniq(minds.flatMap((m) => m.phrases), (p) => p.phrase, 12),
    sampleLines: s((m) => m.sampleLines, 10),
    selfIntro: s((m) => m.selfIntro, 10),
    ...(() => {
      const brains = minds.map((m) => m.coreBrain).filter(Boolean) as CoreBrain[];
      if (!brains.length) return {};
      const v = (k: keyof CoreBrain["identity_and_voice_dna"], n: number) => uniq(brains.flatMap((b) => b.identity_and_voice_dna[k]), (x) => x, n);
      // Models seen in several projects rank higher: sum mentions across projects.
      const models = new Map<string, CoreBrain["core_mental_models"][number]>();
      for (const m of brains.flatMap((b) => b.core_mental_models)) {
        const k = m.name.toLowerCase();
        const prev = models.get(k);
        if (prev) prev.mentions += m.mentions; else models.set(k, { ...m });
      }
      const coreBrain: CoreBrain = {
        identity_and_voice_dna: { tone: v("tone", 12), speaking_style: v("speaking_style", 12), metaphors: v("metaphors", 20), signature_phrases: v("signature_phrases", 30), contrarian_beliefs: v("contrarian_beliefs", 20) },
        core_mental_models: [...models.values()].sort((a, b) => b.mentions - a.mentions || a.rank - b.rank).slice(0, 40).map((m, i) => ({ ...m, rank: i + 1 })),
        signature_quotes_and_stories: uniq(brains.flatMap((b) => b.signature_quotes_and_stories), (q) => q.quote, 80),
        decision_playbooks: uniq(brains.flatMap((b) => b.decision_playbooks), (p) => p.rule, 50),
      };
      return { coreBrain };
    })(),
  };
  const first = extrasAll[0];
  const extras: CreatorExtras | null = first
    ? { ...first, qa: uniq(extrasAll.flatMap((e) => e.qa), (q) => q.question, 40), topics: uniq(extrasAll.flatMap((e) => e.topics), (x) => x, 12) }
    : null;
  return { mind, extras };
}
