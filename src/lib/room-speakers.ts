import type { RoomMind } from "./chat-rooms";
import { squadOrder } from "./web-build";

/** Ordinary messages obey room rules; only the explicit squad action starts a relay. */
export function selectRoomSpeakers(body: string, minds: RoomMind[], mode: string, limit: number, forceBuild = false) {
  const build = forceBuild && minds.length > 1;
  return { build, speakers: build ? squadOrder(minds) : pickSpeakers(body, minds, mode, limit) };
}

/** Which Minds should speak for this message, in order. */
export function pickSpeakers(body: string, minds: RoomMind[], mode: string, limit: number): RoomMind[] {
  const lower = body.toLowerCase();
  const mentioned = minds.filter((m) => lower.includes(`@${m.mind_name.toLowerCase()}`) || lower.includes(`@${m.mind_id.toLowerCase()}`));
  if (mentioned.length) return mentioned.slice(0, limit);
  const panel = minds.filter((m) => m.role !== "judge");
  const judge = minds.find((m) => m.role === "judge");
  if (mode === "round") return [...panel.slice(0, Math.max(1, limit - (judge ? 1 : 0))), ...(judge ? [judge] : [])].slice(0, limit);
  if (mode === "relevance") {
    const words = new Set(lower.split(/\W+/).filter((w) => w.length > 3));
    const score = (m: RoomMind) => m.mind_name.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length;
    const best = [...panel].sort((a, b) => score(b) - score(a))[0];
    return best ? [best] : [];
  }
  return []; // mention mode: Minds speak only when called
}