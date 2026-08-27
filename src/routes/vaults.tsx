import { ArrowRight } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { MindManager } from "@/components/mind-manager";

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
    ],
  }),
  component: VaultsPage,
});

function VaultsPage() {
  return (
    <div className="dark min-h-screen bg-background pb-24 text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">My Vaults</h1>
        <MindManager lang="en" />
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
