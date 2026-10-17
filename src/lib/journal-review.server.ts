/**
 * Background proof-reading of finished videos. The AI reads the saved journal
 * (subtitle) lines and only FLAGS suspicious words or sentences into a private
 * mind_vaults row (kind "review", title "review:<contentId>"). The transcript
 * itself is never changed — a later, stronger AI can use the open flags to
 * polish only those lines.
 */
import { generateRoleText } from "@/lib/user-ai.server";

export type ReviewFlag = {
  /** Line index in project_content.transcript at review time. */
  i: number;
  timestamp: string;
  text: string;
  kind: "typo" | "meaning" | "unclear";
  word?: string;
  suggestion?: string;
  note?: string;
  status: "open" | "fixed";
};

export type JournalReview = {
  contentId: string;
  total: number;
  reviewed: number;
  flags: ReviewFlag[];
  done: boolean;
  updatedAt: string;
};

const BATCH = 60;
const BATCHES_PER_RUN = 2;
const VIDEOS_PER_RUN = 3;

type Line = { timestamp?: string | null; speech?: string | null; speaker?: string | null };

function parseFlags(raw: string, batch: { i: number; line: Line }[]): ReviewFlag[] {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return [];
  let data: { flags?: unknown };
  try { data = JSON.parse(m[0]); } catch { return []; }
  const byIndex = new Map(batch.map((b) => [b.i, b.line]));
  const out: ReviewFlag[] = [];
  for (const f of Array.isArray(data.flags) ? data.flags : []) {
    const o = f as Record<string, unknown>;
    const i = Number(o["i"]);
    const line = byIndex.get(i);
    if (!line) continue;
    const kind = o["kind"] === "typo" || o["kind"] === "meaning" ? o["kind"] : "unclear";
    const word = typeof o["word"] === "string" ? o["word"].slice(0, 80) : undefined;
    // A typo must point at a word that is really in the line.
    if (kind === "typo" && word && !String(line.speech ?? "").includes(word)) continue;
    out.push({
      i,
      timestamp: String(line.timestamp ?? ""),
      text: String(line.speech ?? ""),
      kind,
      ...(word ? { word } : {}),
      ...(typeof o["suggestion"] === "string" ? { suggestion: o["suggestion"].slice(0, 200) } : {}),
      ...(typeof o["note"] === "string" ? { note: o["note"].slice(0, 200) } : {}),
      status: "open",
    });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function reviewFinishedJournals(admin: any, deadline: number): Promise<number> {
  const { data: rows } = await admin
    .from("project_content")
    .select("id, user_id, title, transcript")
    .order("updated_at", { ascending: true })
    .limit(200);
  let reviewedBatches = 0;
  let videos = 0;
  for (const row of rows ?? []) {
    if (videos >= VIDEOS_PER_RUN || reviewedBatches >= BATCHES_PER_RUN * VIDEOS_PER_RUN || Date.now() > deadline) break;
    const lines = (Array.isArray(row.transcript) ? row.transcript : []) as Line[];
    if (!lines.length) continue;
    const title = `review:${row.id}`;
    const { data: existing } = await admin
      .from("mind_vaults").select("id, payload")
      .eq("user_id", row.user_id).eq("kind", "review").eq("title", title).maybeSingle();
    const prev = (existing?.payload ?? null) as JournalReview | null;
    if (prev?.done && prev.total === lines.length) continue;
    // A rebuilt transcript (different length) is reviewed again from the start.
    const review: JournalReview = prev && prev.total === lines.length
      ? prev
      : { contentId: row.id, total: lines.length, reviewed: 0, flags: [], done: false, updatedAt: "" };
    videos += 1;

    for (let b = 0; b < BATCHES_PER_RUN && review.reviewed < lines.length && Date.now() < deadline; b++) {
      const batch = lines.slice(review.reviewed, review.reviewed + BATCH).map((line, k) => ({ i: review.reviewed + k, line }));
      const listing = batch.map((x) => `${x.i}\t${x.line.timestamp ?? ""}\t${x.line.speaker ?? ""}: ${x.line.speech ?? ""}`).join("\n");
      try {
        const { text } = await generateRoleText({
          userId: row.user_id,
          role: "mine_write",
          json: true,
          maxTokens: 2000,
          subjectKind: "video",
          subjectId: row.id,
          subjectLabel: `Journal check · ${row.title}`,
          system:
            "You proof-read speech transcripts made by an AI from a video. Do NOT rewrite anything. Only point out lines that look wrong: " +
            "'typo' = a misspelled or mis-heard word (give the exact word as written and a suggestion); " +
            "'meaning' = the sentence makes no sense or contradicts itself, likely mis-heard; " +
            "'unclear' = cut off or garbled. Keep the line's language. Names, slang and spoken style are NOT errors. " +
            'Reply JSON only: {"flags":[{"i":number,"kind":"typo|meaning|unclear","word":string?,"suggestion":string?,"note":string}]}. Empty list if all fine.',
          prompt: `Lines (index, time, speaker: text):\n${listing}`,
        });
        review.flags.push(...parseFlags(text, batch));
        review.reviewed += batch.length;
        reviewedBatches += 1;
      } catch {
        // No key / quota: try again on a later run, nothing changes.
        break;
      }
    }
    review.done = review.reviewed >= lines.length;
    review.updatedAt = new Date().toISOString();
    if (existing?.id) await admin.from("mind_vaults").update({ payload: review }).eq("id", existing.id);
    else await admin.from("mind_vaults").insert({ user_id: row.user_id, kind: "review", title, payload: review });
  }
  return reviewedBatches;
}
