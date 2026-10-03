import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Copy, Download, Loader2, Pause, Play, Send, Settings, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { useLang, pickCopy } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  addMind, askMind, deleteMessage, deleteRoom, exportRoom, leaveRoom, listInvitableMinds, loadRoom, markRead,
  pickSpeakers, postMessage, removeMember, removeMind, setMemberRole, setMindRole, updateRoom,
  type MindRole, type Room, type RoomMember, type RoomMind, type RoomMessage,
} from "@/lib/chat-rooms";

export const Route = createFileRoute("/chats/$roomId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Chat room — Evermind" },
      { name: "description", content: "A private Evermind room where friends and AI Minds talk together." },
      { property: "og:title", content: "Chat room — Evermind" },
      { property: "og:description", content: "Friends and AI Minds in one private room." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoomPage,
});

const COPY = {
  en: { say: "Message… (@Name calls a Mind)", settings: "Room settings", people: "People", minds: "Minds", addMind: "Add a Mind", invite: "Invite link", copy: "Copied", mode: "Who speaks", mention: "Only when @called", round: "Round-table (each in turn)", relevance: "Most relevant one", turns: "Max Minds per round", del: "Delete group", delConfirm: "Delete this group and all its messages for everyone?", leave: "Leave group", pause: "Pause", resume: "Continue", next: "Next round", thinking: "is thinking…", makeAdmin: "Make admin", makeMember: "Make member", remove: "Remove", notFound: "This room does not exist or you are not a member.", roles: { debater: "🥊 Debater", judge: "⚖️ Judge", admin: "🛡 Host", twin: "🪞 Creator twin" } },
  mn: { say: "Мессеж… (@Нэр гэж Mind дуудна)", settings: "Өрөөний тохиргоо", people: "Хүмүүс", minds: "Mind-ууд", addMind: "Mind нэмэх", invite: "Урилгын холбоос", copy: "Хуулагдлаа", mode: "Хэн ярих вэ", mention: "Зөвхөн @дуудахад", round: "Дугуй ширээ (ээлжээр)", relevance: "Хамгийн хамааралтай нь", turns: "Нэг ээлжинд хамгийн ихдээ", del: "Бүлгийг устгах", delConfirm: "Энэ бүлэг болон бүх мессежийг бүгдэд нь устгах уу?", leave: "Бүлгээс гарах", pause: "Түр зогсоох", resume: "Үргэлжлүүлэх", next: "Дараагийн ээлж", thinking: "бодож байна…", makeAdmin: "Админ болгох", makeMember: "Гишүүн болгох", remove: "Хасах", notFound: "Энэ өрөө байхгүй эсвэл та гишүүн биш байна.", roles: { debater: "🥊 Мэтгэлцэгч", judge: "⚖️ Шүүгч", admin: "🛡 Хөтлөгч", twin: "🪞 Бүтээгчийн ихэр" } },
  ko: { say: "메시지… (@이름으로 마인드 호출)", settings: "방 설정", people: "사람", minds: "마인드", addMind: "마인드 추가", invite: "초대 링크", copy: "복사됨", mode: "누가 말할까", mention: "@호출 시에만", round: "라운드테이블 (차례로)", relevance: "가장 관련 있는 하나", turns: "라운드당 최대", del: "그룹 삭제", delConfirm: "이 그룹과 모든 메시지를 삭제할까요?", leave: "그룹 나가기", pause: "일시정지", resume: "계속", next: "다음 라운드", thinking: "생각 중…", makeAdmin: "관리자로", makeMember: "멤버로", remove: "제거", notFound: "방이 없거나 멤버가 아닙니다.", roles: { debater: "🥊 토론자", judge: "⚖️ 심판", admin: "🛡 진행자", twin: "🪞 크리에이터 트윈" } },
};

