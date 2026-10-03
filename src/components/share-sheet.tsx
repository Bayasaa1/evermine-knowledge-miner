import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Copy, Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { pickCopy, useLang } from "@/lib/i18n";
import { dmPartnerNames, listMyRooms, postMessage, type Room } from "@/lib/chat-rooms";

const COPY = {
  en: { title: "Share", toChat: "Send to a chat", none: "No chats yet — create one in Chats.", copy: "Copy link", copied: "Link copied", sent: "Sent", signIn: "Sign in to send to chats", other: "Share to apps" },
  mn: { title: "Хуваалцах", toChat: "Чат руу илгээх", none: "Чат алга — Чат хэсэгт үүсгэнэ үү.", copy: "Холбоос хуулах", copied: "Холбоос хуулагдлаа", sent: "Илгээгдлээ", signIn: "Чат руу илгээхийн тулд нэвтэрнэ үү", other: "Апп руу хуваалцах" },
  ko: { title: "공유", toChat: "채팅으로 보내기", none: "채팅이 없습니다 — 채팅에서 만드세요.", copy: "링크 복사", copied: "링크 복사됨", sent: "보냄", signIn: "채팅으로 보내려면 로그인하세요", other: "앱으로 공유" },
};

export function ShareSheet({ open, onClose, url, title }: { open: boolean; onClose: () => void; url: string; title: string }) {
  const { lang } = useLang();
  const t = pickCopy(COPY, lang);
  const { isAuthenticated, userId, profile } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isAuthenticated || !userId) return;
    setRooms(null);
    void listMyRooms()
      .then((rs) => {
        setRooms(rs);
        void dmPartnerNames(rs.filter((r) => r.kind === "dm").map((r) => r.id), userId).then(setNames);
      })
      .catch(() => setRooms([]));
  }, [open, isAuthenticated, userId]);

  if (!open) return null;
  const enc = encodeURIComponent;
  const apps = [
    { name: "Telegram", href: `https://t.me/share/url?url=${enc(url)}&text=${enc(title)}` },
    { name: "X", href: `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(title)}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
    { name: "WhatsApp", href: `https://wa.me/?text=${enc(`${title} ${url}`)}` },
  ];

  const sendTo = async (room: Room) => {
    setBusy(room.id);
    try {
      await postMessage(room.id, { body: `🎬 ${title}\n${url}`, authorName: profile?.displayName || "Me", sharedUrl: url });
      toast.success(t.sent);
      onClose();
      void navigate({ to: "/chats/$roomId", params: { roomId: room.id } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70" onClick={onClose}>
      <div className="max-h-[75vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <p className="mb-2 text-xs text-muted-foreground">{t.toChat}</p>
        {!isAuthenticated ? (
          <p className="mb-4 text-sm text-muted-foreground">{t.signIn}</p>
        ) : rooms === null ? (
          <Loader2 className="mb-4 h-5 w-5 animate-spin" />
        ) : rooms.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">{t.none}</p>
        ) : (
          <div className="mb-4 space-y-1">
            {rooms.map((r) => (
              <button key={r.id} type="button" disabled={!!busy} onClick={() => void sendTo(r)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm">
                <Users className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">{r.kind === "dm" ? names.get(r.id) ?? "…" : r.title}</span>
                {busy === r.id && <Loader2 className="h-4 w-4 animate-spin" />}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success(t.copied))}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold"
        >
          <Copy className="h-4 w-4" /> {t.copy}
        </button>

        <p className="mb-2 text-xs text-muted-foreground">{t.other}</p>
        <div className="grid grid-cols-4 gap-2">
          {apps.map((a) => (
            <a key={a.name} href={a.href} target="_blank" rel="noreferrer" className="rounded-xl border border-border bg-card px-2 py-2 text-center text-xs font-medium">{a.name}</a>
          ))}
        </div>
      </div>
    </div>
  );
}
