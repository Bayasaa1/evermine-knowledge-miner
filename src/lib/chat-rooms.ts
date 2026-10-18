/**
 * Social chat rooms: people + Minds in one room.
 *
 * Privacy: every read and write runs as the signed-in user through the
 * browser client, so the database's member-only rules decide what is visible.
 * Mind replies are generated with the *sender's* own AI keys via
 * /api/mind-chat — no member ever spends another member's credentials.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ShareContent } from "@/lib/share-content";
import { apiFetch } from "@/lib/api-fetch";
import { currentOwnerId, NOT_SIGNED_IN } from "@/lib/owner";
import { findMind, MINDS } from "@/lib/minds";
import { listPublicVisualContentLight } from "@/lib/projects";

export type MindRole = "debater" | "judge" | "admin" | "twin";
export type DebateMode = "mention" | "round" | "relevance";

export type Room = {
  id: string;
  owner_id: string;
  title: string;
  kind: string;
  invite_code: string;
  invite_enabled: boolean;
  debate_mode: string;
  turn_limit: number;
  updated_at: string;
  moderator_mode: boolean;
  avatar_path: string | null;
  active_mind_id: string | null;
  turn_started_at: string | null;
};
export type RoomMember = { id: string; user_id: string; display_name: string; role: string; last_read_at: string };
export type RoomMind = { id: string; mind_id: string; mind_name: string; role: string; sort: number };
export type RoomMessage = {
  id: string;
  room_id: string;
  sender_user_id: string;
  sender_kind: string;
  mind_id: string | null;
  author_name: string;
  body: string;
  shared_url: string | null;
  created_at: string;
  moderator_pending: boolean;
  reply_to_id: string | null;
  attachment: RoomAttachment | null;
};

export type RoomAttachment = { kind: "image" | "video"; path: string; name: string } | { kind: "mind"; mindId: string; name: string; share?: ShareContent };

/** Room transcripts have no clip player; keep proof metadata out of prose. */
function stripProofMarkers(text: string): string {
  return text.replace(/\[\[(?:clip|yt):[^\]]+\]\]/g, "").trim();
}

function cleanRoomMessage(message: RoomMessage): RoomMessage {
  return message.sender_kind === "mind"
    ? { ...message, body: stripProofMarkers(message.body) }
    : message;
}

async function me(): Promise<string> {
  const id = await currentOwnerId();
  if (!id) throw new Error(NOT_SIGNED_IN);
  return id;
}

export async function listMyRooms(): Promise<(Room & { unread: boolean })[]> {
  const uid = await me();
  const { data: mems } = await supabase.from("chat_room_members").select("room_id,last_read_at").eq("user_id", uid);
  const ids = (mems ?? []).map((m) => m.room_id);
  if (!ids.length) return [];
  const { data, error } = await supabase.from("chat_rooms").select("*").in("id", ids).order("updated_at", { ascending: false });
  if (error) throw error;
  const read = new Map((mems ?? []).map((m) => [m.room_id, m.last_read_at]));
  const { data: recent } = await supabase
    .from("chat_room_messages")
    .select("room_id,created_at,sender_user_id")
    .in("room_id", ids)
    .neq("sender_user_id", uid)
    .order("created_at", { ascending: false })
    .limit(300);
  const latest = new Map<string, string>();
  for (const m of recent ?? []) if (!latest.has(m.room_id)) latest.set(m.room_id, m.created_at);
  return (data ?? []).map((r) => ({ ...(r as Room), unread: (read.get(r.id) ?? "") < (latest.get(r.id) ?? "") }));
}

export async function createRoom(title: string, displayName: string): Promise<string> {
  const uid = await me();
  const { data, error } = await supabase
    .from("chat_rooms")
    .insert({ owner_id: uid, title: title.trim().slice(0, 80) || "Group" })
    .select("id")
    .single();
  if (error) throw error;
  const { error: mErr } = await supabase
    .from("chat_room_members")
    .insert({ room_id: data.id, user_id: uid, role: "owner", display_name: displayName.slice(0, 60) });
  if (mErr) throw mErr;
  return data.id;
}

