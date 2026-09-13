import { supabase } from "@/integrations/supabase/client";

/**
 * The signed-in account id, checked with the auth service rather than trusted
 * from anything stored in the browser.
 *
 * Every edit or delete sent from the app carries this id as an explicit filter.
 * The database already refuses to touch another account's rows; this is the
 * second lock, so a stale screen can never aim a delete at someone else's work.
 */
export async function currentOwnerId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export const NOT_SIGNED_IN = "You are signed out — sign in again to make this change.";
