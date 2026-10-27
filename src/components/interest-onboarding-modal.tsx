import { useState } from "react";
import { INTEREST_GROUPS, MIN_INTERESTS } from "@/lib/feed-interests";
import { useLang } from "@/lib/i18n";

const COPY = {
  en: { title: "What are you into?", sub: "Pick 3 or more to tune your feed", go: "Tune my feed", skip: "Skip" },
  mn: { title: "Танд юу сонирхолтой вэ?", sub: "Фийдээ тохируулахын тулд 3 ба түүнээс дээш сонго", go: "Фийдээ тохируулах", skip: "Алгасах" },
  ko: { title: "어떤 것에 관심 있나요?", sub: "피드를 맞추려면 3개 이상 선택하세요", go: "내 피드 맞추기", skip: "건너뛰기" },
};

export function InterestOnboardingModal({
  initial = [],
  onSave,
  onClose,
}: {
  initial?: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const l = (lang === "mn" || lang === "ko" ? lang : "en") as "en" | "mn" | "ko";
  const c = COPY[l];
  const [picked, setPicked] = useState<string[]>(initial);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const ready = picked.length >= MIN_INTERESTS;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-3xl">
        <div className="p-5 pb-2">
          <h2 className="text-2xl font-bold">{c.title}</h2>
          <p className="text-sm text-muted-foreground">{c.sub}</p>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-2">
          {INTEREST_GROUPS.map((g) => (
            <section key={g.category}>
              <h3 className="mb-2 text-sm font-semibold">
                {g.emoji} {g.label[l]}
              </h3>
              <div className="flex flex-wrap gap-2">
                {g.tags.map((tag) => {
                  const on = picked.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggle(tag.id)}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted text-foreground hover:border-primary"
                      }`}
                    >
                      {tag.emoji} {tag.label[l]}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-border p-4">
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground">
            {c.skip}
          </button>
          <span className="ml-auto text-sm text-muted-foreground">
            {picked.length}/{MIN_INTERESTS}
          </span>
          <button
            type="button"
            disabled={!ready}
            onClick={() => onSave(picked)}
            className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground disabled:opacity-40"
          >
            {c.go}
          </button>
        </div>
      </div>
    </div>
  );
}
