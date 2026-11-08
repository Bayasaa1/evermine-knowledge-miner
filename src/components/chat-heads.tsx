import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pickCopy, useLang } from "@/lib/i18n";

/** Messenger-style minimized chats: small round bubbles bottom-right. */
type Head = { id: string; title: string };
const KEY = "evermind.chatHeads";
const EVT = "evermind-chat-heads";

function read(): Head[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]") as Head[]; } catch { return []; }
}
function write(list: Head[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 6)));
  window.dispatchEvent(new Event(EVT));
}
export function rememberChatHead(h: Head) {
  write([h, ...read().filter((x) => x.id !== h.id)]);
}

export function ChatHeads() {
  const { lang } = useLang();
  const closeLabel = pickCopy({ en: "Close minimized chat", mn: "Жижигрүүлсэн чатыг хаах", ko: "최소화된 채팅 닫기" }, lang);
  const [heads, setHeads] = useState<Head[]>([]);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const sync = () => setHeads(read());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(EVT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const shown = heads.filter((h) => path !== `/chats/${h.id}`);
  if (!shown.length) return null;
  return (
    <div className="fixed bottom-20 right-3 z-40 flex flex-col-reverse gap-2">
      {shown.map((h) => (
        <div key={h.id} className="group relative">
          <Link to="/chats/$roomId" params={{ roomId: h.id }} title={h.title} aria-label={h.title} className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-background bg-primary text-lg font-bold text-primary-foreground shadow-lg">
            {(h.title.trim()[0] || "💬").toUpperCase()}
          </Link>
          <Button type="button" variant="secondary" size="icon-sm" aria-label={closeLabel} title={closeLabel} onClick={() => write(read().filter((x) => x.id !== h.id))} className="absolute -right-2 -top-2 flex rounded-full border border-background shadow">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
