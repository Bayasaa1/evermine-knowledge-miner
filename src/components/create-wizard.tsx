import { Bot, Brain, PhoneCall, Megaphone, Gamepad2, ChevronRight } from "lucide-react";

import {
  ACTIVE_CATEGORIES,
  CATEGORY_LABELS,
  type CreationCategory,
} from "@/lib/creation-category";
import { pickCopy, type Lang } from "@/lib/i18n";

const ICONS: Record<CreationCategory, typeof Brain> = {
  knowledge: Brain,
  robot: Bot,
  voice: PhoneCall,
  sales: Megaphone,
  gaming: Gamepad2,
};

const ORDER: CreationCategory[] = ACTIVE_CATEGORIES;

/**
 * The category list used in step 1 of the creator setup wizard.
 * `selected` highlights a current choice; without it every row is a plain pick.
 */
export function CategoryList({
  lang,
  onPick,
  selected,
}: {
  lang: Lang;
  onPick: (category: CreationCategory) => void;
  selected?: CreationCategory;
}) {
  return (
    <div className="grid gap-3">
      {ORDER.map((category) => {
        const Icon = ICONS[category];
        const copy = pickCopy(CATEGORY_LABELS[category], lang);
        const isSelected = selected === category;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onPick(category)}
            className={`group flex items-center gap-4 rounded-xl border p-4 text-left transition-colors ${
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/40 hover:border-primary/60 hover:bg-muted"
            }`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{copy.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{copy.sub}</span>
            </span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                isSelected ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
