import { LANGUAGES } from "@/lib/languages";
import { normalizeYoutubeUrl, youtubeId } from "@/lib/import-sources";
import {
  normalizeChunkResult,
  speakerIdentityDirective,
  type ChunkResult,
  type SpeakerProfile,
} from "@/lib/gemini";
import { describeSpeakerLabel, reconcileTranscript } from "@/lib/transcript-reconcile";
import { buildTimeline, tidyCues, timelineForPrompt, type Cue } from "@/lib/timeline.server";

/** Nobody in a video stays nameless: blank or generic labels get a real role name. */
function nameEverySpeaker(speakers: SpeakerProfile[]): SpeakerProfile[] {
  let secondary = 0;
  let other = 0;
  return speakers.map((s) => {
    const index = s.role === "secondary" ? secondary++ : other++;
    return { ...s, label: describeSpeakerLabel(s.label, s.role, index) };
  });
}
import {
  GeminiHttpError,
  UserAiError,
  geminiGenerate,
  youtubeVideoPart,
  type AiCredential,
  type GeminiPart,
} from "@/lib/user-ai.server";

const miningPrompt = `You are a meticulous video journalist. Your first job is to record EVERYTHING that happens in the requested time range, in order, with times — like a detailed written chronicle of the video. Everything else is derived from that record.
Return JSON only with these keys:
- journal: the main output. A chronological, very detailed log with whole-video timestamp, who, kind, and text. One entry per moment: every spoken line, every visible action or gesture, every on-screen text, chat message, donation/alert/TTS, scene change, and every clip/video the creator plays. kind is one of speech, action, screen, chat, donation, text, event. "who" is the real name of the person (the Mind Owner's exact name for the owner), "Video: <name>" for people inside played media, "Chat" or "Donation" for viewer messages. For speech, "text" is the verbatim words in the original language; otherwise describe exactly what happened. Never skip a moment and never summarise many moments into one.
- speakers: distinct voices with label, role (primary, secondary, unknown), and description.
- subtitle: verbatim spoken lines with whole-video timestamp, speech, speaker, and role — the same speech as the journal. Preserve the original language exactly.
- story: summary, tone, and chronological beats with timestamp, event, and emotion.
- faceData: keyframes of the Mind Owner's own face only (for face cloning) with timestamp, description, gestures, lighting, faceAngle, cloneQuality, isKeyAction, actionType, clipStart, and clipEnd.
- voiceData: the cleanest music-free windows of the Mind Owner's own voice only (for voice cloning) with start, end, quality, note, and musicPresent.
- audio: hasMusic, atmosphere, genres, moods, tempo, segments, and audioSkillAssets.
- subconsciousness: skills, beliefs, decisionLogic, culturalVocabulary, expressiveStyle, and aestheticProfile — only from what the owner personally said or did.
- knowledgeNodes: facts and ideas with timestamp_start, timestamp_end, concept_title, detailed_explanation, spatial_action (null unless an object is physically handled), and confidence_score between 0.0 and 1.0. Use below 0.8 whenever you are guessing, since those nodes are discarded.
- screenItems: every distinct piece of information shown on screen, typed — never blended into a sentence. Each item: timestamp, kind (link, code, formula, lesson, text, chat, image, ui), title, content (verbatim as shown: the exact URL, code, formula, handle or text), url (or null), language (for code, or null), steps (array, for lessons), interaction (what the owner did with it, e.g. "read it aloud", "clicked it", "typed it", or null).
- qaPairs: every real question asked in this range and its answer: timestamp, asker, question (verbatim, original language), answerer, answer (faithful self-contained summary in the original language). Skip rhetorical questions. Empty list if none.

WATCH AND LISTEN TOGETHER
- You receive the video with its audio. Transcribe speech from the audio yourself, every sentence, in order, with the exact second it starts. Do not skip quiet or music-covered speech you can still understand.
- Link each action and screen item to the moment it happens, next to the words spoken at that time.
- One speech entry = one whole sentence or phrase (typically 3–15 seconds), never one word per entry. Timestamp = second the sentence starts.

SCRIPT FIDELITY
- Write each spoken word in the script of the language it was spoken in. Mongolian speech is written in Mongolian Cyrillic — never in Latin transliteration. English words spoken inside Mongolian speech stay in English Latin letters (e.g. "my computer", not "май компьютер"). Same for any other language mixed in.

People inside videos, clips, games or streams that the owner plays on screen are never the owner. Decode idioms, teasing and sarcasm by their real cultural intent. Every culturalVocabulary item needs phrase, timestamp, kind, literal, meaning, intent, sentiment, and usage. Do not invent anything that is not in the video.`;

