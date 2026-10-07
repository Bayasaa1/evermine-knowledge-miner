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
