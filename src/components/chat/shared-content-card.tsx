import { Bot, Play, Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pickCopy, useLang } from "@/lib/i18n";
import { participantId, shareUrl, type ShareContent } from "@/lib/share-content";

const COPY = {
  en: { watch: "Watch / Mine", talk: "Talk to Mind", add: "Add to this chat" },
  mn: { watch: "Үзэх / Ухах", talk: "Mind-тай ярилцах", add: "Энэ чатад нэмэх" },
  ko: { watch: "보기 / 마이닝", talk: "마인드와 대화", add: "이 채팅에 추가" },
};

export function SharedContentCard({ content, onMind, onAdd, preview = false }: { content: ShareContent; onMind?: (id: string) => void; onAdd?: (content: ShareContent) => void; preview?: boolean }) {
  const { lang } = useLang();
  const t = pickCopy(COPY, lang);
  const url = shareUrl(content.url);
  const image = content.image ? shareUrl(content.image) : "";
  const mindId = participantId(content);
  return <div className="w-full min-w-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
    {content.kind === "video" && image && <img src={image} alt="" loading="lazy" className="aspect-video w-full object-cover" />}
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-3">
        {content.kind !== "video" && <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">{image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Bot className="h-5 w-5" />}</div>}
        <div className="min-w-0 flex-1"><div className="break-words text-sm font-semibold">{content.title}</div><div className="break-words text-xs text-muted-foreground">{content.creator}{content.handle && ` · ${content.handle}`}</div></div>
      </div>
      {!!content.topics?.length && <div className="flex flex-wrap gap-1">{content.topics.slice(0, 3).map((topic, i) => <span key={i} className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{topic}</span>)}</div>}
      {!preview && <div className="flex flex-wrap gap-2">
        {content.kind === "video" ? url && <Button asChild size="sm" variant="secondary"><a href={url} target="_blank" rel="noopener noreferrer"><Play className="h-4 w-4" />{t.watch}<ArrowUpRight className="h-3 w-3" /></a></Button> : mindId && <Button size="sm" variant="secondary" onClick={() => onMind?.(mindId)}><Bot className="h-4 w-4" />{t.talk}</Button>}
        {mindId && onAdd && <Button size="sm" variant="outline" onClick={() => onAdd(content)}><Plus className="h-4 w-4" />{t.add}</Button>}
      </div>}
    </div>
  </div>;
}