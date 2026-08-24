import { useCallback, useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AuthProfile = {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
};

function toProfile(user: User): AuthProfile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : undefined);
  const email = user.email ?? "";
  return {
    id: user.id,
    displayName: pick("full_name") ?? pick("name") ?? (email ? email.split("@")[0]! : "Miner"),
    email,
    avatarUrl: pick("avatar_url") ?? pick("picture") ?? null,
  };
}

/**
 * Reads the signed-in session on the client. Auth state lives in localStorage,
 * so this is client-only by design — never gate SSR on it.
 */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next);
      setLoading(false);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    session,
    user: session?.user ?? null,
    profile: session?.user ? toProfile(session.user) : null,
    userId: session?.user?.id ?? null,
    isAuthenticated: !!session?.user,
    loading,
    signOut,
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
