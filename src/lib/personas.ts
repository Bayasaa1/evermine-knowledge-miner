/**
 * Multi-persona identity: a creator account can hold several managed brand
 * identities (e.g. "Gremix", "CTS", "Cami"). Exactly one persona can be active
 * at a time, and everything published while it is active carries that persona's
 * name and avatar on the public feed.
 */
import { supabase } from "@/integrations/supabase/client";
import { currentOwnerId, NOT_SIGNED_IN } from "@/lib/owner";

export type Persona = {
  id: string;
  user_id: string;
  name: string;
  handle: string;
  avatar_url: string | null;
  bio: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const COLS = "id,user_id,name,handle,avatar_url,bio,is_active,created_at,updated_at";

export function personaHandle(input: string): string {
  const slug = input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return slug ? `@${slug}` : "@persona";
}

export async function listPersonas(userId: string): Promise<Persona[]> {
  const { data } = await supabase
    .from("creator_personas")
    .select(COLS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data as Persona[] | null) ?? [];
}

export async function activePersona(userId: string): Promise<Persona | null> {
  const { data } = await supabase
    .from("creator_personas")
    .select(COLS)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as Persona | null) ?? null;
}

export async function createPersona(
  userId: string,
  input: { name: string; handle?: string; avatarUrl?: string | null; bio?: string },
): Promise<{ persona: Persona | null; error: string | null }> {
  const owner = await currentOwnerId();
  if (!owner || owner !== userId) return { persona: null, error: NOT_SIGNED_IN };
  const name = input.name.trim() || "New persona";
  let handle = (input.handle?.trim() || personaHandle(name)).replace(/^@?/, "@");
  // No handle typed: if another account owns the auto one, pick the next free @name2, @name3…
  if (!input.handle?.trim() && (await isHandleTaken(handle))) {
    const base = handle;
    for (let n = 2; n < 100; n++) {
      if (!(await isHandleTaken(`${base}${n}`))) { handle = `${base}${n}`; break; }
    }
  }
  const { data, error } = await supabase
    .from("creator_personas")
    .insert({
      user_id: userId,
      name,
      handle,
      avatar_url: input.avatarUrl?.trim() || null,
      bio: input.bio?.trim() ?? "",
    })
    .select(COLS)
    .single();
  return { persona: (data as Persona | null) ?? null, error: friendlyPersonaError(error?.message ?? null) };
}

export async function updatePersona(
  id: string,
  patch: { name?: string; handle?: string; avatarUrl?: string | null; bio?: string },
): Promise<string | null> {
  const owner = await currentOwnerId();
  if (!owner) return NOT_SIGNED_IN;
  const { error } = await supabase
    .from("creator_personas")
    .update({
      ...(patch.name !== undefined ? { name: patch.name.trim() || "New persona" } : {}),
      ...(patch.handle !== undefined ? { handle: patch.handle.trim().replace(/^@?/, "@") } : {}),
      ...(patch.avatarUrl !== undefined ? { avatar_url: patch.avatarUrl || null } : {}),
      ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
    })
    .eq("id", id)
    .eq("user_id", owner);
  return friendlyPersonaError(error?.message ?? null);
}

export async function deletePersona(id: string): Promise<string | null> {
  const owner = await currentOwnerId();
  if (!owner) return NOT_SIGNED_IN;
  const { error } = await supabase
    .from("creator_personas")
    .delete()
    .eq("id", id)
    .eq("user_id", owner);
  return error?.message ?? null;
}

/** Makes one persona active (or clears all when id is null). */
export async function switchPersona(userId: string, id: string | null): Promise<string | null> {
  const owner = await currentOwnerId();
  if (!owner || owner !== userId) return NOT_SIGNED_IN;
  const clear = await supabase
    .from("creator_personas")
    .update({ is_active: false })
    .eq("user_id", userId)
    .eq("is_active", true);
  if (clear.error) return clear.error.message;
  if (!id) return null;
  const { error } = await supabase
    .from("creator_personas")
    .update({ is_active: true })
    .eq("id", id)
    .eq("user_id", userId);
  return error?.message ?? null;
}

export const HANDLE_TAKEN = "It's not available";

/** True when another account already owns this @handle. */
export async function isHandleTaken(handle: string, excludeId?: string): Promise<boolean> {
  const h = handle.trim().replace(/^@?/, "@");
  if (h.length < 2) return false;
  const { data } = await supabase.rpc("persona_handle_taken", excludeId ? { _handle: h, _exclude_id: excludeId } : { _handle: h });
  return data === true;
}

/** Ids of my personas that copied a handle another account registered first. */
export async function myDuplicatePersonaIds(): Promise<string[]> {
  const { data } = await supabase.rpc("my_duplicate_persona_ids");
  return ((data as unknown as string[] | null) ?? []).map(String);
}

export function friendlyPersonaError(msg: string | null): string | null {
  if (msg && msg.includes("handle_not_available")) return HANDLE_TAKEN;
  return msg;
}

/** Loads a single persona by id (used when the wizard targets a specific identity). */
export async function getPersona(id: string): Promise<Persona | null> {
  const owner = await currentOwnerId();
  if (!owner) return null;
  const { data } = await supabase
    .from("creator_personas")
    .select(COLS)
    .eq("id", id)
    .eq("user_id", owner)
    .maybeSingle();
  return (data as Persona | null) ?? null;
}
