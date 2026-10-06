/**
 * Fast transcript mining — for talking videos.
 *
 * A podcast, interview or lecture carries all of its value in the words. YouTube
 * already holds those words with millisecond timing, so instead of paying a
 * video model to watch two hours of two people sitting still, we read the
 * captions and hand them to whichever text engine the creator assigned to
 * "Mining — writing up" (Groq, Mistral, OpenRouter, Gemini — any of them).
 *
 * Captions do not say WHO is speaking. That is answered here in a separate,
 * cheap pass: the lines are labelled by voice, and the creator's "main person"
 * answer decides which of those voices actually owns the Mind. Guests stay in
 * the Mind as knowledge, never as identity.
 */
import {
  normalizeChunkResult,
  speakerIdentityDirective,
  type ChunkResult,
  type SpeakerRole,
} from "@/lib/gemini";
import { fetchCaptionCues } from "@/lib/youtube-captions.server";
import { describeSpeakerLabel } from "@/lib/transcript-reconcile";
import { secondsToStamp, tidyCues, type Cue } from "@/lib/timeline.server";
import { generateRoleText } from "@/lib/user-ai.server";
import type { Assessment } from "@/lib/youtube-mine.server";

/** Lines handed to the engine in one call — keeps every request well inside a free tier. */
const DIARIZE_BATCH = 120;

export type TranscriptMineUsage = {
  userId: string;
  videoLabel?: string;
  videoId?: string;
  jobId?: string;
};

function numbered(cues: Cue[], from: number): string {
  return cues
    .map((cue, i) => `#${from + i + 1} [${secondsToStamp(cue.start)}] ${cue.text.slice(0, 400)}`)
    .join("\n");
}

function parseJson<T>(text: string): T | null {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Some engines wrap the answer in a sentence; rescue the first JSON block.
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf("]"), trimmed.lastIndexOf("}"));
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
}

type DiarizeReply = {
  speakers?: { label?: string; role?: string; description?: string }[];
  lines?: { n?: number; speaker?: string }[];
};

/**
 * Works out how many people are talking and which line belongs to whom, using
 * nothing but the words: turn-taking, questions vs answers, names people call
 * each other, and the intro ("today I'm joined by…").
 */
