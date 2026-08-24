import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Hammer } from "lucide-react";

import { AccountMenu } from "@/components/account-menu";


export type AppRole = "creator" | "explorer";

export const ROLE_KEY = "evermine.role";

export function setStoredRole(role: AppRole) {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    /* ignore */
  }
}

export function getStoredRole(): AppRole | null {
  try {
    const v = localStorage.getItem(ROLE_KEY);
    return v === "creator" || v === "explorer" ? v : null;
  } catch {
    return null;
  }
}

const labels = {
  en: { creator: "Creator Mode", explorer: "Explorer Mode" },
  mn: { creator: "Бүтээгч горим", explorer: "Судлаач горим" },
};

export function ModeSwitch({ lang = "en" }: { lang?: "en" | "mn" }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const t = labels[lang];
  const base =
    "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex rounded-lg border border-border bg-muted p-1">
        <Link
          to="/creator"
          onClick={() => setStoredRole("creator")}
          className={`${base} ${
            pathname === "/creator"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Hammer className="h-4 w-4" />
          <span className="hidden sm:inline">{t.creator}</span>
        </Link>
        <Link
          to="/explore"
          onClick={() => setStoredRole("explorer")}
          className={`${base} ${
            pathname === "/explore"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Compass className="h-4 w-4" />
          <span className="hidden sm:inline">{t.explorer}</span>
        </Link>
      </div>
      <AccountMenu compact />
    </div>
  );
}

