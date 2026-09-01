/**
 * Global persona state. The active persona flows through every operation —
 * mining, project creation, vault assignment and the public feed — so all
 * surfaces stay bound to the same identity.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import { listPersonas, switchPersona, type Persona } from "@/lib/personas";

export const personasKey = (userId: string | null) => ["personas", userId] as const;
export const personaProjectsKey = (userId: string | null, personaId: string | null) =>
  ["persona-projects", userId, personaId] as const;
export const projectContentKey = (projectId: string) => ["project-content", projectId] as const;
export const homeFeedKey = ["home-feed"] as const;

/** Invalidates every surface bound to the persona → project → vault → feed chain. */
export async function invalidatePersonaChain(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId?: string | null,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["personas"] }),
    queryClient.invalidateQueries({ queryKey: ["persona-projects"] }),
    queryClient.invalidateQueries({ queryKey: ["project-content"] }),
    queryClient.invalidateQueries({ queryKey: ["project-stats"] }),
    queryClient.invalidateQueries({ queryKey: ["mind-versions"] }),
    queryClient.invalidateQueries({ queryKey: ["cloud-vaults"] }),
    queryClient.invalidateQueries({ queryKey: homeFeedKey }),
    projectId
      ? queryClient.invalidateQueries({ queryKey: projectContentKey(projectId) })
      : Promise.resolve(),
  ]);
}

export function usePersonas() {
  const { userId, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: personasKey(userId),
    queryFn: () => listPersonas(userId!),
    enabled: !!userId,
  });

  const personas: Persona[] = useMemo(() => data ?? [], [data]);
  const active = personas.find((p) => p.is_active) ?? null;

  const setActive = useMutation({
    mutationFn: async (id: string | null) => {
      if (!userId) return null;
      return switchPersona(userId, id);
    },
    onSuccess: () => void invalidatePersonaChain(queryClient),
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: personasKey(userId) }),
    [queryClient, userId],
  );

  return {
    userId,
    isAuthenticated,
    personas,
    active,
    activePersonaId: active?.id ?? null,
    isLoading,
    setActive: (id: string | null) => setActive.mutateAsync(id),
    refresh,
  };
}
