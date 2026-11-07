import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { X } from "lucide-react";

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
          <button type="button" aria-label="Close" onClick={() => write(read().filter((x) => x.id !== h.id))} className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground shadow group-hover:flex">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
