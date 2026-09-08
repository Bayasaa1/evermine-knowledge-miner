import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Plus, Trash2, UserSquare2, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import {
  createPersona,
  deletePersona,
  listPersonas,
  personaHandle,
  switchPersona,
  updatePersona,
  type Persona,
} from "@/lib/personas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Reads the caller's personas and the one currently active. */
export function usePersonas() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: ["creator-personas", userId],
    queryFn: () => (userId ? listPersonas(userId) : Promise.resolve([] as Persona[])),
    enabled: !!userId,
  });
}

/** Header dropdown for creating and switching managed creator identities. */
export function PersonaSwitcher({ compact = false }: { compact?: boolean }) {
  const { userId, isAuthenticated, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: personas = [] } = usePersonas();
  const [draft, setDraft] = useState("");
  const [avatar, setAvatar] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHandle, setEditHandle] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [editBio, setEditBio] = useState("");

  const startEdit = (p: Persona) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditHandle(p.handle);
    setEditAvatar(p.avatar_url ?? "");
    setEditBio(p.bio ?? "");
  };

  const active = personas.find((p) => p.is_active) ?? null;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["creator-personas", userId] });
  };

  const switching = useMutation({
    mutationFn: async (id: string | null) => {
      if (!userId) return "Sign in first";
      return switchPersona(userId, id);
    },
    onSuccess: async (error) => {
      if (error) {
        toast.error(error);
        return;
      }
      await refresh();
      toast.success("Active persona updated");
    },
  });

  const adding = useMutation({
    mutationFn: async () => {
      if (!userId) return "Sign in first";
      const { persona, error } = await createPersona(userId, {
        name: draft,
        handle: personaHandle(draft),
        avatarUrl: avatar || null,
      });
      if (error) return error;
      if (persona) await switchPersona(userId, persona.id);
      return null;
    },
    onSuccess: async (error) => {
      if (error) {
        toast.error(error);
        return;
      }
      setDraft("");
      setAvatar("");
      await refresh();
      toast.success("Persona created and activated");
    },
  });

  const removing = useMutation({
    mutationFn: (id: string) => deletePersona(id),
    onSuccess: async (error) => {
      if (error) {
        toast.error(error);
        return;
      }
      await refresh();
      toast.success("Persona removed");
    },
  });

  const saving = useMutation({
    mutationFn: async () => {
      if (!editingId) return "Nothing to save";
      return updatePersona(editingId, {
        name: editName,
        handle: editHandle || personaHandle(editName),
        avatarUrl: editAvatar.trim() || null,
        bio: editBio,
      });
    },
    onSuccess: async (error) => {
      if (error) {
        toast.error(error);
        return;
      }
      setEditingId(null);
      await refresh();
      toast.success("Persona updated");
    },
  });

  if (!isAuthenticated) return null;

  const label = active?.name ?? profile?.displayName ?? "Master account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex max-w-[190px] items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1.5 text-sm text-foreground transition-colors hover:border-primary/40"
          aria-label="Switch active persona"
        >
          {active?.avatar_url ? (
            <img src={active.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <UserSquare2 className="h-4 w-4 text-primary" />
          )}
          {!compact && <span className="truncate">{label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Switch active persona
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => switching.mutate(null)}>
          <UserSquare2 className="mr-2 h-4 w-4" />
          <span className="truncate">Master account</span>
          {!active && <Check className="ml-auto h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        {personas.map((p) =>
          editingId === p.id ? (
            <div
              key={p.id}
              className="space-y-2 rounded-lg border border-border/60 bg-muted/30 px-2 py-2"
              onKeyDown={(e) => e.stopPropagation()}
            >
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Persona name"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
              />
              <input
                value={editHandle}
                onChange={(e) => setEditHandle(e.target.value)}
                placeholder="@handle"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
              />
              <input
                value={editAvatar}
                onChange={(e) => setEditAvatar(e.target.value)}
                placeholder="Avatar image URL"
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
              />
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Short bio (optional)"
                rows={2}
                className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <button
                  disabled={!editName.trim() || saving.isPending}
                  onClick={() => saving.mutate()}
                  className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Save changes
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground"
                  aria-label="Cancel editing"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <DropdownMenuItem key={p.id} onSelect={() => switching.mutate(p.id)} className="gap-2">
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">
                {p.name}
                <span className="ml-1 text-xs text-muted-foreground">{p.handle}</span>
              </span>
              {p.is_active && <Check className="h-4 w-4 text-primary" />}
              <button
                aria-label={`Edit ${p.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startEdit(p);
                }}
                className="rounded p-1 text-muted-foreground hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                aria-label={`Delete ${p.name}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!window.confirm(`Delete persona "${p.name}"?`)) return;
                  removing.mutate(p.id);
                }}
                className="rounded p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuItem>
          ),
        )}
        <DropdownMenuSeparator />
        <div className="space-y-2 px-2 py-2" onKeyDown={(e) => e.stopPropagation()}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Persona name (e.g. Gremix)"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="Avatar image URL (optional)"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            disabled={!draft.trim() || adding.isPending}
            onClick={() => adding.mutate()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create persona
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
