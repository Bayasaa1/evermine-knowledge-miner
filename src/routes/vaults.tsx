import { ArrowRight, CloudCheck, Loader2 } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { MindManager } from "@/components/mind-manager";
import { listVaults } from "@/lib/cloud-vault.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/vaults")({
  head: () => ({
    meta: [
      { title: "My Mind Vaults — Evermind" },
      {
        name: "description",
        content: "Manage your isolated Mind Vaults — each one keeps its own core brain, tone and logic.",
      },
      { property: "og:title", content: "My Mind Vaults — Evermind" },
      { property: "og:description", content: "Manage your isolated AI Mind Vaults in Evermind." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VaultsPage,
});

function SavedMinds() {
  const { isAuthenticated } = useAuth();
  const fetchVaults = useServerFn(listVaults);
  const { data, isLoading } = useQuery({
    queryKey: ["cloud-vaults"],
    queryFn: () => fetchVaults(),
    enabled: isAuthenticated,
    refetchOnMount: "always",
  });

  if (!isAuthenticated) return null;

  return (
    <section className="mt-6 rounded-[12px] border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <CloudCheck className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Saved Minds</p>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {data && data.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {data.map((v) => (
            <li key={v.id} className="rounded-lg border border-border bg-background p-3">
              <p className="truncate text-sm font-medium text-foreground">{v.title}</p>
              <p className="text-xs text-muted-foreground">
                {v.kind} · {new Date(v.updatedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        !isLoading && (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing saved yet — analyze a video in Creator Studio and it appears here instantly.
          </p>
        )
      )}
    </section>
  );
}

function VaultsPage() {
  return (
    <div className="dark min-h-screen bg-background pb-28 text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">My Vaults</h1>
        <MindManager lang="en" />
        <SavedMinds />
        <div className="mt-6 flex justify-end">
          <Link
            to="/creator"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Continue to Creator Studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
