import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Home, Boxes, Plus, User } from "lucide-react";

import { CreateWizard } from "@/components/create-wizard";

type Item = { to: "/" | "/explore" | "/vaults" | "/profile"; label: string; icon: typeof Home };

const ITEMS: Record<"en" | "mn", Item[]> = {
  en: [
    { to: "/", label: "Home", icon: Home },
    { to: "/explore", label: "Explore", icon: Compass },
    { to: "/vaults", label: "My Vaults", icon: Boxes },
    { to: "/profile", label: "Profile", icon: User },
  ],
  mn: [
    { to: "/", label: "Нүүр", icon: Home },
    { to: "/explore", label: "Судлах", icon: Compass },
    { to: "/vaults", label: "Сангууд", icon: Boxes },
    { to: "/profile", label: "Профайл", icon: User },
  ],
};

/** Unified fixed bottom navigation with the centered "+" Create hub. */
export function BottomNav({ lang = "en" }: { lang?: "en" | "mn" }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [wizard, setWizard] = useState(false);
  const items = ITEMS[lang];
  const left = items.slice(0, 2);
  const right = items.slice(2);

  const cell = (item: Item) => {
    const Icon = item.icon;
    const active = pathname === item.to;
    return (
      <Link
        key={item.to}
        to={item.to}
        className={`flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Icon className="h-5 w-5" />
        {item.label}
      </Link>
    );
  };

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center px-2">
          {left.map(cell)}
          <button
            type="button"
            onClick={() => setWizard(true)}
            aria-label={lang === "mn" ? "Бүтээх" : "Create"}
            className="mx-1 -mt-5 flex h-12 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-terracotta-dark"
          >
            <Plus className="h-6 w-6" />
          </button>
          {right.map(cell)}
        </div>
      </nav>
      <CreateWizard open={wizard} onClose={() => setWizard(false)} lang={lang} />
    </>
  );
}
