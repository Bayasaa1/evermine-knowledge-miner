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
};

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
    for (const row of data) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const result = (payload["result"] ?? {}) as Record<string, unknown>;
      const sub = (result["subconsciousness"] ?? {}) as Record<string, unknown>;
      const refreshed = (payload["personaRefresh"] ?? {}) as Record<string, unknown>;
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
    return {
      beliefs: strings(merged.beliefs, 45),
      decisionLogic: strings(merged.decisionLogic, 30),
      expressiveStyle: strings(merged.expressiveStyle, 20),
      skills: strings(merged.skills, 20),
      aestheticProfile: strings(merged.aestheticProfile, 10),
      phrases: merged.phrases.slice(0, 30),
      selfIntro: strings(merged.selfIntro, 4),
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
    sampleLines: transcript.filter((line) => line.length > 30 && line.length < 190).slice(0, 25),
    ...persona,
    selfIntro: strings([...persona.selfIntro, data.creator_name, data.description, ...persona.skills.slice(0, 4), ...persona.beliefs.slice(0, 4)], 10),
  };
}
