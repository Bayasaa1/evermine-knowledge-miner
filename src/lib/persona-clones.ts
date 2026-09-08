/**
 * Real voice + face clones for a persona.
 *
 * A clone is not text-to-speech: it is a voice model built from the creator's
 * own mined speech, so the Mind answers in their actual voice in any language.
 * The face clone drives their own mined face off that same audio.
 *
 * Rows are owner-only (RLS): nobody but the persona's owner can read or change
 * them, and a clone can only be built after the owner confirms it is their own
 * voice and face.
 */
import { supabase } from "@/integrations/supabase/client";

export type CloneKind = "voice" | "face";
export type CloneStatus = "draft" | "building" | "ready" | "error";

export type PersonaClone = {
  id: string;
  user_id: string;
  persona_id: string;
  kind: CloneKind;
  /** "builtin" = stand-in, "elevenlabs" = real voice clone, "canvas" = live mined face. */
  engine: string;
  remote_id: string | null;
  status: CloneStatus;
  error: string | null;
  consent: boolean;
  consent_at: string | null;
  samples: { label: string; seconds: number; source?: string }[];
  settings: Record<string, unknown>;
  updated_at: string;
};

const COLS =
  "id,user_id,persona_id,kind,engine,remote_id,status,error,consent,consent_at,samples,settings,updated_at";

export async function listClones(personaId: string): Promise<PersonaClone[]> {
  const { data } = await supabase.from("persona_clones").select(COLS).eq("persona_id", personaId);
  return (data ?? []) as unknown as PersonaClone[];
}

export function findClone(clones: PersonaClone[], kind: CloneKind): PersonaClone | undefined {
  return clones.find((c) => c.kind === kind);
}

/** A clone only counts as usable when it is built AND the owner consented. */
export function isLive(clone: PersonaClone | undefined): boolean {
  return !!clone && clone.status === "ready" && clone.consent && !!clone.remote_id;
}

export async function upsertClone(input: {
  userId: string;
  personaId: string;
  kind: CloneKind;
  engine?: string;
  remoteId?: string | null;
  status?: CloneStatus;
  error?: string | null;
  consent?: boolean;
  samples?: PersonaClone["samples"];
  settings?: Record<string, unknown>;
}): Promise<PersonaClone | null> {
  const row = {
    user_id: input.userId,
    persona_id: input.personaId,
    kind: input.kind,
    ...(input.engine !== undefined ? { engine: input.engine } : {}),
    ...(input.remoteId !== undefined ? { remote_id: input.remoteId } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.error !== undefined ? { error: input.error } : {}),
    ...(input.consent !== undefined
      ? { consent: input.consent, consent_at: input.consent ? new Date().toISOString() : null }
      : {}),
    ...(input.samples !== undefined ? { samples: input.samples } : {}),
    ...(input.settings !== undefined ? { settings: input.settings } : {}),
  };
  const { data } = await supabase
    .from("persona_clones")
    .upsert(row as never, { onConflict: "persona_id,kind" })
    .select(COLS)
    .maybeSingle();
  return (data as unknown as PersonaClone) ?? null;
}

export async function deleteClone(personaId: string, kind: CloneKind): Promise<void> {
  await supabase.from("persona_clones").delete().eq("persona_id", personaId).eq("kind", kind);
}
