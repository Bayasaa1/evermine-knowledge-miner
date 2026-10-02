import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Boxes, Camera, KeyRound, Loader2, PenSquare, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

import { AccountMenu } from "@/components/account-menu";
import { PersonaSwitcher } from "@/components/persona-switcher";
import { ViewerBrainHub } from "@/components/viewer-brain-hub";
import { setProfilePicture } from "@/lib/community";
import { initials, useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Evermind" },
      {
        name: "description",
        content: "Your Evermind account: creator studio, earnings, payouts and data privacy controls.",
      },
      { property: "og:title", content: "Profile — Evermind" },
      { property: "og:description", content: "Manage your Evermind account, studio and earnings." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, isAuthenticated } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [picture, setPicture] = useState<string | null>(null);
  const avatar = picture ?? profile?.avatarUrl ?? null;

  const changePicture = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await setProfilePicture(file);
      setPicture(url);
      toast.success("Profile picture updated");
    } catch {
      toast.error("Could not change your picture");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="dark min-h-screen bg-background pb-28 text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void changePicture(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => (isAuthenticated ? fileRef.current?.click() : toast.error("Sign in first"))}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-primary/10"
            aria-label="Change profile picture"
          >
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-primary">
                {isAuthenticated && profile ? initials(profile.displayName) : "EV"}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/55 py-0.5">
              {busy ? <Loader2 className="h-3 w-3 animate-spin text-white" /> : <Camera className="h-3 w-3 text-white" />}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">
              {isAuthenticated && profile ? profile.displayName : "Guest"}
            </h1>
            <p className="text-xs text-muted-foreground">A life becomes a mind.</p>
          </div>
          <PersonaSwitcher />
          <AccountMenu compact />
        </div>

        <div className="mt-4 grid gap-3">
          <Link
            to="/community"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/40"
          >
            <PenSquare className="h-5 w-5 text-foreground" />
            <span className="text-sm font-medium">Posts & stories — share a thought, photo or clip</span>
          </Link>
          <Link
            to="/vaults"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/40"
          >
            <Boxes className="h-5 w-5 text-foreground" />
            <span className="text-sm font-medium">My Vaults — saved minds, videos and branches</span>
          </Link>
          <Link
            to="/keys"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/40"
          >
            <KeyRound className="h-5 w-5 text-foreground" />
            <span className="text-sm font-medium">API Manager — keys, limits and usage</span>
          </Link>

          <Link
            to="/creator"
            hash="analytics"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/60"
          >
            <Wallet className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">Earnings & unclaimed balance</span>
          </Link>
        </div>

        <ViewerBrainHub />
      </div>
    </div>
  );
}
