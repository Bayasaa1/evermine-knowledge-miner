/**
 * Mutual-subscription social graph. Subscribing is one-way; two people who
 * subscribe to each other are friends and may open a human-only DM room.
 */
import { supabase } from "@/integrations/supabase/client";

export type Person = { id: string; name: string; avatar: string | null };
export type Graph = {
  friends: Person[];
  subscribers: Person[]; // follow me, I don't follow back
  following: Person[]; // I follow, they don't follow back
  blocked: Person[];
};

async function me(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sign in first");
  return data.user.id;
}

async function people(ids: string[]): Promise<Map<string, Person>> {
  const map = new Map<string, Person>();
  if (!ids.length) return map;
  const { data } = await supabase.from("profiles").select("id,display_name,avatar_url").in("id", ids);
  for (const p of data ?? []) map.set(p.id, { id: p.id, name: p.display_name || "User", avatar: p.avatar_url });
  return map;
}

export async function loadGraph(): Promise<Graph> {
  const uid = await me();
  const [{ data: subs }, { data: blocks }] = await Promise.all([
    supabase.from("user_subscriptions").select("subscriber_id,target_user_id").or(`subscriber_id.eq.${uid},target_user_id.eq.${uid}`),
    supabase.from("user_blocks").select("blocked_user_id").eq("user_id", uid),
  ]);
  const out = new Set<string>();
  const inc = new Set<string>();
  for (const s of subs ?? []) {
    if (s.subscriber_id === uid) out.add(s.target_user_id);
    else inc.add(s.subscriber_id);
  }
  const blockedIds = (blocks ?? []).map((b) => b.blocked_user_id);
  const map = await people([...out, ...inc, ...blockedIds]);
  const get = (id: string) => map.get(id) ?? { id, name: "User", avatar: null };
  return {
    friends: [...out].filter((id) => inc.has(id)).map(get),
    subscribers: [...inc].filter((id) => !out.has(id)).map(get),
    following: [...out].filter((id) => !inc.has(id)).map(get),
    blocked: blockedIds.map(get),
  };
}

export async function searchPeople(q: string): Promise<Person[]> {
  const uid = await me();
  const term = q.trim().replace(/[%,()]/g, "");
  if (term.length < 2) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id,display_name,avatar_url")
    .ilike("display_name", `%${term}%`)
    .neq("id", uid)
    .limit(20);
  return (data ?? []).map((p) => ({ id: p.id, name: p.display_name || "User", avatar: p.avatar_url }));
}

export async function subscribe(target: string) {
  const uid = await me();
  const { error } = await supabase.from("user_subscriptions").insert({ subscriber_id: uid, target_user_id: target });
  if (error && error.code !== "23505") throw error;
}

export async function unsubscribe(target: string) {
  const uid = await me();
  const { error } = await supabase.from("user_subscriptions").delete().eq("subscriber_id", uid).eq("target_user_id", target);
  if (error) throw error;
}

export async function removeSubscriber(sub: string) {
  const uid = await me();
  const { error } = await supabase.from("user_subscriptions").delete().eq("subscriber_id", sub).eq("target_user_id", uid);
  if (error) throw error;
}

export async function block(other: string) {
  const { error } = await supabase.rpc("block_user", { _other: other });
  if (error) throw error;
}

export async function unblock(other: string) {
  const uid = await me();
  const { error } = await supabase.from("user_blocks").delete().eq("user_id", uid).eq("blocked_user_id", other);
  if (error) throw error;
}

/** Opens (or reuses) the human-only DM room. Only works for mutual friends. */
export async function openDm(other: string): Promise<string> {
  const { data, error } = await supabase.rpc("open_dm", { _other: other });
  if (error) throw new Error(error.message.includes("not_mutual") ? "not_mutual" : error.message);
  return data as string;
}