export async function deleteRoom(roomId: string): Promise<void> {
  const uid = await me();
  const { error } = await supabase.from("chat_rooms").delete().eq("id", roomId).eq("owner_id", uid);
  if (error) throw error;
}

export async function updateRoom(roomId: string, patch: Partial<Pick<Room, "title" | "debate_mode" | "turn_limit" | "invite_enabled" | "moderator_mode" | "avatar_path">>) {
  await me();
  const { error } = await supabase.from("chat_rooms").update(patch).eq("id", roomId);
  if (error) throw error;
}

export async function joinByCode(code: string, displayName: string): Promise<string> {
  await me();
  const { data, error } = await supabase.rpc("join_room_by_code", { _code: code.trim(), _name: displayName });
  if (error) throw error;
  return data as string;
}

export async function loadRoom(roomId: string) {
  const [room, members, minds, messages] = await Promise.all([
    supabase.from("chat_rooms").select("*").eq("id", roomId).maybeSingle(),
    supabase.from("chat_room_members").select("id,user_id,display_name,role,last_read_at").eq("room_id", roomId),
    supabase.from("chat_room_minds").select("id,mind_id,mind_name,role,sort").eq("room_id", roomId).order("sort"),
    supabase.from("chat_room_messages").select("*").eq("room_id", roomId).order("created_at"),
  ]);
  for (const result of [room, members, minds, messages]) if (result.error) throw result.error;
  return {
    room: (room.data as Room | null) ?? null,
    members: (members.data ?? []) as RoomMember[],
    minds: (minds.data ?? []) as RoomMind[],
    messages: ((messages.data ?? []) as RoomMessage[]).map(cleanRoomMessage),
  };
}

