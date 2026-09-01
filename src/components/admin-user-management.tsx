import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Gauge, Loader2, Search, ShieldCheck, Star, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { adminFeatureMind, adminListFeatured, adminListUsers, adminSetUserFlags } from "@/lib/admin.functions";

/** Super-admin moderation surface: ban, unban, quota grants and featured minds. */
export function AdminUserManagement() {
  const listUsers = useServerFn(adminListUsers);
  const setFlags = useServerFn(adminSetUserFlags);
  const featureMind = useServerFn(adminFeatureMind);
  const listFeatured = useServerFn(adminListFeatured);
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [mindId, setMindId] = useState("");

  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => listUsers(), retry: false });
  const featured = useQuery({ queryKey: ["admin-featured"], queryFn: () => listFeatured(), retry: false });

  const flagMutation = useMutation({
    mutationFn: (data: { userId: string; banned?: boolean; unlimitedQuota?: boolean; banReason?: string }) =>
      setFlags({ data }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const featureMutation = useMutation({
    mutationFn: (data: { mindId: string; featured: boolean }) => featureMind({ data }),
    onSuccess: async () => {
      setMindId("");
      await queryClient.invalidateQueries({ queryKey: ["admin-featured"] });
      toast.success("Featured minds updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = q.trim().toLowerCase();
  const rows = (users.data ?? []).filter(
    (u) => !term || (u.email ?? "").toLowerCase().includes(term) || (u.displayName ?? "").toLowerCase().includes(term),
  );

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">User management</h2>
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search email or name"
              className="w-48 bg-transparent text-sm text-foreground outline-none"
            />
          </div>
        </div>

        {users.isPending && (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading users…
          </p>
        )}
        {users.error && <p className="px-4 py-6 text-sm text-muted-foreground">Super admin access required.</p>}

        {users.data && (
          <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto">
            {rows.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium text-foreground">
                    {u.displayName ?? "Unnamed"}
                    {u.isAdmin && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                    {u.banned && <span className="rounded bg-destructive/15 px-1.5 text-[10px] text-destructive">banned</span>}
                    {u.unlimitedQuota && (
                      <span className="rounded bg-primary/15 px-1.5 text-[10px] text-primary">unlimited</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.email ?? u.id.slice(0, 8)}</p>
                </div>
                <button
                  disabled={flagMutation.isPending}
                  onClick={() =>
                    flagMutation.mutate({ userId: u.id, banned: !u.banned, banReason: u.banned ? "" : "Policy violation" })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 disabled:opacity-50"
                >
                  {u.banned ? <UserCheck className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                  {u.banned ? "Unban user" : "Ban user"}
                </button>
                <button
                  disabled={flagMutation.isPending}
                  onClick={() => flagMutation.mutate({ userId: u.id, unlimitedQuota: !u.unlimitedQuota })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:border-primary/40 disabled:opacity-50"
                >
                  <Gauge className="h-3.5 w-3.5" />
                  {u.unlimitedQuota ? "Revoke unlimited" : "Grant unlimited quota"}
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No matching users.</li>}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">Featured minds</h2>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <input
            value={mindId}
            onChange={(e) => setMindId(e.target.value)}
            placeholder="Mind id to feature"
            className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            disabled={!mindId.trim() || featureMutation.isPending}
            onClick={() => featureMutation.mutate({ mindId: mindId.trim(), featured: true })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Star className="h-4 w-4" /> Feature mind
          </button>
        </div>
        <ul className="divide-y divide-border">
          {(featured.data ?? []).map((id) => (
            <li key={id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Star className="h-3.5 w-3.5 text-primary" />
              <span className="truncate text-foreground">{id}</span>
              <button
                onClick={() => featureMutation.mutate({ mindId: id, featured: false })}
                className="ml-auto rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
              >
                Unfeature
              </button>
            </li>
          ))}
          {(featured.data ?? []).length === 0 && (
            <li className="px-4 py-5 text-sm text-muted-foreground">No featured minds yet.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
