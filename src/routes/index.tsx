import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Compass, Hammer, ChevronRight } from "lucide-react";
import { getStoredRole, setStoredRole, type AppRole } from "@/components/mode-switch";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Evermine — Choose your path" },
      {
        name: "description",
        content:
          "Start in Evermine as a Content Creator mining your videos into an AI clone, or as an Explorer talking with AI Minds.",
      },
      { property: "og:title", content: "Evermine — Choose your path" },
      {
        property: "og:description",
        content: "Mine your videos into a mind, or explore and talk with AI Minds.",
      },
    ],
  }),
  component: Welcome,
});

const options = [
  {
    role: "creator" as AppRole,
    to: "/creator" as const,
    icon: Hammer,
    title: "I am a Content Creator / Expert",
    sub: "Mine your videos, build your AI Clone, and capture your Subconsciousness",
  },
  {
    role: "explorer" as AppRole,
    to: "/explore" as const,
    icon: Compass,
    title: "I am an Explorer / User",
    sub: "Talk, learn, and engage with AI Clones & Minds",
  },
];

function Welcome() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const role = getStoredRole();
    if (role) {
      void navigate({ to: role === "creator" ? "/creator" : "/explore" });
      return;
    }
    setChecked(true);
  }, [navigate]);

  const choose = (role: AppRole, to: "/creator" | "/explore") => {
    setStoredRole(role);
    void navigate({ to });
  };

  if (!checked) {
    return <div className="dark min-h-screen bg-background" />;
  }

  return (
    <div className="dark flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-3xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Brain className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome to Evermine. Choose your path:
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">A life becomes a mind.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.role}
                onClick={() => choose(o.role, o.to)}
                className="group flex h-full flex-col rounded-[12px] border border-border bg-card p-6 text-left transition-colors hover:border-primary/60 hover:bg-muted"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-foreground">{o.title}</h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{o.sub}</p>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Continue
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          You can switch between Creator and Explorer mode anytime from the top navbar.
        </p>
      </div>
    </div>
  );
}
