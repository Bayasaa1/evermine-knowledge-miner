import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, Settings, ShieldCheck, User as UserIcon } from "lucide-react";

import { initials, useAuth } from "@/hooks/use-auth";
import { clearUserScopedLocalData } from "@/lib/user-scope";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Avatar + account menu for the top navigation. Falls back to a Sign in button. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { profile, isAuthenticated, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  if (loading) {
    return <div className="h-9 w-9 animate-pulse rounded-full border border-border bg-muted" />;
  }

  if (!isAuthenticated || !profile) {
    return (
      <button
        onClick={() =>
          void navigate({
            to: "/auth",
            search: { next: typeof window !== "undefined" ? window.location.pathname : "/" },
          })
        }
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark"
      >
        <LogIn className="h-4 w-4" />
        {!compact && <span>Sign in</span>}
      </button>
    );
  }

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearUserScopedLocalData();
    await signOut();
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border border-border bg-card p-1 pr-1 transition-colors hover:border-primary/40"
          aria-label="Account menu"
        >
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              className="h-8 w-8 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initials(profile.displayName)}
            </span>
          )}
          {!compact && (
            <span className="max-w-[120px] truncate pr-2 text-sm font-medium text-foreground">
              {profile.displayName}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{profile.displayName}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">{profile.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/creator" })}>
          <Settings className="mr-2 h-4 w-4" />
          Creator Studio
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/explore" })}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          My memory vault
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()} className="text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
