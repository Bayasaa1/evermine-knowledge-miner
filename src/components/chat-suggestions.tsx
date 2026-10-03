import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getChatSuggestions, type ChatSuggestions as S } from "@/lib/chat-suggestions.functions";
import type { Lang } from "@/lib/i18n";

const T = {
  en: { intro: "Introduce yourself briefly", try: "Try asking:", topics: "Big topics", view: (t: string) => `What's your take on ${t}?` },
  mn: { intro: "Өөрийгөө товч танилцуулаач", try: "Ингэж асуугаад үзээрэй:", topics: "Гол сэдвүүд", view: (t: string) => `${t}-ийн талаар таны байр суурь юу вэ?` },
  ko: { intro: "간단히 자기소개 해주세요", try: "이렇게 물어보세요:", topics: "주요 주제", view: (t: string) => `${t}에 대한 당신의 생각은?` },
} as const;

/** Empty-chat starters: creator questions first, then opinion prompts from mined topics. Never AI-written. */
export function ChatSuggestions({ mindId, lang, onPick }: { mindId: string | null; lang: Lang; onPick: (q: string) => void }) {
  const fetchFn = useServerFn(getChatSuggestions);
  const [data, setData] = useState<S | null>(null);
  const t = T[(lang as keyof typeof T)] ?? T.en;
  useEffect(() => {
    if (!mindId) return;
    let live = true;
    fetchFn({ data: { mindId } }).then((r) => live && setData(r)).catch(() => {});
    return () => { live = false; };
  }, [mindId, fetchFn]);

  const themes = Array.from(new Set([...(data?.topics ?? []), ...(data?.tags ?? []).map((x) => x.replace(/^#/, ""))])).slice(0, 6);
  const chips = [
    ...(data?.creatorQuestions ?? []),
    ...themes.slice(0, 2).map(t.view),
    t.intro,
  ].slice(0, 5);

  return (
    <div className="space-y-3">
      {data?.greeting && <p className="rounded-xl bg-muted px-3 py-2 text-sm text-foreground">{data.greeting}</p>}
      {data?.bio && <p className="text-xs text-muted-foreground">{data.bio}</p>}
      {themes.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.topics}</p>
          <div className="flex flex-wrap gap-1.5">
            {themes.map((x) => (
              <button key={x} type="button" onClick={() => onPick(t.view(x))} className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted">#{x}</button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t.try}</p>
        <div className="flex flex-col items-start gap-1.5">
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => onPick(c)} className="rounded-xl border border-border px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted">{c}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
