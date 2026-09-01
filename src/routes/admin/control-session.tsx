import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Boxes, Cpu, Loader2, ShieldCheck, Users } from "lucide-react";
import { getControlSession } from "@/lib/admin.functions";
import { BottomNav } from "@/components/bottom-nav";
import { AdminUserManagement } from "@/components/admin-user-management";

export const Route = createFileRoute("/admin/control-session")({
  head: () => ({
    meta: [
      { title: "Control Session · Evermind Super Admin" },
      {
        name: "description",
        content:
          "Restricted Evermind operations console: security audit logs, mining volume, token usage and creator leaderboards.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Control Session · Evermind Super Admin" },
      {
        property: "og:description",
        content: "Restricted Evermind operations console for security, mining and usage metrics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ControlSession,
});

function ControlSession() {
  const fetchData = useServerFn(getControlSession);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin-control-session"],
    queryFn: () => fetchData(),
    refetchInterval: 30_000,
    retry: false,
  });

  return (
    <main className="min-h-screen bg-background pb-28">
      <header className="border-b border-border bg-card/60 px-4 py-5 backdrop-blur">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Evermind</p>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" /> Super Admin Control Session
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {isPending && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading live metrics…
          </p>
        )}

        {error && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Access restricted
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              This control session is limited to Evermind super admin accounts.
            </p>
          </div>
        )}

        {data && (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  [Users, "Users", data.metrics.users],
                  [Activity, "Mining operations", data.metrics.miningJobs],
                  [Cpu, "Chunks mined", data.metrics.chunksMined],
                  [Boxes, "Mind vaults", data.metrics.vaults],
                  [Activity, "Active jobs", data.metrics.activeJobs],
                  [AlertTriangle, "Quota-paused", data.metrics.pausedJobs],
                  [Cpu, "Token units (100 events)", data.metrics.tokens],
                ] as const
              ).map(([Icon, label, value]) => (
                <div key={label} className="rounded-xl border border-border bg-card p-4">
                  <Icon className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
                  <p className="text-[11px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <Leaderboard title="Top creators" rows={data.topCreators} empty="No creator activity yet." />
              <Leaderboard title="Most popular minds" rows={data.topMinds} empty="No mind engagement yet." />
            </section>

            <AdminUserManagement />

            <section className="rounded-xl border border-border bg-card">
              <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                Security audit log
              </h2>
              {data.audit.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No recorded events yet.</p>
              ) : (
                <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto">
                  {data.audit.map((entry) => (
                    <li key={entry.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                            entry.suspicious ? "bg-destructive/15 text-destructive" : "bg-primary/10 text-primary"
                          }`}
                        >
                          {entry.event}
                        </span>
                        <span className="text-foreground">{entry.email ?? "anonymous"}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.detail || "—"} · IP {entry.ip ?? "unknown"} · {entry.tokens} tokens
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
      <BottomNav />
    </main>
  );
}

function Leaderboard({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; value: number }[];
  empty: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
              <span className="truncate text-foreground">{r.label}</span>
              <span className="ml-auto font-semibold text-primary">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
