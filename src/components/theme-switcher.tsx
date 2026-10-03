import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme, type ThemeChoice } from "@/hooks/use-theme";
import { pickCopy, useLang } from "@/lib/i18n";

const COPY = {
  en: { title: "Appearance", sub: "Choose how Evermind looks", light: "Light", dark: "Dark", system: "Auto" },
  mn: { title: "Гадаад төрх", sub: "Аппын өнгийг сонгоно уу", light: "Гэгээлэг", dark: "Бараан", system: "Автомат" },
  ko: { title: "화면 테마", sub: "Evermind의 모양을 선택하세요", light: "라이트", dark: "다크", system: "자동" },
};

const OPTIONS: { id: ThemeChoice; Icon: typeof Sun }[] = [
  { id: "light", Icon: Sun },
  { id: "dark", Icon: Moon },
  { id: "system", Icon: Monitor },
];

export function ThemeSwitcher() {
  const { lang } = useLang();
  const t = pickCopy(COPY, lang);
  const { theme, setTheme } = useTheme();

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{t.title}</p>
      <p className="text-xs text-muted-foreground">{t.sub}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {OPTIONS.map(({ id, Icon }) => {
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-colors ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2.2} />
              {t[id]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
