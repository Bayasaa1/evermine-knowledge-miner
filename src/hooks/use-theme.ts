import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "evermind-theme";

/** Inline script run before paint so the page never flashes the wrong colors. */
export const THEME_BOOT_SCRIPT = `(function(){try{var c=localStorage.getItem('${KEY}')||'dark';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'#000000':'#fafafa');}catch(e){}})();`;

function apply(choice: ThemeChoice) {
  const dark =
    choice === "dark" ||
    (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#000000" : "#fafafa");
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as ThemeChoice | null) ?? "dark";
    setChoice(saved);
  }, []);

  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  const setTheme = (c: ThemeChoice) => {
    localStorage.setItem(KEY, c);
    setChoice(c);
    apply(c);
  };

  return { theme: choice, setTheme };
}
