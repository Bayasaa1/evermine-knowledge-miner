import { useState } from "react";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareModal } from "@/components/share-modal";
import { pickCopy, useLang } from "@/lib/i18n";
import type { ShareContent } from "@/lib/share-content";

export function ShareTrigger({ content }: { content: ShareContent }) {
  const [open, setOpen] = useState(false); const { lang } = useLang();
  const label = pickCopy({ en: "Share", mn: "Хуваалцах", ko: "공유" }, lang);
  return <><Button variant="outline" size="sm" aria-label={`${label}: ${content.title}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }}><Share2 className="h-4 w-4" />{label}</Button>{open && <ShareModal open={open} onClose={() => setOpen(false)} content={content} />}</>;
}