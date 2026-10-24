import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
};

type AuthorizationDetails = {
  client?: { name?: string; client_uri?: string } | null;
  redirect_url?: string;
  redirect_to?: string;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Approve an App Connection — Evermind" },
      { name: "description", content: "Review and approve or deny an app's request to connect to your Evermind account." },
      { property: "og:title", content: "Approve an App Connection — Evermind" },
      { property: "og:description", content: "Review an app's request to connect to your Evermind account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s['authorization_id'] === "string" ? s['authorization_id'] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <p className="max-w-md text-sm text-muted-foreground">
        Could not load this connection request: {String((error as Error)?.message ?? error)}
      </p>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "this app";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-[12px] border border-border bg-card p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Connect {clientName} to Evermind</h1>
            <p className="text-xs text-muted-foreground">A life becomes a mind.</p>
          </div>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          {clientName} is asking to use Evermind as you. It will be able to read your personas, projects,
          mined videos and Mind Vaults — exactly what you can see when signed in.
        </p>

        {error ? (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(true)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Approve
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(false)}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            Deny
          </button>
        </div>
      </div>
    </main>
  );
}
