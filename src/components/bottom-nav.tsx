import { Link, useRouterState } from "@tanstack/react-router";
import { Search, Home, Plus, User } from "lucide-react";

import { MiningStatusPill } from "@/components/mining-status-pill";
import { NotificationCenter } from "@/components/notification-center";
import { pickCopy, type Lang } from "@/lib/i18n";

type Item = { to: "/" | "/search" | "/creator" | "/profile"; label: string; icon: typeof Home };

const ITEMS: { en: Item[] } & Partial<Record<Lang, Item[]>> = {
  en: [
    { to: "/", label: "Home", icon: Home },
    { to: "/search", label: "Search", icon: Search },
    { to: "/creator", label: "Create", icon: Plus },
    { to: "/profile", label: "Profile", icon: User },
  ],
  mn: [
    { to: "/", label: "Нүүр", icon: Home },
    { to: "/search", label: "Хайлт", icon: Search },
    { to: "/creator", label: "Бүтээх", icon: Plus },
    { to: "/profile", label: "Профайл", icon: User },
  ],
  ko: [
    { to: "/", label: "홈", icon: Home },
    { to: "/search", label: "검색", icon: Search },
    { to: "/creator", label: "만들기", icon: Plus },
    { to: "/profile", label: "프로필", icon: User },
  ],
};

/**
 * Floating frosted-glass dock: five icons, no labels, no colour.
 *
 * Home, Search, Create, Alerts, Profile. The bar sits above the content with
 * a blurred translucent backdrop so the video keeps showing through it.
 */
export function BottomNav({ lang = "en" }: { lang?: Lang }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = pickCopy(ITEMS, lang);
  const [home, search, create, profile] = items as [Item, Item, Item, Item];


  const cell = (item: Item) => {
    const Icon = item.icon;
    const active = pathname === item.to;
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-label={item.label}
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          active ? "bg-foreground/20 text-foreground" : "text-foreground/60 hover:text-foreground"
        }`}
      >
        <Icon className="h-6 w-6" />
      </Link>
    );
  };

  return (
    <>
      <MiningStatusPill lang={lang} />
      <div
        style={{ bottom: "calc(12px + env(safe-area-inset-bottom))" }}
        className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      >
        {/* Real frosted glass: heavy blur + saturation over a barely-there tint,
            so the video underneath stays visible through the bar. */}
        <nav
          style={{ WebkitBackdropFilter: "blur(28px) saturate(180%)", backdropFilter: "blur(28px) saturate(180%)" }}
          className="pointer-events-auto flex items-center gap-1 rounded-full border border-foreground/15 bg-background/25 px-2 py-1.5 shadow-2xl"
        >
          {cell(home)}
          {cell(search)}
          {cell(create)}
          <NotificationCenter lang={lang} />
          {cell(profile)}
        </nav>
      </div>
    </>
  );
}
