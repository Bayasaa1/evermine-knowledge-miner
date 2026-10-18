import { useEffect, useState } from "react";
import { Check, Copy, Send, Users, Globe, Plus, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { pickCopy, useLang } from "@/lib/i18n";
import { loadGraph, openDm, type Person } from "@/lib/friends";
import { addMind, removeMind, loadRoom, dmPartnerNames, listMyRooms, postMessage, type Room } from "@/lib/chat-rooms";
import { participantId, shareUrl, type ShareContent } from "@/lib/share-content";
import { SharedContentCard } from "@/components/chat/shared-content-card";

const COPY = {
  en: { title: "Share Evermind Content", direct: "Friends & chats", add: "Add to chat", external: "External", note: "Add a message…", friends: "Friends", rooms: "Recent chats", empty: "No matching friends or chats", send: "Send", sent: "Sent", drop: "Drop into chat room", added: "Mind added", undo: "Undo", copy: "Copy link", copied: "Link copied", system: "Device share", signin: "Sign in to share with friends and chats", search: "Find a friend or chat", confirm: "Add this Mind as a participant?", cancel: "Cancel", already: "Already in this chat", failed: "Could not load chats. Try again.", retry: "Try again" },
  mn: { title: "Evermind контент хуваалцах", direct: "Найзууд ба чат", add: "Чатад нэмэх", external: "Гадагш", note: "Мессеж нэмэх…", friends: "Найзууд", rooms: "Сүүлийн чатууд", empty: "Тохирох найз эсвэл чат алга", send: "Илгээх", sent: "Илгээгдлээ", drop: "Чатад Mind нэмэх", added: "Mind нэмэгдлээ", undo: "Буцаах", copy: "Холбоос хуулах", copied: "Холбоос хуулагдлаа", system: "Төхөөрөмжөөр хуваалцах", signin: "Найз болон чат руу илгээхийн тулд нэвтэрнэ үү", search: "Найз эсвэл чат хайх", confirm: "Энэ Mind-ийг чатад оролцогчоор нэмэх үү?", cancel: "Болих", already: "Энэ чатад байгаа", failed: "Чатууд ачаалагдсангүй. Дахин оролдоно уу.", retry: "Дахин оролдох" },
  ko: { title: "Evermind 콘텐츠 공유", direct: "친구와 채팅", add: "채팅에 추가", external: "외부 공유", note: "메시지 추가…", friends: "친구", rooms: "최근 채팅", empty: "일치하는 친구나 채팅 없음", send: "보내기", sent: "보냄", drop: "채팅방에 추가", added: "마인드 추가됨", undo: "실행 취소", copy: "링크 복사", copied: "링크 복사됨", system: "기기 공유", signin: "친구 및 채팅 공유를 위해 로그인하세요", search: "친구 또는 채팅 검색", confirm: "이 마인드를 참여자로 추가할까요?", cancel: "취소", already: "이미 참여 중", failed: "채팅을 불러오지 못했습니다", retry: "다시 시도" },
};

export function ShareModal({ open, onClose, content, targetRoomId }: { open: boolean; onClose: () => void; content: ShareContent; targetRoomId?: string }) {
  const { lang } = useLang(); const t = pickCopy(COPY, lang);
  const { isAuthenticated, userId, profile } = useAuth();
  const [tab, setTab] = useState("direct"); const [rooms, setRooms] = useState<Room[]>([]);
  const [friends, setFriends] = useState<Person[]>([]); const [names, setNames] = useState(new Map<string, string>());
  const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false); const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(""); const [sent, setSent] = useState<string[]>([]);
  const [note, setNote] = useState(""); const [query, setQuery] = useState(""); const [confirm, setConfirm] = useState<Room | null>(null);
  const [undoInvite, setUndoInvite] = useState<{ id: string; roomId: string } | null>(null);
  const mindId = participantId(content); const url = shareUrl(content.url);
  useEffect(() => {
    if (!open) return;
    setTab(targetRoomId ? "add" : "direct"); setSent([]); setNote(""); setQuery(""); setConfirm(null); setUndoInvite(null);
  }, [open, content.id, targetRoomId]);
  useEffect(() => {
    let live = true; setRooms([]); setFriends([]); setNames(new Map());
    if (!open || !isAuthenticated || !userId) return;
    setLoading(true); setFailed(false);
    void Promise.all([listMyRooms(), loadGraph()]).then(async ([rs, graph]) => {
      const dmNames = await dmPartnerNames(rs.filter((r) => r.kind === "dm").map((r) => r.id), userId);
      if (live) { setRooms(rs); setFriends(graph.friends.filter((f) => !graph.blocked.some((b) => b.id === f.id))); setNames(dmNames); }
    }).catch(() => { if (live) setFailed(true); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, isAuthenticated, userId, reload]);
  const send = async (key: string, roomId?: string, friendId?: string) => {
    setBusy(key);
    try {
      const id = roomId || (friendId ? await openDm(friendId) : "");
      if (!id) return;
      await postMessage(id, { body: note.trim(), authorName: profile?.displayName || "Me", attachment: { kind: "mind", mindId: content.mindId || `shared:${content.kind}:${content.id}`, name: content.title, share: { ...content, url } } });
      setSent((s) => [...s, key]); toast.success(t.sent);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  };
  const invite = async (room: Room) => {
    if (!mindId) return; setBusy(room.id);
    try {
      const current = await loadRoom(room.id);
      if (current.minds.some((m) => m.mind_id === mindId)) { toast.info(t.already); setConfirm(null); return; }
      await addMind(room.id, mindId, content.title, "debater", Math.max(-1, ...current.minds.map((m) => m.sort)) + 1);
      const updated = await loadRoom(room.id); const added = updated.minds.find((m) => m.mind_id === mindId);
      setSent((s) => [...s, `add:${room.id}`]); setConfirm(null);
      if (added) setUndoInvite({ id: added.id, roomId: room.id });
      toast.success(t.added, { action: added ? { label: t.undo, onClick: () => { void removeMind(added.id).then(() => setSent((s) => s.filter((k) => k !== `add:${room.id}`))).catch((e) => toast.error(e.message)); } } : undefined });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(""); }
  };
  const filter = (s: string) => s.toLowerCase().includes(query.toLowerCase());
  const roomName = (r: Room) => r.kind === "dm" ? names.get(r.id) || r.title : r.title;
  const roomList = rooms.filter((r) => filter(roomName(r)) && (tab !== "add" || (r.owner_id === userId && r.kind !== "dm" && (!targetRoomId || targetRoomId === r.id))));
  const row = (key: string, name: string, avatar: string | null, action: () => void, added = false) => <div key={key} className="flex items-center gap-3 border-b border-border py-3 last:border-0"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">{avatar ? <img src={shareUrl(avatar)} alt="" className="h-full w-full object-cover" /> : <Users className="h-4 w-4" />}</div><span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span><Button size="sm" variant={sent.includes(key) ? "secondary" : "outline"} disabled={!!busy || sent.includes(key)} onClick={action}>{busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : sent.includes(key) ? <Check className="h-4 w-4" /> : added ? <Plus className="h-4 w-4" /> : <Send className="h-4 w-4" />}{sent.includes(key) ? t.sent : added ? t.drop : t.send}</Button></div>;
  return <Dialog open={open} onOpenChange={(value) => { if (!value) onClose(); }}><DialogContent className="z-[100] max-h-[90dvh] w-[calc(100%-24px)] max-w-lg gap-0 overflow-hidden rounded-lg p-0" aria-describedby={undefined}>
    <div className="border-b border-border px-5 pb-4 pt-5 pr-12"><DialogTitle className="text-base">{t.title}</DialogTitle></div>
    <div className="max-h-[calc(90dvh-64px)] overflow-y-auto p-4">
      <SharedContentCard content={content} preview />
      {undoInvite && <div className="mt-3 flex items-center justify-between border-b border-border pb-3 text-sm"><span>{t.added}</span><Button variant="outline" size="sm" onClick={() => { const undo = undoInvite; void removeMind(undo.id).then(() => { setSent((s) => s.filter((k) => k !== `add:${undo.roomId}`)); setUndoInvite(null); }).catch((e) => toast.error(e.message)); }}>{t.undo}</Button></div>}
      <div role="tablist" className={`my-4 grid ${mindId ? "grid-cols-3" : "grid-cols-2"} border-b border-border`}>{[{ id: "direct", label: t.direct, icon: MessageCircle }, ...(mindId ? [{ id: "add", label: t.add, icon: Plus }] : []), { id: "external", label: t.external, icon: Globe }].map((item) => <Button role="tab" aria-selected={tab === item.id} key={item.id} variant={tab === item.id ? "secondary" : "ghost"} className="h-auto min-h-12 whitespace-normal rounded-none px-2 py-2 text-xs" onClick={() => { setTab(item.id); setConfirm(null); }}><item.icon className="h-4 w-4 shrink-0" />{item.label}</Button>)}</div>
      {tab === "external" ? <div className="space-y-3"><input readOnly value={url} aria-label={t.copy} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /><Button className="w-full" variant="outline" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success(t.copied)).catch((e) => toast.error(e.message))}><Copy className="h-4 w-4" />{t.copy}</Button><Button className="w-full" onClick={() => { if (navigator.share) void navigator.share({ title: content.title, url }).catch((e) => { if (e.name !== "AbortError") toast.error(e.message); }); else void navigator.clipboard.writeText(url).then(() => toast.success(t.copied)).catch((e) => toast.error(e.message)); }}><Globe className="h-4 w-4" />{t.system}</Button></div> : !isAuthenticated ? <p className="py-5 text-sm text-muted-foreground">{t.signin}</p> : <>
        {tab === "direct" && <textarea aria-label={t.note} placeholder={t.note} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={2} className="mb-3 w-full resize-none rounded-md border border-input bg-background p-3 text-sm" />}
        <input aria-label={t.search} placeholder={t.search} value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div> : failed ? <div className="py-4 text-sm">{t.failed}<Button variant="ghost" onClick={() => setReload((v) => v + 1)}>{t.retry}</Button></div> : <>
          {tab === "direct" && friends.some((f) => filter(f.name)) && <><h3 className="mt-4 text-xs font-semibold text-muted-foreground">{t.friends}</h3>{friends.filter((f) => filter(f.name)).map((f) => row(`friend:${f.id}`, f.name, f.avatar, () => void send(`friend:${f.id}`, undefined, f.id)))}</>}
          {!!roomList.length && <h3 className="mt-4 text-xs font-semibold text-muted-foreground">{t.rooms}</h3>}{roomList.map((r) => row(tab === "add" ? `add:${r.id}` : r.id, roomName(r), null, () => tab === "add" ? setConfirm(r) : void send(r.id, r.id), tab === "add"))}
          {!roomList.length && (tab !== "direct" || !friends.some((f) => filter(f.name))) && <p className="py-6 text-sm text-muted-foreground">{t.empty}</p>}
          {confirm && <div className="mt-4 border-t border-border pt-4"><p className="text-sm font-medium">{t.confirm}</p><p className="mt-1 text-sm text-muted-foreground">{content.title} → {confirm.title}</p><div className="mt-3 flex gap-2"><Button disabled={!!busy} onClick={() => void invite(confirm)}><Plus className="h-4 w-4" />{t.add}</Button><Button variant="ghost" onClick={() => setConfirm(null)}>{t.cancel}</Button></div></div>}
        </>}
      </>}
    </div>
  </DialogContent></Dialog>;
}