const FINAL_RULES = `\n\nFINAL HARD RULES (override everything above)\n1. Mongolian speech MUST be written in Mongolian Cyrillic letters (А-Я, Ө, Ү). Writing Mongolian in Latin letters (e.g. "bolovch", "yaagaad") is WRONG and will be rejected. Correct: "боловч", "яагаад".\n2. Speech entries are whole sentences, never single words.\n3. SCREEN IS MANDATORY. Watch the picture for the whole range, not only the audio. For EVERY minute of the range record at least 2 screenItems AND matching journal entries of kind "screen" or "action": item/skin/weapon names, case names, prices and amounts, donations (name + amount + message), alerts, error windows, website names, game state, chat lines read aloud, links, handles. Copy names and numbers exactly as shown. Speech being long is never a reason to skip the screen. Fill knowledgeNodes too.\n4. Every timestamp is whole-video time written as MM:SS or HH:MM:SS (e.g. "13:25", "01:02:03"). Never write seconds like "805s".\n5. Stay inside the requested time range; never write moments after its end.\n6. ONE PERSON AT THE MICROPHONE STAYS ONE PERSON. Shouting, laughing, changing voice, imitating someone, holding a phone near the mic or reading chat aloud is still the Mind Owner. Never invent "Caller", "Guest", "Host" or "Speaker 2" for it. Use another name only when a clearly different second human voice is audibly talking (call, Discord, person in the room) or for people inside played media ("Video: <name>").`;

const SAFETY_MESSAGE =
  "SAFETY_BLOCKED: Google's AI safety filters stopped the analysis of this video. Try a different clip or trim out sensitive, adult or violent moments.";

function gatewayMessage(status: number, detail: string): string {
  if (/safety|blocked|prohibited content|harm_category/i.test(detail)) return SAFETY_MESSAGE;
  if (status === 402) return detail || "AI credits are exhausted for this workspace.";
  if (status === 403) return detail || "AI access is blocked for this workspace.";
  if (status === 429) return detail || "Video analysis is busy. Please try again shortly.";
  if (/unavailable|not found|private/i.test(detail)) return "This YouTube video is private or unavailable.";
  return detail || `Video analysis failed (${status}).`;
}

/** Free-text answers from the pre-mining assessment wizard. */
export type Assessment = {
  videoContext?: string;
  primaryFocus?: string;
  customInstructions?: string;
  speakerIdentity?: string;
  sourceTitle?: string;
  sourceDescription?: string;
  sourcePublishedAt?: string;
  sourceDurationLabel?: string;
  sourceChannel?: string;
  /** UI language code — the mined JSON must be written natively in it. */
  outputLanguage?: string;
  /**
   * How this video should be read:
   * "auto"  — use YouTube's subtitles when the video is a talking one, else watch it.
   * "fast"  — read the subtitles; only watch the video if there are none.
   * "watch" — always watch the video with Gemini (needed for anything visual).
   */
  miningMode?: "auto" | "fast" | "watch";
};

/**
 * Captions are always read first when they exist, whatever the video type —
 * only an explicit "watch" mode sends the part to the video model.
 */
function readsFromSubtitles(a: Assessment | undefined): boolean {
  return (a?.miningMode ?? "auto") !== "watch";
}

async function hasUploadedCaptions(videoId: string, userId: string): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("mind_vaults")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "captions")
      .eq("title", videoId);
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  Object.values(LANGUAGES).map((l) => [l.code, `${l.name} (${l.native})`]),
);

/**
 * The Core Brain is stored in the language the creator actually speaks, so
 * viewers asking in that language find the knowledge.
 */
