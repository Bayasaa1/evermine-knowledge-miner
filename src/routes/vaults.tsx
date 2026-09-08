import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { SavedMinds } from "@/components/saved-minds";
import { SubtitleHealth } from "@/components/subtitle-health";
import { VaultHub, type VaultPersonaSelection } from "@/components/vault-hub";

import { useLang } from "@/lib/i18n";

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

function VaultsPage() {
  const { lang } = useLang();
  // The persona opened in the hub also scopes everything below it (Saved Minds),
  // so entering CTS only ever shows CTS material — never another persona's.
  const [persona, setPersona] = useState<VaultPersonaSelection>(null);
  return (
    <div className="dark min-h-screen bg-background pb-28 text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">My Vaults</h1>
        <p className="mb-3 mt-1 text-sm text-muted-foreground">
          Personas, projects, mined content, Core Brain, monetization and reviews — one ecosystem.
        </p>
        <Link
          to="/mining"
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Live mining progress
        </Link>

        <VaultHub lang={lang} selected={persona} onSelect={setPersona} />
        <div className="mt-8 space-y-6 border-t border-border pt-6">
          <SubtitleHealth personaId={persona?.id ?? null} />
          <SavedMinds lang={lang} forcedPersona={persona ?? undefined} />
        </div>
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

