import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getChatSuggestions, type ChatSuggestions as S } from "@/lib/chat-suggestions.functions";
import { ChatDisplayText } from "@/components/chat-display-text";
import { Button } from "@/components/ui/button";
import type { Lang } from "@/lib/i18n";
import { topicSuggestions, type ConversationTurn, type TopicFocus } from "@/lib/topic-conversation";

/**
 * Messenger-style quick replies: right-aligned bubbles, one tap sends.
 * Every topic opens before it develops or concludes. Never AI-written.
 */
export function ChatSuggestions({
  mindId, lang, onPick, used = [], compact = false, messages = [], focus,
}: { mindId: string | null; lang: Lang; onPick: (q: string, topic?: string) => void; used?: string[]; compact?: boolean; messages?: ConversationTurn[]; focus?: TopicFocus }) {
  const fetchFn = useServerFn(getChatSuggestions);
  const [data, setData] = useState<S | null>(null);
  useEffect(() => {
    setData(null);
    if (!mindId) return;
    let live = true;
    fetchFn({ data: { mindId } }).then((r) => live && setData(r)).catch(() => {});
    return () => { live = false; };
  }, [mindId, fetchFn]);

  const themes = Array.from(new Set([...(data?.topics ?? []), ...(data?.tags ?? []).map((x) => x.replace(/^#/, ""))]));
  const asked = new Set(used.map((u) => u.trim()));
  const chips = topicSuggestions({ turns: messages, topics: themes, lang, focus, creatorQuestions: data?.creatorQuestions })
    .filter((c) => !asked.has(c.text.trim()))
    .slice(0, compact ? 3 : 5);

  return (
    <div className="space-y-3">
      {!compact && !focus && data?.greeting && (
        <div className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm text-foreground"><ChatDisplayText text={data.greeting} lang={lang} /></div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-col items-end gap-2">
          {chips.map((c) => (
            <ChatDisplayText key={c.text} text={c.text} lang={lang} controls={false}>{(shown) => asked.has(shown.trim()) ? null : <Button
              type="button"
              variant="ghost"
              onClick={() => onPick(shown, c.topic)}
              className="h-auto max-w-full whitespace-normal items-center gap-2 rounded-2xl bg-primary/15 px-4 py-2 text-right text-sm font-normal text-foreground transition-colors hover:bg-primary/25"
            >
              <span>{shown}</span>
              <Send className="h-4 w-4 shrink-0 text-primary" />
            </Button>}</ChatDisplayText>
          ))}
        </div>
      )}
    </div>
  );
}