function languageDirective(code: string | undefined): string {
  const audience = LANGUAGE_NAMES[(code ?? "en").toLowerCase()];
  return `\n\nSTORAGE LANGUAGE — THE SPOKEN LANGUAGE\nWrite every human-readable JSON value (titles, explanations, beliefs, journal, subtitles, Q&A) in the same language the main speaker speaks in the video. NEVER translate speech into English. Keep names and technical terms exactly as spoken.${
    audience ? ` The creator's audience speaks ${audience}.` : ""
  }`;
}

/** Auto-extracted YouTube metadata, given to the model as grounding context. */
function metadataDirective(a: Assessment): string {
  const rows = [
    a.sourceTitle ? `Title: ${a.sourceTitle}` : "",
    a.sourceChannel ? `Channel / author: ${a.sourceChannel}` : "",
    a.sourcePublishedAt ? `Published: ${a.sourcePublishedAt}` : "",
    a.sourceDurationLabel ? `Duration: ${a.sourceDurationLabel}` : "",
    a.sourceDescription ? `Original description and tags:\n${a.sourceDescription.slice(0, 4_000)}` : "",
  ].filter(Boolean);
  if (!rows.length) return "";
  return `\n\nSOURCE METADATA (from YouTube — use it for names, spelling, topics and chronology; never treat it as spoken content)\n${rows.join("\n")}`;
}

function assessmentDirective(a: Assessment | undefined): string {
  if (!a) return "";
  const lines: string[] = [];
  if (a.videoContext) lines.push(`Video context: ${a.videoContext}. Interpret every scene through this lens.`);
  if (a.primaryFocus) lines.push(`Primary extraction focus: ${a.primaryFocus}. Weight the output heavily toward it.`);
  if (a.customInstructions) lines.push(`Creator instructions: ${a.customInstructions}`);
  const speaker = speakerIdentityDirective(a.speakerIdentity);
  const language = languageDirective(a.outputLanguage);
  const meta = metadataDirective(a);
  return lines.length || speaker || meta || language
    ? `\n\nCREATOR ASSESSMENT\n${lines.join("\n")}${speaker}${meta}${language}`
    : "";
}


/**
 * The analysis pass must describe the video against the real timeline instead
 * of inventing clock values, so the numbered spoken lines are handed to it and
 * every timed field has to quote one of them.
 */
function timelineDirective(block: string): string {
  if (!block) return "";
  return `\n\nREFERENCE CAPTION TIMELINE (the TIMES were measured and are true; the WORDS may be wrong)\n${block}\n\nTIMING RULES\n- Every timestamp you write MUST be copied from the line above that the moment belongs to.\n- Never invent a time, never write 00:00:00 as a placeholder, never leave a timestamp empty.\n\nWORDING RULES (DOUBLE-CHECK, DO NOT COPY BLINDLY)\n- These caption words come from automatic speech recognition and often mishear names, Mongolian words and mixed-language phrases.\n- For every line, listen to the audio and compare it with the caption. Keep the caption wording when it matches what you hear and reads as a sensible sentence; otherwise write what is genuinely spoken.\n- Keep the caption's time window and speaker split; only the words may change.\n- Never translate, never paraphrase, never smooth out the speaker's own way of talking, and never delete a line you can hear just because the caption is missing it.`;
}

const personaChecked = new Set<string>();

/**
 * Makes sure the job (and its project) has an identified Persona before mining.
 * Missing ones are resolved/created from the video's author, owner speaker or
 * channel, then saved on the project and the job. Best effort: never blocks mining.
 */
export async function ensureJobPersona(input: {
  userId: string;
  jobId?: string | undefined;
  videoId: string;
  assessment?: Assessment | undefined;
}): Promise<{ id: string; name: string; handle: string } | null> {
  const key = input.jobId || `${input.userId}:${input.videoId}`;
  if (personaChecked.has(key)) return null;
  personaChecked.add(key);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensurePersonaForCreator } = await import("@/lib/personas");
    const job = input.jobId
      ? (await supabaseAdmin.from("mining_jobs").select("persona_id, project_id").eq("id", input.jobId).maybeSingle()).data
      : null;
    const projectId = (job as { project_id: string | null } | null)?.project_id ?? null;
    const project = projectId
      ? (await supabaseAdmin.from("projects").select("persona_id, creator_name").eq("id", projectId).maybeSingle()).data
      : null;
    const existing = (job as { persona_id: string | null } | null)?.persona_id || (project as { persona_id: string | null } | null)?.persona_id;
    let persona: { id: string; name: string; handle: string } | null = null;
    if (existing) {
      const { data } = await supabaseAdmin.from("creator_personas").select("id,name,handle").eq("id", existing).maybeSingle();
      persona = (data as typeof persona) ?? null;
    }
    if (!persona) {
      let name = ownerNameFrom(input.assessment?.speakerIdentity) || (project as { creator_name: string | null } | null)?.creator_name?.trim() || "";
      let handle = "";
      if (!name || !input.assessment?.sourceChannel) {
        const { fetchVideoDetails } = await import("@/lib/youtube-meta.server");
        const d = await fetchVideoDetails(input.videoId).catch(() => null);
        handle = d?.channelHandle ?? "";
        name = name || d?.authorName || d?.channel || "";
      }
      name = name || input.assessment?.sourceChannel?.trim() || "";
      persona = await ensurePersonaForCreator(supabaseAdmin as never, input.userId, name, handle || undefined);
    }
    if (!persona) return null;
    if (input.jobId && !(job as { persona_id: string | null } | null)?.persona_id)
      await supabaseAdmin.from("mining_jobs").update({ persona_id: persona.id }).eq("id", input.jobId);
    if (projectId && !(project as { persona_id: string | null } | null)?.persona_id)
      await supabaseAdmin.from("projects").update({ persona_id: persona.id, creator_name: (project as { creator_name: string | null }).creator_name || persona.name }).eq("id", projectId);
    if (input.assessment && !input.assessment.speakerIdentity) input.assessment.speakerIdentity = persona.name;
    return persona;
  } catch {
    personaChecked.delete(key);
    return null;
  }
}

/**
 * Reading a talking video's subtitles needs no video model at all, so this is
 * offered on its own: a job can try it before asking for a Gemini key, and only
 * fall back to watching when there are no usable captions.
 */
export async function tryTranscriptMine(input: {
  url: string;
  startSec: number;
  endSec: number;
  assessment?: Assessment;
  usage: { userId: string; videoLabel?: string; videoId?: string; jobId?: string };
}): Promise<ChunkResult | null> {
  const url = normalizeYoutubeUrl(input.url);
  const videoId = url ? youtubeId(url) : "";
  if (!videoId || input.endSec <= input.startSec) return null;
  await ensureJobPersona({ userId: input.usage.userId, jobId: input.usage.jobId, videoId, assessment: input.assessment });
  // Only subtitles the creator uploaded are read as text. YouTube's automatic
  // captions are skipped: Gemini watches video + audio together instead,
  // because auto-ASR was empty or garbled in real tests.
  void readsFromSubtitles;
  if (!(await hasUploadedCaptions(videoId, input.usage.userId))) return null;
  try {
    const { analyzeTranscript } = await import("@/lib/transcript-mine.server");
    const fast = await analyzeTranscript({
      videoId,
      startSec: input.startSec,
      endSec: input.endSec,
      ...(input.assessment ? { assessment: input.assessment } : {}),
      usage: input.usage,
    });
    if (!fast) return null;
    // Screen pass: links, code, formulas, lessons and what the creator did with
    // them. Optional — any failure leaves the caption result untouched.
    try {
      const { runGeminiRoleWithFallback } = await import("@/lib/user-ai.server");
      const { mineScreenItems, screenJournal } = await import("@/lib/screen-mine.server");
      const owner = (fast.result.speakers ?? []).find((s) => s.role === "primary")?.label ?? "";
      const { value: items } = await runGeminiRoleWithFallback(input.usage.userId, "mine", (credential) =>
        mineScreenItems({ url: url!, startSec: input.startSec, endSec: input.endSec, credential, ownerName: owner, usage: input.usage }),
      );
      if (items.length) {
        const { stampToSeconds } = await import("@/lib/timeline.server");
        const at = (t: string) => stampToSeconds(t) ?? Number.MAX_SAFE_INTEGER;
        fast.result.screenItems = items;
        fast.result.journal = [...(fast.result.journal ?? []), ...screenJournal(items, owner)].sort((a, b) => at(a.timestamp) - at(b.timestamp));
      }
    } catch {
      // No Gemini key or quota — words are still saved.
    }
    return fast.result;
  } catch {
    // The writing engine is out of tokens or refused — the caller falls back
    // to watching the video with Gemini instead of failing the job.
    return null;
  }
}

export async function analyzeYoutubeVideo(input: {
  url: string;
  startSec: number;
  endSec: number;
  assessment?: Assessment;
  /** The job owner's own Gemini credential — mining never uses platform AI. */
  credential: AiCredential;
  /** Who owns this job and which video it is, for the usage history. */
  usage?: { userId: string; videoLabel?: string; videoId?: string; jobId?: string };
}): Promise<ChunkResult> {
  const url = normalizeYoutubeUrl(input.url);
  if (!url || input.endSec <= input.startSec) throw new Error("Invalid YouTube video or time range.");
  const videoId = youtubeId(url);
  // Gemini answers 403 "permission denied" for a video that does not exist,
  // which used to be reported as a rejected key. Check the video first.
  if (videoId) {
    const probe = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
      { signal: AbortSignal.timeout(5000) },
    ).catch(() => null);
    if (probe && (probe.status === 404 || probe.status === 400)) {
      throw new Error("This YouTube video does not exist or was removed. Your Gemini key is fine — replace or remove this video.");
    }
  }
  if (input.usage?.userId && videoId)
    await ensureJobPersona({ userId: input.usage.userId, jobId: input.usage.jobId, videoId, assessment: input.assessment });

  // Subtitle reading is done once by the caller (tryTranscriptMine) before
  // this runs, so it is never repeated per backup key.

  // Video + audio are watched together in one Gemini call. YouTube auto-captions
  // are not used as a clock or wording reference any more (often empty/wrong).
  void videoId;
  const cues: Cue[] = [];
  void buildTimeline;
  void tidyCues;

  const usageMeta = input.usage
    ? {
        userId: input.usage.userId,
        role: "mine",
        subjectKind: "video" as const,
        subjectId: input.usage.videoId ?? url,
        subjectLabel: input.usage.videoLabel ?? url,
        jobId: input.usage.jobId ?? "",
      }
    : undefined;

  let text: string;
  try {
    text = await withGeminiRetry(() => geminiGenerate({
      credential: input.credential,
      model: "gemini-3.1-flash-lite",
      json: true,
      maxTokens: 65536,
      ...(usageMeta ? { usage: usageMeta } : {}),
      turns: [
        {
          role: "user",
          parts: [
            {
              text: `${miningPrompt}${assessmentDirective(input.assessment)}${timelineDirective(timelineForPrompt(cues))}\n\nRequested time range: ${Math.floor(input.startSec)}s to ${Math.ceil(input.endSec)}s.${FINAL_RULES}`,
            },
            youtubeVideoPart(url, input.credential, input.startSec, input.endSec),
          ],
        },
      ],
    }));
  } catch (err) {
    if (err instanceof GeminiHttpError && err.message === "SAFETY_BLOCKED") throw new Error(SAFETY_MESSAGE);
    if (err instanceof GeminiHttpError) throw new Error(gatewayMessage(err.status, err.message));
    throw err;
  }
  if (!text) {
    // Empty answers (often Gemini's RECITATION filter on famous talks) get one
    // more look with more varied wording before the part is reported empty.
    try {
      text = await withGeminiRetry(() => geminiGenerate({
        credential: input.credential,
        model: "gemini-3.1-flash-lite",
        json: true,
        maxTokens: 65536,
        temperature: 1,
        ...(usageMeta ? { usage: usageMeta } : {}),
        turns: [{ role: "user", parts: [
          { text: `${miningPrompt}${assessmentDirective(input.assessment)}\n\nRequested time range: ${Math.floor(input.startSec)}s to ${Math.ceil(input.endSec)}s.${FINAL_RULES}` },
          youtubeVideoPart(url, input.credential, input.startSec, input.endSec),
        ] }],
      }));
    } catch { text = ""; }
  }
  if (!text) throw new Error("AI returned an empty video analysis.");

  let result: ChunkResult;
  try {
    result = normalizeChunkResult(parseLooseJson(text));
  } catch {
    throw new Error("AI returned an unreadable video analysis.");
  }

  // Script guard: Gemini sometimes writes Mongolian speech in Latin letters
  // ("Yag odoo monuu"). When the creator's language is Mongolian and the speech
  // is mostly Latin, the same part is watched once more with the rule first.
  if (mostlyLatinSpeech(result) && (input.assessment?.outputLanguage ?? "").toLowerCase() === "mn") {
    try {
      const again = await withGeminiRetry(() => geminiGenerate({
        credential: input.credential,
        model: "gemini-3.1-flash-lite",
        json: true,
        maxTokens: 65536,
        ...(usageMeta ? { usage: usageMeta } : {}),
        turns: [{ role: "user", parts: [
          { text: `${CYRILLIC_FIRST}\n\n${miningPrompt}${assessmentDirective(input.assessment)}\n\nRequested time range: ${Math.floor(input.startSec)}s to ${Math.ceil(input.endSec)}s.${FINAL_RULES}\n\n${CYRILLIC_FIRST}` },
          youtubeVideoPart(url, input.credential, input.startSec, input.endSec),
        ] }],
      }));
      const fixed = normalizeChunkResult(parseLooseJson(again));
      if (!mostlyLatinSpeech(fixed) && (fixed.journal ?? []).length) result = fixed;
    } catch {
      /* keep the first result */
    }
  }

  // Watching and organizing are separate jobs. Gemini remains responsible for
  // the actual video; the user's Mining — writing up assignment can clean the
  // structured notes with a text engine such as Groq or Mistral.
  if (input.usage) {
    try {
      const { generateRoleText } = await import("@/lib/user-ai.server");
      // The timed record (journal, transcript, subtitles) never goes through the
      // tidy-up pass: "remove repetition" used to delete and translate lines.
      const { journal, transcript, ...notes } = result;
      const written = await generateRoleText({
        userId: input.usage.userId,
        role: "mine_write",
        system: "You organize video-mining JSON. Preserve every timestamp, quote, fact and JSON key. Never translate quotes. Return only valid JSON with exactly the same structure.",
        prompt: JSON.stringify(notes),
        json: true,
        maxTokens: 16384,
        subjectKind: "video",
        subjectId: input.usage.videoId ?? url,
        subjectLabel: input.usage.videoLabel ?? url,
      });
      result = { ...normalizeChunkResult(parseLooseJson(written.text)), journal, transcript, window: result.window } as ChunkResult;
    } catch {
      // The watched result is complete and remains usable when the optional
      // writing engine is unavailable.
    }
  }

  // Step 3 — captions keep the clock, listening decides the words. Where the
  // two disagree the heard wording wins and the caption's version is kept
  // alongside it, so a mis-transcribed caption can no longer poison the Mind.
  if (cues.length) {
    result.transcript = reconcileTranscript(
      cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text, speaker: cue.speaker })),
      result.transcript ?? [],
      result.speakers ?? [],
    );
  }
  // Every spoken line enters the journal verbatim; the AI adds only actions/screen/chat.
  const { journalFromTranscript } = await import("@/lib/journal-build.server");
  // Keep Gemini's own watched journal when it already holds at least as much
  // speech as the subtitle list; otherwise rebuild speech from the subtitles.
  const isSpeech = (k: unknown) => /^(speech|said|say|talk|dialogue)$/i.test(String(k));
  const journalSpeech = (result.journal ?? []).filter((e) => isSpeech(e.kind)).length;
  if (journalSpeech < (result.transcript ?? []).length) result.journal = journalFromTranscript(result);
  result.speakers = nameEverySpeaker(result.speakers ?? []);
  const owner = ownerNameFrom(input.assessment?.speakerIdentity);
  if (owner) lockOwnerName(result, owner);
  await fillSpeechGaps(result, { url, startSec: input.startSec, endSec: input.endSec, credential: input.credential, assessment: input.assessment, owner, usageMeta });
  await ensureScreenCoverage(result, { url, startSec: input.startSec, endSec: input.endSec, credential: input.credential, owner, ...(input.usage ? { usage: input.usage } : {}) });
  return result;
}

/** "H:MM:SS" / "MM:SS" / "373:19" → seconds; null when unusable. */
function stampSec(raw: unknown): number | null {
  const m = String(raw ?? "").trim().match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?/);
  if (!m) return null;
  return m[3] != null ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Gemini sometimes stops writing speech for minutes in the middle of a part
 * (a real test lost 17:07–19:43 of a TED talk). Any silence longer than
 * GAP seconds is watched once more on its own and the missing lines are added.
 * Never removes anything; on any failure the first result stays as it was.
 */
async function fillSpeechGaps(
  result: ChunkResult,
  ctx: { url: string; startSec: number; endSec: number; credential: AiCredential; assessment?: Assessment | undefined; owner: string; usageMeta: Parameters<typeof geminiGenerate>[0]["usage"] },
): Promise<void> {
  const GAP = 75;
  const isSpeech = (k: unknown) => /^(speech|said|say|talk|dialogue)$/i.test(String(k));
  const times = (result.journal ?? []).filter((e) => isSpeech(e.kind)).map((e) => stampSec(e.timestamp)).filter((s): s is number => s != null).sort((a, b) => a - b);
  if (!times.length) return;
  const gaps: [number, number][] = [];
  for (let i = 1; i < times.length; i++) if (times[i]! - times[i - 1]! > GAP) gaps.push([times[i - 1]! + 1, times[i]!]);
  for (const [from, to] of gaps.slice(0, 3)) {
    try {
      const text = await withGeminiRetry(() => geminiGenerate({
        credential: ctx.credential,
        model: "gemini-3.1-flash-lite",
        json: true,
        maxTokens: 32768,
        ...(ctx.usageMeta ? { usage: ctx.usageMeta } : {}),
        turns: [{ role: "user", parts: [
          { text: `${miningPrompt}${assessmentDirective(ctx.assessment)}\n\nRequested time range: ${from}s to ${to}s. Write EVERY spoken sentence in this range as its own speech entry with its whole-video timestamp. Do not summarize or skip any speech.${FINAL_RULES}` },
          youtubeVideoPart(ctx.url, ctx.credential, from, to),
        ] }],
      }));
      if (!text) continue;
      const extra = normalizeChunkResult(parseLooseJson(text));
      if (ctx.owner) lockOwnerName(extra, ctx.owner);
      const inGap = (s: number | null) => s != null && s > from - 1 && s < to;
      let lines = (extra.journal ?? []).filter((e) => isSpeech(e.kind) && inGap(stampSec(e.timestamp)));
      if (!lines.length) {
        // Some answers count time from the start of the requested range.
        const fmt = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
        const shift = <T extends { timestamp: string }>(e: T): T => ({ ...e, timestamp: fmt((stampSec(e.timestamp) ?? -9999) + from) });
        lines = (extra.journal ?? []).filter((e) => isSpeech(e.kind)).map(shift).filter((e) => inGap(stampSec(e.timestamp)));
        extra.transcript = (extra.transcript ?? []).map(shift);
      }
      if (!lines.length) continue;
      result.journal = [...(result.journal ?? []), ...lines].sort((a, b) => (stampSec(a.timestamp) ?? 0) - (stampSec(b.timestamp) ?? 0));
      const tr = (extra.transcript ?? []).filter((l) => inGap(stampSec(l.timestamp)));
      if (tr.length) result.transcript = [...(result.transcript ?? []), ...tr].sort((a, b) => (stampSec(a.timestamp) ?? 0) - (stampSec(b.timestamp) ?? 0));
    } catch {
      /* keep what we have */
    }
  }
}

const CYRILLIC_FIRST = "MOST IMPORTANT RULE: the speaker talks Mongolian. Write every Mongolian spoken sentence in Mongolian CYRILLIC letters (Сайн байна уу, яагаад, боловч). Latin-letter Mongolian (\"Yag odoo\", \"bolovch\") is forbidden. Only genuinely English words stay in English. Every speech entry is a whole sentence, never one or two words.";

/** True when most speech letters are Latin — Mongolian written in the wrong script. */
export function mostlyLatinSpeech(result: ChunkResult): boolean {
  const speech = (result.journal ?? []).filter((e) => /^(speech|said|say|talk|dialogue)$/i.test(String(e.kind))).map((e) => String(e.text)).join(" ");
  const latin = (speech.match(/[A-Za-z]/g) ?? []).length;
  const cyr = (speech.match(/[\u0400-\u04FF]/g) ?? []).length;
  return latin + cyr > 50 && latin > cyr * 1.5;
}

/** "Mind Owner: CTS (the person at…)" -> "CTS". */
export function ownerNameFrom(identity: string | undefined): string {
  const m = /Mind Owner:\s*([^(\n,.]+)/i.exec(identity ?? "");
  return (m?.[1] ?? "").trim();
}

const GENERIC_OWNER = /^(mind owner|host|creator|streamer|owner|speaker|speaker 1|main speaker|narrator)$/i;
const INVENTED_GUEST = /^(caller|guest|speaker|voice|person)\s*\d*$/i;

/**
 * One person at the microphone must stay one person across every part.
 * Generic owner labels always become the persona name; invented "Caller 1" /
 * "Guest 1" labels are folded back only when they are a small slice of the
 * part's speech (a real guest talks far more than a shout or a voice change).
 */
export function lockOwnerName(result: ChunkResult, owner: string): void {
  const isSpeech = (k: unknown) => /^(speech|said|say|talk|dialogue)$/i.test(String(k));
  const journal = result.journal ?? [];
  const transcript = result.transcript ?? [];
  const counts = new Map<string, number>();
  let total = 0;
  for (const e of journal) {
    if (!isSpeech(e.kind)) continue;
    total += 1;
    const who = String(e.who ?? "").trim();
    counts.set(who, (counts.get(who) ?? 0) + 1);
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}]/gu, "");
  const ownerKey = norm(owner);
  const fold = (name: unknown): string | null => {
    let who = String(name ?? "").trim();
    if (!who || who === owner) return null;
    who = who.replace(/^mind owner:\s*/i, "").trim();
    if (GENERIC_OWNER.test(who)) return owner;
    // "Elonmusk1", "CTS Live", "elon musk" → the persona's own name.
    const key = norm(who.replace(/\b(live|stream|official|tv)\b/gi, ""));
    if (ownerKey && key === ownerKey) return owner;
    if (INVENTED_GUEST.test(who) && total > 0 && (counts.get(who) ?? 0) / total < 0.1) return owner;
    return null;
  };
  for (const e of journal) {
    const next = fold(e.who);
    if (next) e.who = next;
  }
  for (const t of transcript as { speaker?: string }[]) {
    const next = fold(t.speaker);
    if (next) t.speaker = next;
  }
  if (result.speakers) {
    const seen = new Set<string>();
    result.speakers = result.speakers
      .map((s) => {
        const next = fold(s.label);
        return next ? { ...s, label: next, role: "primary" as typeof s.role } : s;
      })
      .filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)));
  }
}

/**
 * Visual guard: when the single pass came back with too few screen items for
 * its length (Gemini spends its budget on speech), the screen is watched once
 * more on its own and the typed items are added to the same timeline.
 * Any failure keeps the speech result unchanged.
 */
async function ensureScreenCoverage(
  result: ChunkResult,
  opts: { url: string; startSec: number; endSec: number; credential: AiCredential; owner: string; usage?: { userId: string; videoLabel?: string; videoId?: string; jobId?: string } },
): Promise<void> {
  const minutes = Math.max(1, (opts.endSec - opts.startSec) / 60);
  const have = (result.screenItems ?? []).length;
  if (have >= Math.ceil(minutes)) return;
  try {
    const { mineScreenItems, screenJournal } = await import("@/lib/screen-mine.server");
    const items = await withGeminiRetry(() =>
      mineScreenItems({ url: opts.url, startSec: opts.startSec, endSec: opts.endSec, credential: opts.credential, ownerName: opts.owner, ...(opts.usage ? { usage: opts.usage } : {}) }),
    );
    if (!items.length) return;
    const { stampToSeconds } = await import("@/lib/timeline.server");
    const at = (t: string) => stampToSeconds(t) ?? Number.MAX_SAFE_INTEGER;
    const known = new Set((result.screenItems ?? []).map((i) => `${i.kind}|${i.url ?? ""}|${i.content}`));
    const fresh = items.filter((i) => !known.has(`${i.kind}|${i.url ?? ""}|${i.content}`));
    result.screenItems = [...(result.screenItems ?? []), ...fresh];
    result.journal = [...(result.journal ?? []), ...screenJournal(fresh, opts.owner || "Mind Owner")].sort((a, b) => at(a.timestamp) - at(b.timestamp));
  } catch {
    /* screen extra pass is optional */
  }
}
/**
 * Reads the JSON an engine returned even when it wrapped it in ``` fences, a
 * sentence, or stopped mid-way (a cut-off answer is closed and kept).
 */
