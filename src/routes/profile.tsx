import { createFileRoute, Link } from "@tanstack/react-router";
import { Hammer, ShieldCheck, Wallet } from "lucide-react";

import { BottomNav } from "@/components/bottom-nav";
import { AccountMenu } from "@/components/account-menu";
import { initials, useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Evermine" },
      {
        name: "description",
        content: "Your Evermine account: creator studio, earnings, payouts and data privacy controls.",
      },
      { property: "og:title", content: "Profile — Evermine" },
      { property: "og:description", content: "Manage your Evermine account, studio and earnings." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, isAuthenticated } = useAuth();

  return (
    <div className="dark min-h-screen bg-background pb-24 text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {isAuthenticated && profile ? initials(profile.displayName) : "EV"}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">
              {isAuthenticated && profile ? profile.displayName : "Guest"}
            </h1>
            <p className="text-xs text-muted-foreground">A life becomes a mind.</p>
          </div>
          <AccountMenu compact />
        </div>

        <div className="mt-4 grid gap-3">
          <Link
            to="/creator"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/60"
          >
            <Hammer className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Creator Studio — mine videos, pricing & payouts</span>
          </Link>
          <Link
            to="/creator"
            hash="analytics"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/60"
          >
            <Wallet className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Earnings & unclaimed balance</span>
          </Link>
          <Link
            to="/explore"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/60"
          >
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Privacy & User Memory Vault</span>
          </Link>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
