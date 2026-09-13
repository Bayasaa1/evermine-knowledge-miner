import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to Evermind — Your minds, your account" },
      {
        name: "description",
        content:
          "Sign in to Evermind to keep your Mind Vaults, Core Brains and chat history private and synced to your own account.",
      },
      { property: "og:title", content: "Sign in to Evermind" },
      {
        property: "og:description",
        content: "Continue with Google or Apple, or use an email magic link to reach your Mind Vaults.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "magic";

function sanitizeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function AuthPage() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<null | "email" | "google" | "apple">(null);
  const [sent, setSent] = useState<null | "magic" | "confirm">(null);

  const next =
    typeof window !== "undefined" ? sanitizeNext(new URLSearchParams(window.location.search).get("next")) : "/";
  // Preserve the page the visitor was heading to (e.g. an app-connection consent
  // screen) across provider round-trips and emailed links.
  const returnUrl = typeof window !== "undefined" ? `${window.location.origin}${next}` : "/";

  useEffect(() => {
    if (!loading && isAuthenticated) void navigate({ to: next, replace: true });
  }, [loading, isAuthenticated, navigate, next]);

  const social = async (provider: "google" | "apple") => {
    setBusy(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: returnUrl,
      });
      if (result.error) {
        toast.error(`Could not continue with ${provider === "google" ? "Google" : "Apple"}`, {
          description: result.error.message,
        });
        setBusy(null);
        return;
      }
      if (result.redirected) return;
      void navigate({ to: next, replace: true });
    } catch (err) {
      toast.error("Sign-in failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy("email");
    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: returnUrl },
        });
        if (error) throw error;
        setSent("magic");
        toast.success("Magic link sent", { description: "Check your inbox to finish signing in." });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: returnUrl,
            data: { full_name: name.trim() || email.trim().split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          setSent("confirm");
          toast.success("Almost there", { description: "Confirm your email to activate the account." });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error("Authentication failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Evermind
        </Link>

        <div className="rounded-[12px] border border-border bg-card p-6 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Evermind — Sign In</h1>
              <p className="text-xs text-muted-foreground">A life becomes a mind.</p>
            </div>
          </div>

          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-green/10 text-status-green">
                <Mail className="h-5 w-5" />
              </div>
              <h2 className="text-base font-semibold text-foreground">
                {sent === "magic" ? "Magic link sent" : "Confirm your email"}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                We sent a link to <span className="font-medium text-foreground">{email}</span>. Open it on this
                device to reach your Mind Vaults.
              </p>
              <button
                onClick={() => setSent(null)}
                className="text-xs font-medium text-primary transition-colors hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <button
                  onClick={() => social("google")}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted/70 disabled:opacity-50"
                >
                  {busy === "google" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"
                      />
                      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
                      <path
                        fill="#EA4335"
                        d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"
                      />
                    </svg>
                  )}
                  Continue with Google
                </button>
                <button
                  onClick={() => social("apple")}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted/70 disabled:opacity-50"
                >
                  {busy === "apple" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M16.4 12.7c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.6-1.9-1.5-.2-3 .9-3.7.9-.8 0-2-.9-3.2-.9-1.7 0-3.2 1-4.1 2.5-1.7 3-.4 7.5 1.3 10 .8 1.2 1.8 2.5 3 2.5 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.4-1-2.4-3.3zM14 4.9c.7-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.5z" />
                    </svg>
                  )}
                  Continue with Apple
                </button>
              </div>

              <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={submitEmail} className="space-y-3">
                {mode === "signup" && (
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className="w-full rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                )}
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                />
                {mode !== "magic" && (
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    className="w-full rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                )}
                <button
                  type="submit"
                  disabled={busy !== null}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:opacity-50"
                >
                  {busy === "email" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "magic" ? "Email me a magic link" : mode === "signup" ? "Create account" : "Sign in"}
                </button>
              </form>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                  className="font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {mode === "signup" ? "I already have an account" : "Create an account"}
                </button>
                <button
                  onClick={() => setMode(mode === "magic" ? "signin" : "magic")}
                  className="font-medium text-primary transition-colors hover:underline"
                >
                  {mode === "magic" ? "Use a password" : "Use a magic link"}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          Your Mind Vaults, Core Brains and chat history stay private to your account. Raw videos never leave your
          device.
        </p>
      </div>
    </main>
  );
}