export function parseLooseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(t);
  } catch {
    /* rescue below */
  }
  const start = t.search(/[[{]/);
  if (start < 0) throw new Error("no JSON");
  const body = t.slice(start);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (end > 0) {
    try {
      return JSON.parse(body.slice(0, end + 1));
    } catch {
      /* try repairing a cut-off answer */
    }
  }
  // Close a truncated answer: drop the unfinished tail, then close open brackets.
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastSafe = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") stack.pop();
    if (!inStr && (c === "," || c === "}" || c === "]" || c === "{" || c === "[")) lastSafe = i;
  }
  for (let cut = lastSafe; cut > 0; cut--) {
    const head = body.slice(0, cut + 1).replace(/,\s*$/, "");
    const open: string[] = [];
    let s2 = false, e2 = false;
    for (const c of head) {
      if (s2) { if (e2) e2 = false; else if (c === "\\") e2 = true; else if (c === '"') s2 = false; continue; }
      if (c === '"') s2 = true;
      else if (c === "{" || c === "[") open.push(c === "{" ? "}" : "]");
      else if (c === "}" || c === "]") open.pop();
    }
    if (s2) continue;
    try {
      return JSON.parse(head + open.reverse().join(""));
    } catch {
      const prev = Math.max(head.lastIndexOf(",", cut - 1), 0);
      cut = prev + 1;
    }
  }
  throw new Error("unreadable JSON");
}

