import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { listSubtitleHealth, retimeContent, type SubtitleHealthRow } from "@/lib/retime.functions";

const STATUS: Record<SubtitleHealthRow["status"], { label: string; tone: string }> = {
  synced: { label: "In sync", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  drifting: { label: "Drifting", tone: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  untimed: { label: "No timings", tone: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
};

export function SubtitleHealth() {
  const client = useQueryClient();
  const load = useServerFn(listSubtitleHealth);
  const retime = useServerFn(retimeContent);

  const { data, isLoading, error } = useQuery({
    queryKey: ["subtitle-health"],
    queryFn: () => load(),
  });

  const repair = useMutation({
    mutationFn: (contentId: string) => retime({ data: { contentId } }),
    onSuccess: (row) => {
      toast.success(
        row.status === "synced"
          ? `“${row.title.slice(0, 40)}” is back in sync.`
          : `Re-timed, but ${row.untimed + row.outOfOrder} of ${row.total} lines still drift.`,
      );
      void client.invalidateQueries({ queryKey: ["subtitle-health"] });
      void client.invalidateQueries({ queryKey: ["feed"] });
      void client.invalidateQueries({ queryKey: ["vaults"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data ?? [];
  const bad = rows.filter((r) => r.status !== "synced");

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4 text-primary" />
            Subtitle timing
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Re-watch a video to give its zero-time lines real timestamps. Only the timing is
            re-mined — the words, story and brain stay untouched.
          </p>
        </div>
        {rows.length > 0 && (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
            {bad.length} of {rows.length} need work
          </span>
        )}
      </header>

      {isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking your mined videos…
        </p>
      )}
      {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
      {!isLoading && !error && rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Nothing mined yet.</p>
      )}

      <ul className="space-y-2">
        {rows.map((row) => {
          const badge = STATUS[row.status];
          const busy = repair.isPending && repair.variables === row.contentId;
          return (
            <li
              key={row.contentId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.title}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {row.total} lines · {row.untimed} without a time · {row.outOfOrder} out of order ·{" "}
                  {Math.round(row.drift * 100)}% drift
                </p>
              </div>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] ${badge.tone}`}>
                {row.status === "synced" ? (
                  <CheckCircle2 className="mr-1 inline h-3 w-3" />
                ) : (
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                )}
                {badge.label}
              </span>
              <button
                type="button"
                disabled={repair.isPending}
                onClick={() => repair.mutate(row.contentId)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {busy ? "Re-timing…" : "Re-time"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
