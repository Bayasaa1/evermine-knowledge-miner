import { createFileRoute } from "@tanstack/react-router";

import { BottomNav } from "@/components/bottom-nav";
import { MindManager } from "@/components/mind-manager";

export const Route = createFileRoute("/vaults")({
  head: () => ({
    meta: [
      { title: "My Mind Vaults — Evermine" },
      {
        name: "description",
        content: "Manage your isolated Mind Vaults — each one keeps its own core brain, tone and logic.",
      },
      { property: "og:title", content: "My Mind Vaults — Evermine" },
      { property: "og:description", content: "Manage your isolated AI Mind Vaults in Evermine." },
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
      </div>
      <BottomNav />
    </div>
  );
}