function RoomPage() {
  const { roomId } = Route.useParams();
  const { lang } = useLang();
  const t = pickCopy(COPY, lang);
  const { userId, profile } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [minds, setMinds] = useState<RoomMind[]>([]);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [queue, setQueue] = useState<RoomMind[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [invitable, setInvitable] = useState<{ mindId: string; name: string; kind: "persona" | "project" }[]>([]);
  const pausedRef = useRef(false);
  const msgsRef = useRef<RoomMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  msgsRef.current = messages;

  const reload = useCallback(async () => {
    const r = await loadRoom(roomId);
    setRoom(r.room);
    setMembers(r.members);
    setMinds(r.minds);
    setMessages(r.messages);
    setLoaded(true);
    void markRead(roomId);
  }, [roomId]);

  useEffect(() => {
    void reload();
    const ch = supabase
      .channel(`room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_messages", filter: `room_id=eq.${roomId}` }, () => {
        void loadRoom(roomId).then((r) => setMessages(r.messages));
        void markRead(roomId);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [roomId, reload]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages.length, speaking]);

  const me = members.find((m) => m.user_id === userId);
  const isAdmin = me?.role === "owner" || me?.role === "admin";
  const isOwner = me?.role === "owner";

  /** Let Minds speak one after another; pausing stops before the next one. */
  const runQueue = async (list: RoomMind[]) => {
    let rest = [...list];
    while (rest.length) {
      if (pausedRef.current) break;
      const mind = rest[0]!;
      setSpeaking(mind.mind_name);
      try {
        const text = await askMind(mind, msgsRef.current, lang);
        await postMessage(roomId, { body: text, authorName: mind.mind_name, kind: "mind", mindId: mind.mind_id });
        const r = await loadRoom(roomId);
        setMessages(r.messages);
        msgsRef.current = r.messages;
      } catch (e) {
        toast.error(`${mind.mind_name}: ${(e as Error).message}`);
        rest = [];
        break;
      }
      rest = rest.slice(1);
    }
    setQueue(rest);
    setSpeaking(null);
  };

  const send = async () => {
    const body = input.trim();
    if (!body || !room) return;
    setInput("");
    try {
      const url = body.match(/https?:\/\/\S+/)?.[0] ?? null;
      await postMessage(roomId, { body, authorName: me?.display_name || profile?.displayName || "Me", sharedUrl: url });
      const r = await loadRoom(roomId);
      setMessages(r.messages);
      msgsRef.current = r.messages;
      const speakers = pickSpeakers(body, minds, room.debate_mode, room.turn_limit);
      if (speakers.length) {
        pausedRef.current = false;
        setPaused(false);
        await runQueue(speakers);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!loaded) return <main className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin" /></main>;
  if (!room || !me) {
    return (
      <main className="min-h-screen bg-background p-6 text-foreground">
        <Link to="/chats" className="inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" /> Chats</Link>
        <p className="mt-6 text-sm text-muted-foreground">{t.notFound}</p>
      </main>
    );
  }

  const panelMinds = minds.filter((m) => m.role !== "judge");

  return (
    <main className="flex h-[100dvh] flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        <Link to="/chats" aria-label="Back" className="p-2"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{room.title}</div>
          <div className="text-xs text-muted-foreground">👥 {members.length} · 🤖 {minds.length}</div>
        </div>
        <button aria-label={t.settings} onClick={() => { setShowSettings(true); void listInvitableMinds().then(setInvitable); }} className="p-2"><Settings className="h-5 w-5" /></button>
      </header>

      {minds.length > 1 && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
          {speaking ? (
            <button onClick={() => { pausedRef.current = true; setPaused(true); }} className="flex items-center gap-1 rounded-full border border-border px-3 py-1"><Pause className="h-3 w-3" /> {t.pause}</button>
          ) : queue.length && paused ? (
            <button onClick={() => { pausedRef.current = false; setPaused(false); void runQueue(queue); }} className="flex items-center gap-1 rounded-full border border-border px-3 py-1"><Play className="h-3 w-3" /> {t.resume} ({queue.length})</button>
          ) : (
            <button
              onClick={() => { pausedRef.current = false; setPaused(false); const j = minds.find((m) => m.role === "judge"); void runQueue([...panelMinds.slice(0, room.turn_limit), ...(j ? [j] : [])]); }}
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1"
            >
              <Play className="h-3 w-3" /> {t.next}
            </button>
          )}
          <span className="text-muted-foreground">{minds.map((m) => m.mind_name).join(" · ")}</span>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.map((m) => {
          const mine = m.sender_kind === "user" && m.sender_user_id === userId;
          return (
            <div key={m.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : m.sender_kind === "mind" ? "border border-border bg-card" : "bg-muted"}`}>
                {!mine && <div className="mb-0.5 flex items-center gap-1 text-xs font-semibold opacity-80">{m.sender_kind === "mind" && <Bot className="h-3 w-3" />}{m.author_name}</div>}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                {(m.sender_user_id === userId || isAdmin) && (
                  <button aria-label={t.remove} onClick={() => void deleteMessage(m.id).then(reload).catch((e) => toast.error(e.message))} className="mt-1 hidden text-xs opacity-60 group-hover:inline"><Trash2 className="inline h-3 w-3" /></button>
                )}
              </div>
            </div>
          );
        })}
        {speaking && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> {speaking} {t.thinking}</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.say} className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
        <button type="submit" disabled={!input.trim() || !!speaking} aria-label="Send" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </form>

      {showSettings && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-4">
          <div className="mx-auto max-w-xl space-y-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{t.settings}</h2><button onClick={() => setShowSettings(false)} aria-label="Close"><X className="h-5 w-5" /></button></div>

            {isAdmin && (
              <>
                <input defaultValue={room.title} onBlur={(e) => e.target.value.trim() && e.target.value !== room.title && void updateRoom(room.id, { title: e.target.value.trim() }).then(reload)} className="w-full rounded-xl border border-border bg-background px-3 py-2" />
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{t.invite}</div>
                  <button onClick={() => { void navigator.clipboard.writeText(room.invite_code); toast.success(t.copy); }} className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 font-mono text-sm">{room.invite_code}<Copy className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="space-y-1"><span className="font-semibold">{t.mode}</span>
                    <select value={room.debate_mode} onChange={(e) => void updateRoom(room.id, { debate_mode: e.target.value }).then(reload)} className="w-full rounded-xl border border-border bg-background px-2 py-2">
                      <option value="mention">{t.mention}</option><option value="round">{t.round}</option><option value="relevance">{t.relevance}</option>
                    </select>
                  </label>
                  <label className="space-y-1"><span className="font-semibold">{t.turns}</span>
                    <select value={room.turn_limit} onChange={(e) => void updateRoom(room.id, { turn_limit: Number(e.target.value) }).then(reload)} className="w-full rounded-xl border border-border bg-background px-2 py-2">
                      {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                </div>
              </>
            )}

            <section className="space-y-2">
              <div className="text-sm font-semibold">{t.minds}</div>
              {minds.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{m.mind_name}</span>
                  <select disabled={!isAdmin} value={m.role} onChange={(e) => void setMindRole(m.id, e.target.value as MindRole).then(reload)} className="rounded-lg border border-border bg-background px-1 py-1 text-xs">
                    {(Object.keys(t.roles) as MindRole[]).map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                  </select>
                  {isAdmin && <button aria-label={t.remove} onClick={() => void removeMind(m.id).then(reload)}><Trash2 className="h-4 w-4" /></button>}
                </div>
              ))}
              {isAdmin && (
                <select value="" onChange={(e) => { const p = invitable.find((x) => x.mindId === e.target.value); if (p) void addMind(room.id, p.mindId, p.name, "debater", minds.length).then(reload).catch((err) => toast.error(err.message)); }} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <option value="">+ {t.addMind}</option>
                  <optgroup label={lang === "mn" ? "👤 Бүтээгч (бүх төсөл)" : lang === "ko" ? "👤 크리에이터 (모든 프로젝트)" : "👤 Creator (all projects)"}>
                    {invitable.filter((p) => p.kind === "persona" && !minds.some((m) => m.mind_id === p.mindId)).map((p) => <option key={p.mindId} value={p.mindId}>{p.name}</option>)}
                  </optgroup>
                  <optgroup label={lang === "mn" ? "📁 Төсөл" : lang === "ko" ? "📁 프로젝트" : "📁 Project"}>
                    {invitable.filter((p) => p.kind === "project" && !minds.some((m) => m.mind_id === p.mindId)).map((p) => <option key={p.mindId} value={p.mindId}>{p.name}</option>)}
                  </optgroup>
                </select>
              )}
            </section>

            <section className="space-y-2">
              <div className="text-sm font-semibold">{t.people}</div>
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{m.display_name || "—"} <span className="text-xs text-muted-foreground">({m.role})</span></span>
                  {isOwner && m.role !== "owner" && (
                    <button onClick={() => void setMemberRole(m.id, m.role === "admin" ? "member" : "admin").then(reload)} className="rounded-full border border-border px-2 py-0.5 text-xs">{m.role === "admin" ? t.makeMember : t.makeAdmin}</button>
                  )}
                  {isAdmin && m.role !== "owner" && m.user_id !== userId && (
                    <button aria-label={t.remove} onClick={() => void removeMember(m.id).then(reload)}><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
            </section>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => exportRoom(room, messages, "md")} className="flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm"><Download className="h-4 w-4" /> MD</button>
              <button onClick={() => exportRoom(room, messages, "json")} className="flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm"><Download className="h-4 w-4" /> JSON</button>
              {!isOwner && <button onClick={() => void leaveRoom(room.id).then(() => navigate({ to: "/chats" }))} className="rounded-full border border-border px-3 py-2 text-sm">{t.leave}</button>}
              {isOwner && (
                <button onClick={() => { if (confirm(t.delConfirm)) void deleteRoom(room.id).then(() => navigate({ to: "/chats" })).catch((e) => toast.error(e.message)); }} className="rounded-full border border-destructive px-3 py-2 text-sm text-destructive">{t.del}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