export async function markRead(roomId: string) {
  const uid = await currentOwnerId();
  if (!uid) return;
  await supabase.from("chat_room_members").update({ last_read_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", uid);
}

export async function leaveRoom(roomId: string) {
  const uid = await me();
  const { error } = await supabase.from("chat_room_members").delete().eq("room_id", roomId).eq("user_id", uid);
  if (error) throw error;
}

export async function removeMember(memberId: string) {
  await me();
  const { error } = await supabase.from("chat_room_members").delete().eq("id", memberId);
  if (error) throw error;
}

export async function setMemberRole(memberId: string, role: "admin" | "member") {
  await me();
  const { error } = await supabase.rpc("set_room_member_role", { _member: memberId, _role: role });
  if (error) throw error;
}

export async function addMind(roomId: string, mindId: string, mindName: string, role: MindRole, sort: number) {
  const uid = await me();
  const { error } = await supabase
    .from("chat_room_minds")
    .insert({ room_id: roomId, mind_id: mindId, mind_name: mindName.slice(0, 80), role, added_by: uid, sort });
  if (error) throw error;
}

export async function setMindRole(id: string, role: MindRole) {
  await me();
  const { error } = await supabase.from("chat_room_minds").update({ role }).eq("id", id);
  if (error) throw error;
}

export async function addRoomFriend(roomId: string, friendId: string) {
  const { error } = await supabase.rpc("add_room_friend", { _room: roomId, _friend: friendId });
  if (error) throw error;
}

export async function claimRoomTurn(roomId: string, messageId: string, mindId: string): Promise<string> {
  const { data, error } = await supabase.rpc("claim_room_turn", { _room: roomId, _message: messageId, _mind: mindId });
  if (error) throw error;
  return data;
}

export async function finishRoomTurn(roomId: string, token: string, messageId: string, body?: string) {
  const { error } = await supabase.rpc("finish_room_turn", { _room: roomId, _token: token, _message: messageId, ...(body === undefined ? {} : { _body: body }) });
  if (error) throw error;
}

export async function completeRoomQuestion(roomId: string, messageId: string) {
  const { error } = await supabase.rpc("complete_room_question", { _room: roomId, _message: messageId });
  if (error) throw error;
}

export async function uploadRoomMedia(roomId: string, file: File): Promise<RoomAttachment> {
  const uid = await me();
  const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : null;
  if (!kind || file.type === "image/svg+xml") throw new Error("Choose a photo or video.");
  if (file.size > 50 * 1024 * 1024) throw new Error("Maximum file size: 50 MB.");
  const ext = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 10) || kind;
  const path = `${roomId}/${uid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("room-media").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return { kind, path, name: file.name.slice(0, 160) };
}

export async function roomMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("room-media").createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeMind(id: string) {
  await me();
  const { error } = await supabase.from("chat_room_minds").delete().eq("id", id);
  if (error) throw error;
}

export async function postMessage(
  roomId: string,
  msg: { body: string; authorName: string; kind?: "user" | "mind"; mindId?: string | null; sharedUrl?: string | null; attachment?: RoomAttachment | null },
) {
  const uid = await me();
  const { error } = await supabase.from("chat_room_messages").insert({
    room_id: roomId,
    sender_user_id: uid,
    sender_kind: msg.kind ?? "user",
    mind_id: msg.mindId ?? null,
    author_name: msg.authorName.slice(0, 80),
    body: (msg.kind === "mind" ? stripProofMarkers(msg.body) : msg.body).slice(0, 8000),
    shared_url: msg.sharedUrl ?? null,
    attachment: msg.attachment ?? null,
  });
  if (error) throw error;
}

export async function deleteMessage(id: string) {
  await me();
  const { error } = await supabase.from("chat_room_messages").delete().eq("id", id);
  if (error) throw error;
}

/** Published Minds anyone may invite: Personas (all their projects) and single Projects. */
export async function listInvitableMinds(): Promise<{ mindId: string; name: string; kind: "persona" | "project" }[]> {
  const out = new Map<string, { name: string; kind: "persona" | "project" }>();
  try {
    const { data } = await supabase
      .from("projects")
      .select("id,title,creator_name,persona_id")
      .eq("published", true)
      .order("updated_at", { ascending: false })
      .limit(200);
    for (const p of data ?? []) {
      if (p.persona_id && !out.has(`persona:${p.persona_id}`)) out.set(`persona:${p.persona_id}`, { name: p.creator_name || "Creator", kind: "persona" });
      out.set(`project:${p.id}`, { name: p.title || p.creator_name || "Project", kind: "project" });
    }
  } catch {
    /* offline: fall back to built-in minds */
  }
  for (const m of MINDS) if (!out.has(m.id)) out.set(m.id, { name: m.name, kind: "project" });
  return [...out].map(([mindId, v]) => ({ mindId, ...v }));
}

export function mindLabel(mindId: string, fallback?: string) {
  return fallback || findMind(mindId)?.name || mindId;
}

const ROLE_NOTE: Record<string, string> = {
  debater: "You are a panelist in a calm round-table. Give your own view in 1-3 sentences; you may agree or politely disagree with the others by name. Never insult or attack anyone.",
  judge: "You are the moderator/judge of this round-table. In 2-4 sentences, fairly summarise where the panelists agree and differ, and name the strongest point. Stay neutral and kind.",
  admin: "You are the room's host. Keep the conversation friendly and on topic; answer briefly and guide people back if it drifts.",
  twin: "You are the creator's AI twin answering their community. Be warm and welcoming; if the creator already answered above, add to it rather than repeat.",
};

/**
 * Ask one Mind to speak in the room, seeing the full room transcript as turns.
 * Runs on the caller's own AI keys.
 */
export async function askMind(
  mind: RoomMind,
  transcript: RoomMessage[],
  lang: string,
): Promise<string> {
  const lines = transcript.map(cleanRoomMessage).map((m) => ({
    role: m.sender_kind === "mind" && m.mind_id === mind.mind_id ? ("agent" as const) : ("user" as const),
    text: m.sender_kind === "mind" && m.mind_id === mind.mind_id ? m.body : `${m.author_name}: ${m.body}${m.attachment ? `\n[Shared ${m.attachment.kind}: ${m.attachment.name}]` : ""}`,
  }));
  lines.push({
    role: "user",
    text: `[Group room note — not from a person] ${ROLE_NOTE[mind.role] ?? ROLE_NOTE["debater"]} Reply now as yourself to the conversation above.`,
  });
  const res = await apiFetch("/api/mind-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mindId: mind.mind_id, lang, messages: lines }),
  });
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(data.error || "The Mind could not answer.");
  const text = stripProofMarkers(data.text ?? "");
  if (!text) throw new Error("The Mind returned an empty answer.");
  return text;
}

/** Which Minds should speak for this message, in order. */
export function pickSpeakers(body: string, minds: RoomMind[], mode: string, limit: number): RoomMind[] {
  const lower = body.toLowerCase();
  const mentioned = minds.filter((m) => lower.includes(`@${m.mind_name.toLowerCase()}`) || lower.includes(`@${m.mind_id.toLowerCase()}`));
  if (mentioned.length) return mentioned.slice(0, limit);
  const panel = minds.filter((m) => m.role !== "judge");
  const judge = minds.find((m) => m.role === "judge");
  if (mode === "round") return [...panel.slice(0, Math.max(1, limit - (judge ? 1 : 0))), ...(judge ? [judge] : [])];
  if (mode === "relevance") {
    const words = new Set(lower.split(/\W+/).filter((w) => w.length > 3));
    const score = (m: RoomMind) => m.mind_name.toLowerCase().split(/\W+/).filter((w) => words.has(w)).length;
    const best = [...panel].sort((a, b) => score(b) - score(a))[0];
    return best ? [best] : [];
  }
  return []; // mention mode: Minds speak only when called
}

export function exportRoom(room: Room, messages: RoomMessage[], format: "md" | "json") {
  const cleanMessages = messages.map(cleanRoomMessage);
  const content =
    format === "json"
      ? JSON.stringify({ room: { title: room.title, id: room.id }, messages: cleanMessages }, null, 2)
      : `# ${room.title}\n\n` +
        cleanMessages.map((m) => `**${m.author_name}** (${new Date(m.created_at).toLocaleString()}):\n${m.body}\n`).join("\n");
  const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${room.title.replace(/[^\w-]+/g, "_") || "chat"}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Readable names for Mind ids: "project:<uuid>" becomes the project's title. */
export async function resolveMindNames(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uuids = ids.filter((i) => i.startsWith("project:")).map((i) => i.slice(8));
  if (uuids.length) {
    const { data } = await supabase.from("projects").select("id,title,creator_name").in("id", uuids);
    for (const p of data ?? []) out.set(`project:${p.id}`, p.title || p.creator_name || "Project");
  }
  const personas = ids.filter((i) => i.startsWith("persona:")).map((i) => i.slice(8));
  if (personas.length) {
    const { data } = await supabase.from("projects").select("persona_id,creator_name").in("persona_id", personas).eq("published", true);
    for (const p of data ?? []) if (p.persona_id) out.set(`persona:${p.persona_id}`, `👤 ${p.creator_name || "Creator"}`);
  }
  for (const i of ids) if (!out.has(i)) out.set(i, i.startsWith("project:") ? "Project" : i.startsWith("persona:") ? "👤 Creator" : mindLabel(i));
  return out;
}

/** For DM rooms: the other person's display name and @username. */
export async function dmPartnerNames(roomIds: string[], uid: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!roomIds.length) return out;
  const { data: mems } = await supabase.from("chat_room_members").select("room_id,user_id,display_name").in("room_id", roomIds).neq("user_id", uid);
  const userIds = [...new Set((mems ?? []).map((m) => m.user_id))];
  const { data: profs } = userIds.length
    ? await supabase.from("profiles").select("id,display_name,username").in("id", userIds)
    : { data: [] as { id: string; display_name: string | null; username: string | null }[] };
  const pm = new Map((profs ?? []).map((p) => [p.id, p]));
  for (const m of mems ?? []) {
    const p = pm.get(m.user_id);
    const n = p?.display_name || m.display_name || "User";
    out.set(m.room_id, p?.username ? `${n} (@${p.username})` : n);
  }
  return out;
}