async function diarize(
  cues: Cue[],
  assessment: Assessment | undefined,
  usage: TranscriptMineUsage,
): Promise<{ speakers: DiarizeReply["speakers"]; labels: Map<number, string> }> {
  const labels = new Map<number, string>();
  const speakers = new Map<string, { label: string; role: string; description: string }>();
  const known = (assessment?.speakerIdentity ?? "").trim();

  for (let offset = 0; offset < cues.length; offset += DIARIZE_BATCH) {
    const slice = cues.slice(offset, offset + DIARIZE_BATCH);
    const carried = [...speakers.keys()].join(", ");
    const system =
      "You split a transcript into speakers. You answer with JSON only, never with commentary.";
    const prompt = `These are the spoken lines of one video, in order, with their real timestamps.

${numbered(slice, offset)}

${known ? `The creator says the people in this video are: ${known}. Use exactly these names.` : "Nobody named the participants. Use stable labels such as \"Host\", \"Guest 1\", \"Guest 2\"."}
${carried ? `Speakers already identified earlier in this same video: ${carried}. Reuse those labels for the same voices.` : ""}

Decide who says each line. Use turn-taking (a question then an answer is two different people), names people call each other, introductions, and self-references. When two lines clearly continue one thought, they belong to the same person.

Name EVERY person you find. Prefer a real name whenever the words support one (someone is introduced, addressed, thanked or names themselves) and write it exactly as spoken. When no name exists, give a stable descriptive label for what that person does here — "Host", "Guest 1", "Guest 2", "Support role 1", "Caller 1", "Background voice 1" — numbered in the order they first speak, and never renumber them later. Use "unknown" only for a voice you genuinely cannot separate from another, never merely because the name is missing.

Return JSON only:
{"speakers":[{"label":"...","role":"primary|secondary|unknown","description":"one short sentence"}],
 "lines":[{"n":${offset + 1},"speaker":"..."}]}

Rules:
- Exactly one line entry per numbered line above, same numbers, nothing skipped.
- "primary" is the person whose Mind is being built: the host or channel owner${known ? " named first by the creator" : ""}. Everyone else is "secondary".
- Never invent a name that is not supported by the words or by the creator's list.`;

    try {
      const reply = await generateRoleText({
        userId: usage.userId,
        role: "mine_write",
        system,
        prompt,
        json: true,
        maxTokens: 8192,
        subjectKind: "video",
        ...(usage.videoId ? { subjectId: usage.videoId } : {}),
        subjectLabel: usage.videoLabel ?? "Transcript mining",
      });
      const parsed = parseJson<DiarizeReply>(reply.text);
      for (const s of parsed?.speakers ?? []) {
        const label = String(s?.label ?? "").trim();
        if (!label) continue;
        if (!speakers.has(label))
          speakers.set(label, {
            label,
            role: ["primary", "secondary", "unknown"].includes(String(s?.role)) ? String(s?.role) : "unknown",
            description: String(s?.description ?? "").trim(),
          });
      }
      for (const l of parsed?.lines ?? []) {
        const n = Number(l?.n);
        const who = String(l?.speaker ?? "").trim();
        if (Number.isFinite(n) && who) labels.set(n - 1, who);
      }
    } catch {
      // A batch the engine could not label keeps its neutral "Speaker" label;
      // the rest of the video is still mined.
    }
  }

  // Exactly one primary owner, always. A talking video with no clear host still
  // has a dominant voice, and that voice owns the Mind.
  const list = [...speakers.values()];
  if (list.length && !list.some((s) => s.role === "primary")) {
    const count = new Map<string, number>();
    for (const who of labels.values()) count.set(who, (count.get(who) ?? 0) + 1);
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const owner = list.find((s) => s.label === top) ?? list[0]!;
    owner.role = "primary";
  }
  return { speakers: list, labels };
}

const EXTRACT_SYSTEM =
  "You build a digital twin's knowledge from a transcript. You answer with valid JSON only, never with commentary.";

