import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorRouteComponent,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MODULE_LOAD_RECOVERY_SCRIPT } from "@/lib/module-load-recovery";

import { Toaster } from "@/components/ui/sonner";
import { DiagnosticChat } from "@/components/diagnostic-chat";
import { BottomNav } from "@/components/bottom-nav";
import { LanguageSelector } from "@/components/language-selector";
import { setChromeVisible } from "@/hooks/use-chrome-visible";
import { THEME_BOOT_SCRIPT } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";
import {
  setLocalScope,
  markScopeResolved,
  getLocalScope,
  clearUserScopedLocalData,
  migrateLegacyBrandKeys,
} from "@/lib/user-scope";
import { purgeLegacyKeyVaults, resetKeyCaches } from "@/lib/key-vault";
import { clearTranslationCache } from "@/lib/dynamic-translate";
import { installGlobalErrorInterceptors } from "@/lib/error-capture";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

const ErrorComponent: ErrorRouteComponent = ({ error, reset }) => {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              if (/Importing a module script failed|Failed to fetch dynamically imported module|Loading chunk|error loading dynamically imported module/i.test(error.message)) {
                window.location.reload();
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </Button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#000000" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      { name: "apple-mobile-web-app-title", content: "Evermind" },
      { title: "Evermind — A life becomes a mind" },
      { name: "description", content: "Evermind transforms your life videos into structured knowledge. A life becomes a mind." },
      { name: "author", content: "Evermind" },
      { property: "og:title", content: "Evermind — A life becomes a mind" },
      { property: "og:description", content: "Evermind transforms your life videos into structured knowledge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@evermind" },
      { name: "google-site-verification", content: "LAZSTNNPmRTsxjJFJBnpLHdz20senVb4kox8Sknqt4s" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;500;600;700&family=Noto+Sans+Mongolian&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODULE_LOAD_RECOVERY_SCRIPT }} />
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster position="top-right" richColors closeButton />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showNav = !pathname.startsWith("/auth") && !pathname.startsWith("/api");

  // Global error interception feeding the System Diagnostic Assistant widget.
  useEffect(() => installGlobalErrorInterceptors(), []);
  // Leaving a page always brings the menu back, even if the feed had hidden it.
  useEffect(() => setChromeVisible(true), [pathname]);

  // Single app-wide auth subscriber: keeps the router/cache and the local data
  // scope in sync with the signed-in account.
  useEffect(() => {
    setLocalScope(null);
    migrateLegacyBrandKeys();
    // Remove the pre-isolation shared key vault that used to be visible to every
    // account on this device.
    void purgeLegacyKeyVaults();
    void supabase.auth.getSession().then(({ data }) => {
      // No valid session on boot → wipe any leftover session state immediately.
      if (!data.session?.user) {
        clearUserScopedLocalData();
        resetKeyCaches();
        clearTranslationCache();
        queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "home-feed" });
        setLocalScope(null);
        markScopeResolved();
        return;
      }
      setLocalScope(data.session.user.id);
      markScopeResolved();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const nextId = session?.user.id ?? null;
      const accountChanged = nextId !== getLocalScope();
      if (accountChanged) {
        // A different person now owns this tab. Everything the previous account
        // loaded is dropped BEFORE the new scope is set, so no screen can keep
        // painting their personas, minds, jobs or notifications for even a beat.
        void queryClient.cancelQueries();
        queryClient.clear();
        resetKeyCaches();
        clearTranslationCache();
      }
      if (event === "SIGNED_OUT" || !nextId) clearUserScopedLocalData();
      setLocalScope(nextId);
      markScopeResolved();
      router.invalidate();
      // A cleared cache refetches on its own; invalidating is only for a
      // same-account refresh (token renewal, profile update).
      if (event !== "SIGNED_OUT" && !accountChanged) queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);


  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      {showNav && !pathname.startsWith("/creator") && !pathname.startsWith("/vaults") && <LanguageSelector />}
      {showNav && !/^\/chats\/[^/]+\/?$/.test(pathname) && <BottomNav />}
      <DiagnosticChat />
    </QueryClientProvider>
  );
}

