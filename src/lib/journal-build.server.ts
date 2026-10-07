/**
 * The journal's spoken lines come from the measured caption timeline, 1:1 and
 * verbatim, so no stretch of speech can be skipped, summarised or translated.
 * The AI only adds what captions cannot see: actions, on-screen text, chat,
 * donations and events.
 */
import type { ChunkResult, JournalEntry } from "@/lib/gemini";
import { secondsToStamp, stampToSeconds } from "@/lib/timeline.server";

type Line = { start: number; text: string; speaker?: string };

const SPEECH = new Set(["speech", "said", "say", "talk", "dialogue"]);

export function buildJournal(lines: Line[], aiJournal: JournalEntry[] | undefined): JournalEntry[] {
  const spoken: JournalEntry[] = lines
    .filter((l) => l.text.trim())
    .map((l) => ({
      timestamp: secondsToStamp(l.start),
      who: l.speaker?.trim() || "Speaker",
      kind: "speech",
      text: l.text.trim(),
    }));
  if (!spoken.length) return aiJournal ?? [];
  const extras = (aiJournal ?? []).filter((e) => !SPEECH.has(String(e.kind).toLowerCase()));
  const at = (e: JournalEntry) => stampToSeconds(e.timestamp) ?? Number.MAX_SAFE_INTEGER;
  return [...spoken, ...extras]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => at(a.e) - at(b.e) || a.i - b.i)
    .map(({ e }) => e);
}

/** Rebuilds a result's journal from its own transcript (speaker-labelled, original words). */
export function journalFromTranscript(result: ChunkResult): JournalEntry[] {
  const lines: Line[] = (result.transcript ?? []).flatMap((t) => {
    const start = stampToSeconds(String(t.timestamp ?? "").split(" - ")[0]);
    return start == null ? [] : [{ start, text: String(t.speech ?? ""), speaker: t.speaker }];
  });
  return buildJournal(lines, result.journal);
}

/**
 * Step 1 after mining: subtitles are read straight out of the journal's speech
 * lines — no AI, so they always match the journal second for second.
 */
export function subtitlesFromJournal(
  journal: JournalEntry[] | undefined,
  previous: ChunkResult["transcript"] | undefined,
  ownerName: string,
): ChunkResult["transcript"] {
  const speech = (journal ?? []).filter((e) => SPEECH.has(String(e.kind).toLowerCase()) && e.text?.trim());
  if (!speech.length) return previous ?? [];
  const roleOf = new Map((previous ?? []).map((t) => [t.speaker, t.role]));
  return speech.map((e) => ({
    timestamp: e.timestamp,
    speech: e.text.trim(),
    speaker: e.who,
    role: isOwner(e.who, ownerName) ? "primary" : roleOf.get(e.who) ?? "secondary",
  }));
}

function isOwner(who: string, ownerName: string): boolean {
  const w = who.trim().toLowerCase();
  const o = ownerName.trim().toLowerCase();
  if (!w || /^(video|guest|chat|donation)\b|^зочин/i.test(w)) return false;
  return !!o && (w === o || w.includes(o) || o.includes(w));
}

export type OwnerBrain = {
  owner: string;
  said: { timestamp: string; text: string }[];
  did: { timestamp: string; kind: string; text: string }[];
};

/**
 * Step 2 after mining: the Core Brain only ever receives the creator's own
 * words and actions, in order. Played media, guests and chat stay out.
 */
export function ownerBrainFromJournal(journal: JournalEntry[] | undefined, ownerName: string): OwnerBrain {
  const said: OwnerBrain["said"] = [];
  const did: OwnerBrain["did"] = [];
  for (const e of journal ?? []) {
    if (!e.text?.trim() || !isOwner(e.who, ownerName)) continue;
    if (SPEECH.has(String(e.kind).toLowerCase())) said.push({ timestamp: e.timestamp, text: e.text.trim() });
    else did.push({ timestamp: e.timestamp, kind: e.kind, text: e.text.trim() });
  }
  return { owner: ownerName, said, did };
}
