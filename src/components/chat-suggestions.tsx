import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getChatSuggestions, type ChatSuggestions as S } from "@/lib/chat-suggestions.functions";
import type { Lang } from "@/lib/i18n";

const T = {
  en: { intro: "Introduce yourself briefly", view: (t: string) => `What's your take on ${t}?` },
  mn: { intro: "Өөрийгөө товч танилцуулаач", view: (t: string) => `${t}-ийн талаар таны байр суурь юу вэ?` },
  ko: { intro: "간단히 자기소개 해주세요", view: (t: string) => `${t}에 대한 당신의 생각은?` },
} as const;

/**
 * Messenger-style quick replies: right-aligned bubbles, one tap sends.
 * Creator questions first, then opinion prompts from mined topics. Never AI-written.
 */
export function ChatSuggestions({
  mindId, lang, onPick, used = [], compact = false,
}: { mindId: string | null; lang: Lang; onPick: (q: string) => void; used?: string[]; compact?: boolean }) {
  const fetchFn = useServerFn(getChatSuggestions);
  const [data, setData] = useState<S | null>(null);
  const t = T[(lang as keyof typeof T)] ?? T.en;
  useEffect(() => {
    if (!mindId) return;
    let live = true;
    fetchFn({ data: { mindId } }).then((r) => live && setData(r)).catch(() => {});
    return () => { live = false; };
  }, [mindId, fetchFn]);

  const themes = Array.from(new Set([...(data?.topics ?? []), ...(data?.tags ?? []).map((x) => x.replace(/^#/, ""))]));
  const asked = new Set(used.map((u) => u.trim()));
  const chips = Array.from(new Set([...(data?.creatorQuestions ?? []), ...themes.map(t.view), t.intro]))
    .filter((c) => !asked.has(c.trim()))
    .slice(0, compact ? 3 : 5);

  return (
    <div className="space-y-3">
      {!compact && data?.greeting && (
        <div className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground">{data.greeting}</div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-col items-end gap-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPick(c)}
              className="flex max-w-[85%] items-center gap-2 rounded-2xl bg-primary/15 px-4 py-2 text-right text-sm text-foreground transition-colors hover:bg-primary/25"
            >
              <span>{c}</span>
              <Send className="h-4 w-4 shrink-0 text-primary" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