/** Gemini 503/429 are usually momentary; retry a few times before failing the part. */
async function withGeminiRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      const transient = err instanceof GeminiHttpError && (err.status === 503 || err.status === 429 || err.status === 500);
      if (!transient || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 5000 * attempt + Math.random() * 1500));
    }
  }
}

/**
 * Creator-uploaded video part: the browser already cut it into small JPEG
 * frames and a mono WAV (see src/lib/video-extract.ts). Same prompt, rules and
 * JSON shape as YouTube parts, so the rest of the mining path is unchanged.
 */
export async function analyzeUploadedPart(input: {
  startSec: number;
  endSec: number;
  frames: { t: number; jpeg: string }[];
  audioWav: string | null;
  assessment?: Assessment;
  credential: AiCredential;
  usage?: { userId: string; videoLabel?: string; videoId?: string; jobId?: string };
}): Promise<ChunkResult> {
  if (input.endSec <= input.startSec) throw new Error("Invalid time range.");
  if (!input.frames.length && !input.audioWav) throw new Error("This part has no picture or sound.");
  const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const parts: GeminiPart[] = [
    {
      text: `${miningPrompt}${assessmentDirective(input.assessment)}\n\nRequested time range: ${Math.floor(input.startSec)}s to ${Math.ceil(input.endSec)}s.\nYou receive the sound of this range as one audio clip that STARTS at video time ${mmss(input.startSec)} (add that offset to every heard moment), plus still frames, each labelled with its exact video time.${FINAL_RULES}`,
    },
  ];
  if (input.audioWav) parts.push({ inline_data: { mime_type: "audio/wav", data: input.audioWav } });
  for (const f of input.frames.slice(0, 40)) {
    parts.push({ text: `Frame at ${mmss(f.t)}:` });
    parts.push({ inline_data: { mime_type: "image/jpeg", data: f.jpeg } });
  }
  const usageMeta = input.usage
    ? { userId: input.usage.userId, role: "mine", subjectKind: "video" as const, subjectId: input.usage.videoId ?? "upload", subjectLabel: input.usage.videoLabel ?? "Uploaded video", jobId: input.usage.jobId ?? "" }
    : undefined;
  let text: string;
  try {
    text = await withGeminiRetry(() => geminiGenerate({
      credential: input.credential,
      model: "gemini-3.1-flash-lite",
      json: true,
      maxTokens: 65536,
      ...(usageMeta ? { usage: usageMeta } : {}),
      turns: [{ role: "user", parts }],
    }));
  } catch (err) {
    if (err instanceof GeminiHttpError && err.message === "SAFETY_BLOCKED") throw new Error(SAFETY_MESSAGE);
    if (err instanceof GeminiHttpError) throw new Error(gatewayMessage(err.status, err.message));
    throw err;
  }
  if (!text) throw new Error("AI returned an empty video analysis.");
  let result: ChunkResult;
  try {
    result = normalizeChunkResult(parseLooseJson(text));
  } catch {
    throw new Error("AI returned an unreadable video analysis.");
  }
  result.speakers = nameEverySpeaker(result.speakers ?? []);
  const owner = ownerNameFrom(input.assessment?.speakerIdentity);
  if (owner) lockOwnerName(result, owner);
  return result;
}
