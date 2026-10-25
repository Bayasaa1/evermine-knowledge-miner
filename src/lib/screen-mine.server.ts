/**
 * Screen pass — runs after the caption pass for the same part.
 *
 * Captions carry the words; they never see what is on screen. This pass asks
 * Gemini (creator's own key) to look at the frames only and record each
 * on-screen item as its own typed record (link, code, formula, lesson step,
 * text, chat, image, ui) together with what the creator did with it.
 * It never touches speech, subtitles or times of spoken lines, and a failure
 * here never fails the part — the caption result is saved either way.
 */
import type { JournalEntry, ScreenItem } from "@/lib/gemini";
import { normalizeScreenItems } from "@/lib/gemini";
import { geminiGenerate, youtubeVideoPart, type AiCredential } from "@/lib/user-ai.server";
import { MOVEMENT_DRILL_PREFIX, MovementSkillDrillSchema } from "@/lib/embodied";

const SCREEN_PROMPT = (owner: string) => `Look ONLY at what is visible on screen in the requested time range. Ignore the spoken words (they are already recorded).
Return JSON: {"items":[...]} — one item per distinct thing shown. Never merge different things into one sentence.
Each item:
- "timestamp": HH:MM:SS (whole-video time) when it first appears.
- "kind": exactly one of link | code | formula | lesson | text | chat | image | ui.
  link = URL/website/domain shown; code = source code or terminal command; formula = math/science formula; lesson = a teaching slide or step list; text = other readable text (titles, notes, signs); chat = live chat / comments shown on screen; image = a picture/diagram/chart; ui = an app or website being used.
- "title": short name of the item (e.g. "GitHub repo page", "Quadratic formula").
- "content": VERBATIM — the exact URL, exact code with line breaks, formula as written (LaTeX if possible), exact text. For image: describe what it shows. For chat: "username: message" lines.
- "url": the full URL when one is visible, else "".
- "language": programming language for code, else "".
- "steps": ordered list for a lesson/step list, else [].
- "interaction": what ${owner || "the creator"} DID with it — opened, clicked, read aloud, typed, pointed at, explained, scrolled, copied, reacted to. "" if nothing.
- "embodied": ONLY when ${owner || "the creator"} visibly performs a physical/procedural step (picks up, places, pours, cuts, presses, opens, tightens, clicks...), add {"precondition":"state before","action_primitive":"one verb e.g. grasp|place|pour|push|pull|rotate|cut|press|open|close|click|type","target_object":"the object acted on","postcondition":"visible state after","hazard_or_recovery":"what can go wrong and how to recover, or \\"\\""}. Omit the field otherwise. Use only what is visible.
- "movement_drills": for the creator's physical skills (cooking, sports/fitness, crafts, art), record each observed phase separately at its actual timestamp: [{"skill_name":"specific technique","phase":"prep|execution|follow_through","body_or_hand_mechanics":"visible posture, grip, alignment and angles","tempo_and_rhythm":"observed pacing and rhythm or empty","sensory_cue":"visible cue to look for; felt cue only if explicitly shown in readable instructions, else empty","common_mistake_to_avoid":"visible error or explicitly shown technique warning, else empty"}]. Use [] for non-physical activity. Do not assign played-media people's skills to the creator. Never invent joint angles, forces, internal sensations, optimal technique, or medical claims. Separate setup, execution and follow-through only when actually visible; do not fill missing phases. Include a titled image/lesson item even when there is no readable screen text so physical demonstrations are not lost.
Games and streams count too: record every item/skin/weapon name, case name, price, balance, donation (name + amount + message), alert, error window and website exactly as shown, at least 2 items per minute when anything is visible.
Skip platform watermarks, burned-in subtitles and anything you cannot actually read. Never invent text. Empty list for footage with nothing on screen.`;

export async function mineScreenItems(input: {
  url: string;
  startSec: number;
  endSec: number;
  credential: AiCredential;
  ownerName?: string;
  usage?: { userId: string; videoLabel?: string; videoId?: string; jobId?: string };
}): Promise<ScreenItem[]> {
  const text = await geminiGenerate({
    credential: input.credential,
    model: "gemini-3.1-flash-lite",
    json: true,
    maxTokens: 16384,
    ...(input.usage
      ? {
          usage: {
            userId: input.usage.userId,
            role: "mine",
            subjectKind: "video" as const,
            subjectId: input.usage.videoId ?? input.url,
            subjectLabel: `${input.usage.videoLabel ?? input.url} (screen)`,
            jobId: input.usage.jobId ?? "",
          },
        }
      : {}),
    turns: [
      {
        role: "user",
        parts: [
          { text: `${SCREEN_PROMPT(input.ownerName ?? "")}\n\nRequested time range: ${Math.floor(input.startSec)}s to ${Math.ceil(input.endSec)}s.` },
          youtubeVideoPart(input.url, input.credential, input.startSec, input.endSec),
        ],
      },
    ],
  });
  if (!text?.trim()) return [];
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  const raw = Array.isArray(parsed) ? parsed : (parsed as { items?: unknown })?.items;
  // Existing steps storage preserves structured drills through later normalization.
  const items = Array.isArray(raw) ? raw.map((value) => {
    if (!value || typeof value !== "object") return value;
    const item = value as Record<string, unknown>;
    const drills = Array.isArray(item["movement_drills"]) ? item["movement_drills"].slice(0, 24) : [];
    const encoded = drills.flatMap((value) => {
      const drill = MovementSkillDrillSchema.safeParse(value);
      return drill.success ? [MOVEMENT_DRILL_PREFIX + JSON.stringify(drill.data)] : [];
    });
    return { ...item, steps: [...(Array.isArray(item["steps"]) ? item["steps"] : []), ...encoded] };
  }) : raw;
  return normalizeScreenItems(items);
}

/** Each screen item becomes its own journal moment, plus a separate action moment for the interaction. */
export function screenJournal(items: ScreenItem[], owner: string): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const it of items) {
    const head = `[${it.kind}] ${it.title}`.trim();
    const body = it.url && !it.content.includes(it.url) ? `${it.content}\n${it.url}` : it.content;
    out.push({ timestamp: it.timestamp, who: "Screen", kind: "screen", text: body ? `${head}\n${body}` : head });
    if (it.interaction) {
      out.push({ timestamp: it.timestamp, who: owner || "Owner", kind: "action", text: `${it.interaction} → ${it.title}` });
    }
  }
  return out;
}
