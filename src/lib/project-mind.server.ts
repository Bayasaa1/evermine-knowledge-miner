import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type MindPhrase = {
  phrase: string;
  meaning: string;
  intent: string;
  usage: string;
};

export type PublicProjectMind = {
  name: string;
  title: string;
  description: string;
  knowledge: string[];
  transcript: string[];
  /** Newest videos first: title, date and a spread of real lines. */
  episodes?: string[];
  /** Mined personality — how this person actually thinks and talks. */
  beliefs: string[];
  decisionLogic: string[];
  expressiveStyle: string[];
  skills: string[];
  aestheticProfile: string[];
  phrases: MindPhrase[];
  /** Real lines the person said, used as voice samples for the clone. */
  sampleLines: string[];
  /** A compact factual identity card used for introductions. */
  selfIntro: string[];
  /** Structured deep Core Brain synthesized from every mined part. */
  coreBrain?: CoreBrain | undefined;
};

export type CoreBrain = {
  identity_and_voice_dna: { tone: string[]; speaking_style: string[]; metaphors: string[]; signature_phrases: string[]; contrarian_beliefs: string[] };
  core_mental_models: { name: string; principle: string; cause_effect: string; rank: number; mentions: number }[];
  signature_quotes_and_stories: { quote: string; timestamp: string; context: string; video?: string }[];
  decision_playbooks: { name: string; rule: string; steps: string[]; timestamp: string }[];
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

/** Merges per-part deepBrain blocks into one ranked Core Brain (pure, no AI). */
export function synthesizeCoreBrain(parts: { deep: unknown; video?: string }[]): CoreBrain {
  const models = new Map<string, CoreBrain["core_mental_models"][number] & { score: number }>();
  const quotes: CoreBrain["signature_quotes_and_stories"] = [];
  const plays: CoreBrain["decision_playbooks"] = [];
  const voice = { tone: [] as string[], speaking_style: [] as string[], metaphors: [] as string[], signature_phrases: [] as string[], contrarian_beliefs: [] as string[] };
  const seenQ = new Set<string>();
  const seenP = new Set<string>();
  for (const { deep, video } of parts) {
    const d = (deep ?? {}) as Record<string, unknown>;
    for (const m of arr(d["mentalModels"])) {
      const name = s(m["name"]) || s(m["principle"]).slice(0, 80);
      if (!name) continue;
      const key = name.toLowerCase();
      const weight = Math.min(10, Math.max(1, Number(m["weight"]) || 5));
      const cause = [s(m["causeEffect"]), s(m["firstPrinciples"])].filter(Boolean).join(" — ");
      const prev = models.get(key);
      if (prev) { prev.mentions++; prev.score += weight; if (!prev.cause_effect && cause) prev.cause_effect = cause; }
      else models.set(key, { name, principle: s(m["principle"]), cause_effect: cause, rank: 0, mentions: 1, score: weight });
    }
    for (const q of arr(d["verbatimQuotes"])) {
      const quote = s(q["quote"]);
      if (!quote || seenQ.has(quote.toLowerCase())) continue;
      seenQ.add(quote.toLowerCase());
      quotes.push({ quote, timestamp: s(q["timestamp"]), context: s(q["context"]), ...(video ? { video } : {}) });
    }
    for (const f of arr(d["frameworks"])) {
      const trigger = s(f["trigger"]); const action = s(f["action"]); const because = s(f["because"]);
      const rule = trigger && action ? `If ${trigger} -> ${action}${because ? ` because ${because}` : ""}` : action || s(f["name"]);
      if (!rule || seenP.has(rule.toLowerCase())) continue;
      seenP.add(rule.toLowerCase());
      plays.push({ name: s(f["name"]) || rule.slice(0, 60), rule, steps: (Array.isArray(f["steps"]) ? f["steps"] : []).map(s).filter(Boolean), timestamp: s(f["timestamp"]) });
    }
    const v = (d["voice"] ?? {}) as Record<string, unknown>;
    const push = (to: string[], from: unknown) => { for (const x of Array.isArray(from) ? from : []) { const t = s(x); if (t) to.push(t); } };
    push(voice.tone, v["tone"]);
    push(voice.signature_phrases, v["catchphrases"]);
    push(voice.metaphors, v["metaphors"]);
    for (const c of arr(v["contrarianBeliefs"])) { const b = s(c["belief"]); if (b) voice.contrarian_beliefs.push(s(c["against"]) ? `${b} (against: ${s(c["against"])})` : b); }
  }
  const ranked = [...models.values()].sort((a, b) => b.score - a.score).slice(0, 40).map(({ score: _s, ...m }, i) => ({ ...m, rank: i + 1 }));
  return {
    identity_and_voice_dna: {
      tone: strings(voice.tone, 12), speaking_style: strings(voice.speaking_style, 12), metaphors: strings(voice.metaphors, 20),
      signature_phrases: strings(voice.signature_phrases, 30), contrarian_beliefs: strings(voice.contrarian_beliefs, 20),
    },
    core_mental_models: ranked,
    signature_quotes_and_stories: quotes.slice(0, 80),
    decision_playbooks: plays.slice(0, 50),
  };
}

function strings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function phrases(value: unknown, limit: number): MindPhrase[] {
  if (!Array.isArray(value)) return [];
  const out: MindPhrase[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const row = (item ?? {}) as Record<string, unknown>;
    const phrase = String(row["phrase"] ?? "").trim();
    if (!phrase || seen.has(phrase.toLowerCase())) continue;
    seen.add(phrase.toLowerCase());
    out.push({
      phrase,
      meaning: String(row["meaning"] ?? "").trim(),
      intent: String(row["intent"] ?? "").trim(),
      usage: String(row["usage"] ?? "").trim(),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The mined Core Brain of one project: beliefs, reasoning habits, speaking
 * style and real phrases. Without this the chat can only recite transcript
 * lines, which is what makes a Mind sound like a robot.
 */
async function loadMinedPersona(projectId: string) {
  const empty = {
    beliefs: [] as string[],
    decisionLogic: [] as string[],
    expressiveStyle: [] as string[],
    skills: [] as string[],
    aestheticProfile: [] as string[],
    phrases: [] as MindPhrase[],
    selfIntro: [] as string[],
    facts: [] as string[],
    coreBrain: undefined as CoreBrain | undefined,
  };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("mind_vaults")
      .select("payload,updated_at")
      .eq("project_id", projectId)
      .eq("kind", "mine")
      .order("updated_at", { ascending: false })
      .limit(8);
    if (!data?.length) return empty;
    const merged = { ...empty };
    // The topic map (built after mining) gives the chat an index of what this person talks about.
    const { data: topicRow } = await supabaseAdmin
      .from("mind_vaults")
      .select("payload")
      .eq("kind", "topics")
      .eq("title", `topics:${projectId}`)
      .maybeSingle();
    if (topicRow?.payload) {
      const { topicIndexText } = await import("@/lib/topic-map.server");
      merged.facts.push(...topicIndexText(topicRow.payload as never).map((line) => `Topic: ${line}`));
    }
    const deepParts: { deep: unknown; video?: string }[] = [];
    for (const row of data) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const result = (payload["result"] ?? {}) as Record<string, unknown>;
      const sub = (result["subconsciousness"] ?? {}) as Record<string, unknown>;
      const refreshed = (payload["personaRefresh"] ?? {}) as Record<string, unknown>;
      const video = String(payload["sourceLabel"] ?? payload["title"] ?? "") || undefined;
      if (result["deepBrain"]) deepParts.push({ deep: result["deepBrain"], ...(video ? { video } : {}) });
      for (const d of Array.isArray(payload["deepBrainRebuild"]) ? (payload["deepBrainRebuild"] as unknown[]) : []) deepParts.push({ deep: d, ...(video ? { video } : {}) });
      merged.beliefs.push(...strings(sub["beliefs"], 200));
      merged.beliefs.push(...strings(refreshed["beliefs"], 200));
      merged.decisionLogic.push(...strings(sub["decisionLogic"], 200));
      merged.decisionLogic.push(...strings(refreshed["decisionLogic"], 200));
      merged.expressiveStyle.push(...strings(sub["expressiveStyle"], 200));
      merged.expressiveStyle.push(...strings(refreshed["expressiveStyle"], 200));
      merged.skills.push(...strings(sub["skills"], 200));
      merged.skills.push(...strings(refreshed["skills"], 200));
      merged.aestheticProfile.push(...strings(sub["aestheticProfile"], 200));
      merged.phrases.push(...phrases(sub["culturalVocabulary"], 200));
      const refreshedIntro = typeof refreshed["selfIntro"] === "string" ? String(refreshed["selfIntro"]).trim() : "";
      if (refreshedIntro) merged.selfIntro.push(refreshedIntro);
      // The mined facts themselves — without these the chat never knew what was said.
      const nodes = Array.isArray(result["knowledgeNodes"]) ? (result["knowledgeNodes"] as Record<string, unknown>[]) : [];
      for (const n of nodes) {
        const title = String(n?.["concept_title"] ?? "").trim();
        const detail = String(n?.["detailed_explanation"] ?? "").trim();
        if (title || detail) merged.facts.push(detail ? `${title}: ${detail.slice(0, 280)}` : title);
      }
      merged.facts.push(...strings(result["knowledge"], 200));
      // On-screen items stay typed so the chat can quote the exact link/code/formula.
      const screen = Array.isArray(result["screenItems"]) ? (result["screenItems"] as Record<string, unknown>[]) : [];
      for (const it of screen.slice(0, 200)) {
        const kind = String(it?.["kind"] ?? "text");
        const title = String(it?.["title"] ?? "").trim();
        const content = String(it?.["content"] ?? "").trim().slice(0, 400);
        const url = String(it?.["url"] ?? "").trim();
        const did = String(it?.["interaction"] ?? "").trim();
        merged.facts.push(`[${String(it?.["timestamp"] ?? "")}] SCREEN ${kind}: ${title}${content ? ` | ${content}` : ""}${url ? ` | ${url}` : ""}${did ? ` | owner: ${did}` : ""}`);
      }
      // The persona's own words and actions, in order — guests and played media never enter.
      const brain = (result["ownerBrain"] ?? null) as
        | { owner?: string; said?: { timestamp: string; text: string }[]; did?: { timestamp: string; text: string }[] }
        | null;
      const own = [...(brain?.said ?? []), ...(brain?.did ?? [])];
      if (own.length) {
        for (const m of own.slice(0, 400)) {
          if (m?.text) merged.facts.push(`[${m.timestamp}] ${brain?.owner || ""}: ${String(m.text).slice(0, 240)}`);
        }
      } else {
        // Older Minds without an owner brain: fall back to the journal minus played media.
        const journal = Array.isArray(result["journal"]) ? (result["journal"] as Record<string, unknown>[]) : [];
        for (const j of journal.slice(0, 300)) {
          const text = String(j?.["text"] ?? "").trim();
          if (!text) continue;
          const who = String(j?.["who"] ?? "").trim();
          if (/^video:/i.test(who)) continue;
          merged.facts.push(`[${String(j?.["timestamp"] ?? "").trim()}] ${who ? `${who}: ` : ""}${text.slice(0, 240)}`);
        }
      }
    }
    const coreBrain = deepParts.length ? synthesizeCoreBrain(deepParts) : undefined;
    // The deep layer also feeds the existing chat sections, ranked first.
    const deepModels = (coreBrain?.core_mental_models ?? []).map((m) => `${m.name}: ${m.principle}${m.cause_effect ? ` (${m.cause_effect})` : ""}`);
    const deepPlays = (coreBrain?.decision_playbooks ?? []).map((p) => p.rule);
    const voice = coreBrain?.identity_and_voice_dna;
    return {
      beliefs: strings([...deepModels.slice(0, 10), ...(voice?.contrarian_beliefs ?? []), ...merged.beliefs], 45),
      decisionLogic: strings([...deepPlays, ...merged.decisionLogic], 30),
      expressiveStyle: strings([...(voice?.tone ?? []).map((t) => `Tone: ${t}`), ...(voice?.metaphors ?? []).slice(0, 5).map((t) => `Metaphor I use: ${t}`), ...merged.expressiveStyle], 20),
      skills: strings(merged.skills, 20),
      aestheticProfile: strings(merged.aestheticProfile, 10),
      phrases: [...(voice?.signature_phrases ?? []).map((p) => ({ phrase: p, meaning: "", intent: "", usage: "" })), ...merged.phrases].slice(0, 30),
      selfIntro: strings(merged.selfIntro, 4),
      coreBrain,
      // Spoken lines must not starve knowledge/screen facts: those go first with their own budget.
      facts: (() => {
        const isSpeech = (f: string) => /^\[[^\]]*\] [^:]*: /.test(f) && !/\] SCREEN /.test(f);
        const core = strings(merged.facts.filter((f) => !isSpeech(f)), 600);
        const speech = strings(merged.facts.filter(isSpeech), 300);
        return [...core, ...speech];
      })(),
    };
  } catch {
    return empty;
  }
}

/** Resolves only published project knowledge through the anonymous public policy. */
export async function getPublicProjectMind(mindId: string): Promise<PublicProjectMind | null> {
  if (!mindId.startsWith("project:")) return null;
  const projectId = mindId.slice("project:".length);
  if (!projectId) return null;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  const client = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from("projects")
    .select("id,title,description,creator_name,project_content!inner(title,description,tags,transcript,kind,created_at)")
    .eq("id", projectId)
    .eq("published", true)
    .eq("project_content.kind", "VISUAL_CONTENT")
    .maybeSingle();
  if (error || !data) return null;
  const content = Array.isArray(data.project_content) ? data.project_content : [];
  const ownerKey = String(data.creator_name ?? "").toLowerCase().replace(/[^a-z0-9\p{L}]/gu, "");
  // A gameplay or solo video labels the creator generically ("Host", "Speaker",
  // "Commentator") while every named speaker is a game character. An interview
  // labels the guest by name, and there "Host" is somebody else entirely.
  const COMMENTARY = new Set(["host", "speaker", "commentator", "narrator", "me", "creator"]);
  const cuesOf = (item: { transcript: unknown }) => {
    if (!Array.isArray(item.transcript)) return [];
    return item.transcript
      .map((cue) => {
        const value = (cue ?? {}) as Record<string, unknown>;
        return {
          speech: String(value["speech"] ?? "").trim(),
          speaker: String(value["speaker"] ?? "").trim(),
          role: String(value["role"] ?? "").trim(),
        };
      })
      .filter((cue) => Boolean(cue.speech));
  };
  // Never mix host and guest dialogue: that makes the cloned person claim
  // somebody else's stories. Empty is safer than a false voice.
  const transcript = content.flatMap((item) => {
    const cues = cuesOf(item);
    const named = cues.filter((cue) => {
      const speakerKey = cue.speaker.toLowerCase().replace(/[^a-z0-9\p{L}]/gu, "");
      return ownerKey.length >= 3 && speakerKey.length >= 3 && (speakerKey.includes(ownerKey) || ownerKey.includes(speakerKey));
    });
    if (named.length >= 20) return named.map((cue) => cue.speech);
    // Too few lines carry the creator's name here, so this is their own solo
    // video: the generic commentary voice is them talking over the footage.
    const commentary = cues.filter((cue) => COMMENTARY.has(cue.speaker.toLowerCase()));
    return [...named, ...commentary].map((cue) => cue.speech);
  });
  const { facts, ...persona } = await loadMinedPersona(projectId);
  // Newest videos first, each with spread-out real lines, so "what did you do
  // lately?" can be answered with concrete events instead of filler.
  const episodes = [...content]
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, 5)
    .map((item) => {
      const lines = cuesOf(item).map((cue) => cue.speech).filter((s) => s.length > 15);
      const step = Math.max(1, Math.floor(lines.length / 10));
      const picks = lines.filter((_, i) => i % step === 0).slice(0, 10);
      const date = String(item.created_at ?? "").slice(0, 10);
      return [`"${item.title}"${date ? ` (${date})` : ""}${item.description ? ` — ${String(item.description).slice(0, 200)}` : ""}`, ...picks.map((p) => `  · ${p.slice(0, 180)}`)].join("\n");
    });
  // Sample the transcript evenly across all videos instead of only the first one.
  const tStep = Math.max(1, Math.floor(transcript.length / 1500));
  return {
    name: data.creator_name,
    title: data.title,
    description: data.description,
    knowledge: [...facts, ...content.flatMap((item) => [...item.tags, item.title, item.description]).filter(Boolean)].slice(0, 900),
    transcript: transcript.filter((_, i) => i % tStep === 0).slice(0, 1500),
    episodes,
    sampleLines: strings([...(persona.coreBrain?.signature_quotes_and_stories ?? []).map((q) => q.quote).slice(0, 10), ...transcript.filter((line) => line.length > 30 && line.length < 190)], 25),
    ...persona,
    selfIntro: strings([...persona.selfIntro, data.creator_name, data.description, ...persona.skills.slice(0, 4), ...persona.beliefs.slice(0, 4)], 10),
  };
}