function extractPrompt(cues: Cue[], assessment: Assessment | undefined, speakerNote: string): string {
  const lines = cues
    .map((c) => `[${secondsToStamp(c.start)} - ${secondsToStamp(c.end)}] ${c.speaker}: ${c.text.slice(0, 400)}`)
    .join("\n");
  const focus = [
    assessment?.videoContext ? `Video type: ${assessment.videoContext}.` : "",
    assessment?.primaryFocus ? `What matters most: ${assessment.primaryFocus}.` : "",
    assessment?.customInstructions ? `Creator instructions: ${assessment.customInstructions}` : "",
    assessment?.sourceTitle ? `Video title: ${assessment.sourceTitle}` : "",
    assessment?.sourceChannel ? `Channel: ${assessment.sourceChannel}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `This is the complete, speaker-labelled transcript of a talking video. Build the Mind from it.

${focus ? `${focus}\n\n` : ""}${speakerNote}TRANSCRIPT (the timestamps are measured — copy them, never change or invent one)
${lines}

Return JSON only with these keys:
- "speakers": [{"label","role":"primary|secondary|unknown","description"}] — the people above.
- "story": {"summary","tone","beats":[{"timestamp","event","emotion"}]} — what happens, in order.
- "knowledge": short strings, one per fact worth remembering.
- "subconsciousness": {"skills","beliefs","decisionLogic","culturalVocabulary","expressiveStyle","aestheticProfile"} — ONLY the primary speaker. Every culturalVocabulary item needs phrase, timestamp, kind, literal, meaning, intent, sentiment and usage.
  "expressiveStyle" must capture how they SOUND in conversation: humour and sarcasm, what makes them laugh, how they tease the other person, typical sentence length, filler words and verbal tics, how they open and close a topic, how they react when surprised or when they disagree. Short imitable statements.
- "knowledgeNodes": [{"timestamp_start","timestamp_end","concept_title","detailed_explanation","spatial_action":null,"confidence_score"}] — one per distinct idea, claim, story or piece of advice. confidence_score below 0.8 whenever you are guessing, because those are discarded.
- "qaPairs": [{"timestamp","asker","question","answerer","answer"}] — every real question and its answer; asker/answerer use the speaker labels above; answer is a faithful self-contained summary in the original language.
- "entities": [{"name","type","description","timestamps":[],"relations":[{"target","relation"}]}] — every named person, organization, place, product, work, event or key concept mentioned; type is person|organization|place|product|concept|event|work|other; relations link to other entities in the list.

Rules:
- Every timestamp must be copied from a line above.
- Keep the original spoken language for quotes and for culturalVocabulary "phrase"; write explanations in English.
- This is audio only: say nothing about faces, gestures, lighting or what the screen shows.
- Never invent anything that was not said.`;
}

/**
 * Mines one time range of a talking video from its YouTube captions.
 * Returns null when the video has no usable captions, so the caller can fall
 * back to watching the video with Gemini.
 */
export async function analyzeTranscript(input: {
  videoId: string;
  startSec: number;
  endSec: number;
  assessment?: Assessment;
  usage: TranscriptMineUsage;
}): Promise<{ result: ChunkResult; cues: Cue[] } | null> {
  const { cues: raw } = await fetchCaptionCues(input.videoId, input.startSec, input.endSec, input.usage.userId);
  const cues = tidyCues(raw);
  if (cues.length < 3) return null;

  const { speakers, labels } = await diarize(cues, input.assessment, input.usage);
  const roleOf = new Map<string, SpeakerRole>(
    (speakers ?? []).map((s) => {
      const role = s.role === "primary" || s.role === "secondary" ? s.role : "unknown";
      return [String(s.label).toLowerCase().trim(), role satisfies SpeakerRole];
    }),
  );
  const labelled: Cue[] = cues.map((cue, i) => ({ ...cue, speaker: labels.get(i) ?? cue.speaker }));

  const owner = (speakers ?? []).find((s) => s.role === "primary")?.label ?? "";
  const speakerNote = `${
    owner
      ? `The Mind belongs to ${owner}. Everything in "subconsciousness" must come from ${owner} alone; what anyone else says is knowledge, not identity.\n`
      : ""
  }${speakerIdentityDirective(input.assessment?.speakerIdentity).trim()}\n\n`;

  const reply = await generateRoleText({
    userId: input.usage.userId,
    role: "mine_write",
    system: EXTRACT_SYSTEM,
    prompt: extractPrompt(labelled, input.assessment, speakerNote),
    json: true,
    maxTokens: 16384,
    subjectKind: "video",
    ...(input.usage.videoId ? { subjectId: input.usage.videoId } : {}),
    subjectLabel: input.usage.videoLabel ?? "Transcript mining",
  });
  const parsed = parseJson<Record<string, unknown>>(reply.text);
  if (!parsed) return null;

  const result = normalizeChunkResult({
    ...parsed,
    speakers: (parsed['speakers'] as unknown[] | undefined)?.length ? parsed['speakers'] : speakers,
  });

  // Caption-only mining: nobody listened to the audio here, so every line is
  // marked "caption" — the Mind knows this wording was never double-checked.
  result.transcript = labelled.map((cue) => ({
    timestamp: `${secondsToStamp(cue.start)} - ${secondsToStamp(cue.end)}`,
    speech: cue.text,
    speaker: cue.speaker,
    role: roleOf.get(cue.speaker.toLowerCase().trim()) ?? "unknown",
    source: "caption" as const,
  }));
  // Caption mining still yields the timed journal: every speaker-labelled line
  // becomes a "said" moment, so search/chat work the same as video mining.
  if (!result.journal?.length) {
    result.journal = labelled.map((cue) => ({
      timestamp: secondsToStamp(cue.start),
      who: cue.speaker,
      kind: "said",
      text: cue.text,
    }));
  }
  // No participant leaves the video nameless.
  let secondary = 0;
  let other = 0;
  result.speakers = (result.speakers ?? []).map((s) => {
    const index = s.role === "secondary" ? secondary++ : other++;
    return { ...s, label: describeSpeakerLabel(s.label, s.role, index) };
  });
  return { result, cues: labelled };
}
