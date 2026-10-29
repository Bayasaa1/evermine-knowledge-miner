import { createFileRoute } from "@tanstack/react-router";

import { MiningMonitor } from "@/components/mining-monitor";
import { ContentCreateWizard } from "@/components/create-wizard";
import { BottomNav } from "@/components/bottom-nav";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/mining")({
  head: () => ({
    meta: [
      { title: "Live Mining Progress — Evermind" },
      {
        name: "description",
        content:
          "Watch every Evermind mining job in real time. Mining runs in the background, so checkpoints keep saving even after you close the app.",
      },
      { property: "og:title", content: "Live Mining Progress — Evermind" },
      {
        property: "og:description",
        content: "Real-time progress for background mining jobs in Evermind.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MiningPage,
});

function MiningPage() {
  const { lang } = useLang();
  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="sr-only">Live mining progress</h1>
        <ContentCreateWizard lang={lang} />
        <MiningMonitor lang={lang} />
      </div>
      <BottomNav lang={lang} />
    </div>
  );
}
