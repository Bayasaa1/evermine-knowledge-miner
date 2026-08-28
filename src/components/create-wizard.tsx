import { useNavigate } from "@tanstack/react-router";
import { Bot, Brain, PhoneCall, Megaphone, X, ChevronRight } from "lucide-react";

import {
  CATEGORY_LABELS,
  setCreationCategory,
  type CreationCategory,
} from "@/lib/creation-category";
import { pickCopy, type Lang } from "@/lib/i18n";

const ICONS: Record<CreationCategory, typeof Brain> = {
  knowledge: Brain,
  robot: Bot,
  voice: PhoneCall,
  sales: Megaphone,
};

const ORDER: CreationCategory[] = ["knowledge", "robot", "voice", "sales"];

/** Categorized AI Creation Wizard opened from the unified "+" hub. */
export function CreateWizard({
  open,
  onClose,
  lang = "en",
}: {
  open: boolean;
  onClose: () => void;
  lang?: Lang;
}) {
  const navigate = useNavigate();
  if (!open) return null;

  const choose = (category: CreationCategory) => {
    setCreationCategory(category);
    onClose();
    void navigate({ to: "/creator" });
  };

  return (
    <div className="dark fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-lg rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {pickCopy(
                { en: "What are you creating today?", mn: "Өнөөдөр юу бүтээх вэ?", ko: "오늘은 무엇을 만들어 볼까요?" },
                lang,
              )}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {pickCopy(
                {
                  en: "Your choice sets the mining schema used on your video.",
                  mn: "Сонголт нь олборлолтын схемийг тодорхойлно.",
                  ko: "선택한 항목에 따라 영상 분석 스키마가 결정됩니다.",
                },
                lang,
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3">
          {ORDER.map((category) => {
            const Icon = ICONS[category];
            const copy = pickCopy(CATEGORY_LABELS[category], lang);
            return (
              <button
                key={category}
                type="button"
                onClick={() => choose(category)}
                className="group flex items-center gap-4 rounded-xl border border-border bg-muted/40 p-4 text-left transition-colors hover:border-primary/60 hover:bg-muted"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{copy.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{copy.sub}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
