import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, Copy, Download, ImagePlus, Loader2, Paperclip, Pause, Play, Send, Settings, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { useLang, pickCopy } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { ChatDisplayText } from "@/components/chat-display-text";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RoomAvatar, RoomMedia, SharedLink } from "@/components/chat/room-media";
import { ModeratorBar } from "@/components/chat/moderator-bar";
import { TalkToMindModal } from "@/components/talk-to-mind-modal";
import { ShareModal } from "@/components/share-modal";
import type { ShareContent } from "@/lib/share-content";
import { loadGraph, type Person } from "@/lib/friends";
import { automaticRepliesAllowed, pendingQuestions, transcriptForQuestion } from "@/lib/room-turns";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  addRoomFriend, claimRoomTurn, finishRoomTurn, completeRoomQuestion, uploadRoomMedia,
  addMind, askMind, deleteMessage, deleteRoom, exportRoom, leaveRoom, listInvitableMinds, loadRoom, markRead,
  pickSpeakers, postMessage, removeMember, removeMind, setMemberRole, setMindRole, updateRoom,
  type RoomAttachment, type MindRole, type Room, type RoomMember, type RoomMind, type RoomMessage,
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

const EXTRA = {
  en: { moderator: "Moderator Mode", queued: "Queued", order: "Order", done: "Next question", waiting: "No queued messages", addFriend: "Add Friend", avatar: "Change group photo", save: "Save name", attach: "Share photo / video", shareMind: "Share a Mind", open: "Open source", name: "Room name", removeAvatar: "Remove photo", noFriends: "No available mutual friends", failed: "Could not save changes", cancel: "Cancel" },
  mn: { moderator: "Хөтлөгчийн горим", queued: "Хүлээгдэж буй", order: "Дараалал", done: "Дараагийн асуулт", waiting: "Хүлээгдэж буй мессеж алга", addFriend: "Найз нэмэх", avatar: "Бүлгийн зураг солих", save: "Нэр хадгалах", attach: "Зураг / видео илгээх", shareMind: "Mind хуваалцах", open: "Эх сурвалж нээх", name: "Өрөөний нэр", removeAvatar: "Зураг арилгах", noFriends: "Нэмэх харилцан найз алга", failed: "Өөрчлөлт хадгалагдсангүй", cancel: "Болих" },
  ko: { moderator: "진행자 모드", queued: "대기 중", order: "순서", done: "다음 질문", waiting: "대기 중인 메시지 없음", addFriend: "친구 추가", avatar: "그룹 사진 변경", save: "이름 저장", attach: "사진 / 동영상 공유", shareMind: "마인드 공유", open: "원본 열기", name: "방 이름", removeAvatar: "사진 제거", noFriends: "추가할 상호 친구 없음", failed: "변경사항 저장 실패", cancel: "취소" },
};

function RoomPage() {
  const { roomId } = Route.useParams();
  const { lang } = useLang();
  const t = pickCopy(COPY, lang);
  const x = pickCopy(EXTRA, lang);
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
  const [friends, setFriends] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [attachment, setAttachment] = useState<RoomAttachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [openMind, setOpenMind] = useState<string | null>(null);
  const [sharingMind, setSharingMind] = useState(false);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
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
    void reload().catch((e) => { toast.error(e.message); setLoaded(true); });
    const ch = supabase
      .channel(`room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_messages", filter: `room_id=eq.${roomId}` }, () => {
        void loadRoom(roomId).then((r) => setMessages(r.messages));
        void markRead(roomId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_rooms", filter: `id=eq.${roomId}` }, () => { void reload().catch((e) => toast.error(e.message)); })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_members", filter: `room_id=eq.${roomId}` }, () => { void reload().catch((e) => toast.error(e.message)); })
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_room_minds", filter: `room_id=eq.${roomId}` }, () => { void reload().catch((e) => toast.error(e.message)); })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [roomId, reload]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages.length, speaking]);

  const me = members.find((m) => m.user_id === userId);
  const isAdmin = me?.role === "owner" || me?.role === "admin";
  const isOwner = room?.owner_id === userId;
  const pending = pendingQuestions(messages);

  /** Let Minds speak one after another; pausing stops before the next one. */
  const [inviteContent, setInviteContent] = useState<ShareContent | null>(null);
  const runQueue = async (list: RoomMind[]) => {
    if (busyRef.current) return;
    busyRef.current = true;
    let rest = [...list];
    while (rest.length) {
      if (pausedRef.current) break;
      const mind = rest[0];
      if (!mind) break;
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
    busyRef.current = false;
  };

  const manualTurn = async (list: RoomMind[]) => {
    if (!room || !isOwner || busyRef.current) return;
    const question = pendingQuestions(msgsRef.current)[0];
    if (!question) return;
    busyRef.current = true;
    pausedRef.current = false; setPaused(false);
    try {
      for (const mind of list) {
        if (pausedRef.current) break;
        setSpeaking(mind.mind_name);
        const token = await claimRoomTurn(roomId, question.id, mind.mind_id);
        try {
          const fresh = await loadRoom(roomId);
          const text = await askMind(mind, transcriptForQuestion(fresh.messages, question.id), lang);
          await finishRoomTurn(roomId, token, question.id, text);
        } catch (error) {
          await finishRoomTurn(roomId, token, question.id).catch(() => {});
          throw error;
        }
        const fresh = await loadRoom(roomId);
        setMessages(fresh.messages); msgsRef.current = fresh.messages;
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { busyRef.current = false; setSpeaking(null); void reload(); }
  };

  const changeRoom = async (patch: Parameters<typeof updateRoom>[1]) => {
    try { await updateRoom(roomId, patch); await reload(); } catch (e) { toast.error((e as Error).message); }
  };

  const upload = async (file: File | undefined, avatar = false) => {
    if (!file || uploading) return;
    if (avatar && !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const media = await uploadRoomMedia(roomId, file);
      if (avatar && media.kind === "image") await changeRoom({ avatar_path: media.path });
      else setAttachment(media);
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploading(false); }
  };

  const send = async () => {
    const body = input.trim();
    if ((!body && !attachment) || !room || sending) return;
    setSending(true);
    try {
      const url = body.match(/https?:\/\/\S+/)?.[0] ?? null;
      await postMessage(roomId, { body, authorName: me?.display_name || profile?.displayName || "Me", sharedUrl: url, attachment });
      setInput(""); setAttachment(null);
      const r = await loadRoom(roomId);
      setMessages(r.messages);
      msgsRef.current = r.messages;
      const speakers = pickSpeakers(body, minds, room.debate_mode, room.turn_limit);
      if (automaticRepliesAllowed(room.debate_mode === "moderator" || room.moderator_mode) && speakers.length) {
        pausedRef.current = false;
        setPaused(false);
        await runQueue(speakers);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setSending(false); }
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
      <header className="flex shrink-0 items-center gap-2 border-b border-border pl-3 pr-16 pb-2 pt-[calc(env(safe-area-inset-top)+8px)]">
        <Link to="/chats" aria-label="Back" className="p-2"><ArrowLeft className="h-5 w-5" /></Link>
        <RoomAvatar path={room.avatar_path} title={room.title} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{room.title}</div>
          <div className="text-xs text-muted-foreground">👥 {members.length} · 🤖 {minds.length}</div>
        </div>
        <Button variant="ghost" size="icon" aria-label={t.settings} onClick={() => { setShowSettings(true); setName(room.title); void listInvitableMinds().then(setInvitable); void loadGraph().then((g) => setFriends(g.friends)).catch((e) => toast.error(e.message)); }}><Settings className="h-5 w-5" /></Button>
      </header>

      {isOwner && <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2"><label htmlFor="moderator-toggle" className="text-sm">{x.moderator}</label><Switch id="moderator-toggle" checked={room.moderator_mode} disabled={!!speaking} onCheckedChange={(checked) => { pausedRef.current = true; setQueue([]); void changeRoom({ moderator_mode: checked }); }} /></div>}
      {room.moderator_mode && isOwner && <ModeratorBar pending={pending} minds={minds} busy={!!speaking || (!!room.active_mind_id && !!room.turn_started_at && Date.now() - Date.parse(room.turn_started_at) < 600000)} paused={paused} onSpeak={(list) => void manualTurn(list)} onComplete={() => { const q = pending[0]; if (q) void completeRoomQuestion(roomId, q.id).then(reload).catch((e) => toast.error(e.message)); }} onPause={() => { pausedRef.current = true; setPaused(true); }} labels={{ ...x, pause: t.pause }} />}
      {room.moderator_mode && !isOwner && <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">{x.moderator} · {x.queued}: {pending.length}</p>}
      {!room.moderator_mode && minds.length > 1 && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs">
          {speaking ? (
            <Button onClick={() => { pausedRef.current = true; setPaused(true); }} className="flex items-center gap-1 rounded-full border border-border px-3 py-1"><Pause className="h-3 w-3" /> {t.pause}</Button>
          ) : queue.length && paused ? (
            <Button onClick={() => { pausedRef.current = false; setPaused(false); void runQueue(queue); }} className="flex items-center gap-1 rounded-full border border-border px-3 py-1"><Play className="h-3 w-3" /> {t.resume} ({queue.length})</Button>
          ) : (
            <Button
              onClick={() => { pausedRef.current = false; setPaused(false); const j = minds.find((m) => m.role === "judge"); void runQueue([...panelMinds.slice(0, room.turn_limit), ...(j ? [j] : [])]); }}
              className="flex items-center gap-1 rounded-full border border-border px-3 py-1"
            >
              <Play className="h-3 w-3" /> {t.next}
            </Button>
          )}
          <span className="min-w-0 truncate text-muted-foreground">{minds.map((m) => m.mind_name).join(" · ")}</span>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
        {messages.map((m) => {
          const mine = m.sender_kind === "user" && m.sender_user_id === userId;
          return (
            <div key={m.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`min-w-0 max-w-[85%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : m.sender_kind === "mind" ? "border border-border bg-card" : "bg-muted"}`}>
                {!mine && <div className="mb-0.5 flex items-center gap-1 text-xs font-semibold opacity-80">{m.sender_kind === "mind" && <Bot className="h-3 w-3" />}{m.author_name}</div>}
                {m.body.trim() && <div className="whitespace-pre-wrap break-words"><ChatDisplayText text={m.body} lang={lang}>{(shown) => m.sender_kind === "mind" ? <MessageResponse>{shown}</MessageResponse> : shown}</ChatDisplayText></div>}
                {m.attachment && <RoomMedia attachment={m.attachment} onMind={setOpenMind} openLabel={x.open} {...(isOwner && room.kind !== "dm" ? { onAdd: setInviteContent } : {})} />}
                {m.shared_url && <SharedLink url={m.shared_url} openLabel={x.open} />}
                {m.moderator_pending && <div className="mt-1 text-xs opacity-60">{x.queued}</div>}
                {(m.sender_user_id === userId || isAdmin) && (
                  <Button aria-label={t.remove} onClick={() => void deleteMessage(m.id).then(reload).catch((e) => toast.error(e.message))} className="mt-1 hidden text-xs opacity-60 group-hover:inline"><Trash2 className="inline h-3 w-3" /></Button>
                )}
              </div>
            </div>
          );
        })}
        {speaking && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> {speaking} {t.thinking}</div>}
        <div ref={endRef} />
      </div>

      <input ref={attachmentInput} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void upload(e.target.files?.[0], true); e.target.value = ""; }} />
      {attachment && <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs"><span className="min-w-0 flex-1 truncate">{attachment.name}</span><Button size="icon-sm" variant="ghost" aria-label={x.cancel} onClick={() => setAttachment(null)}><X /></Button></div>}
      {sharingMind && <div className="flex items-center gap-2 border-t border-border p-3"><select aria-label={x.shareMind} value="" className="min-w-0 flex-1 rounded-md border border-border bg-background p-2 text-sm" onChange={(e) => { const mind = invitable.find((m) => m.mindId === e.target.value); if (mind) { setAttachment({ kind: "mind", mindId: mind.mindId, name: mind.name }); setSharingMind(false); } }}><option value="">{x.shareMind}</option>{invitable.map((m) => <option key={m.mindId} value={m.mindId}>{m.name}</option>)}</select><Button variant="ghost" size="icon" aria-label={x.cancel} onClick={() => setSharingMind(false)}><X /></Button></div>}
      <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex shrink-0 gap-1 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <Button type="button" variant="ghost" size="icon" title={x.attach} aria-label={x.attach} disabled={uploading} onClick={() => attachmentInput.current?.click()}>{uploading ? <Loader2 className="animate-spin" /> : <Paperclip />}</Button>
        <Button type="button" variant="ghost" size="icon" title={x.shareMind} aria-label={x.shareMind} onClick={() => { setSharingMind(!sharingMind); void listInvitableMinds().then(setInvitable); }}><Bot /></Button>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t.say} aria-label={t.say} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <Button type="submit" size="icon" disabled={(!input.trim() && !attachment) || sending || uploading || (!!speaking && !room.moderator_mode)} aria-label="Send"><Send /></Button>
      </form>
      {inviteContent && <ShareModal open onClose={() => { setInviteContent(null); void reload(); }} content={inviteContent} targetRoomId={roomId} />}
      {openMind && <TalkToMindModal open={!!openMind} onClose={() => setOpenMind(null)} mindId={openMind} mindName={messages.find((m) => m.attachment?.kind === "mind" && m.attachment.share?.mindId === openMind)?.attachment?.name || invitable.find((m) => m.mindId === openMind)?.name || minds.find((m) => m.mind_id === openMind)?.mind_name || "Mind"} />}

      {showSettings && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-background px-4 pb-4 pt-[calc(env(safe-area-inset-top)+16px)]">
          <div className="mx-auto max-w-xl space-y-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{t.settings}</h2><Button onClick={() => setShowSettings(false)} aria-label="Close"><X className="h-5 w-5" /></Button></div>

            {isAdmin && (
              <>
                <div className="flex items-center gap-2"><input aria-label={x.name} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2" /><Button disabled={!name.trim() || name.trim() === room.title} onClick={() => void changeRoom({ title: name.trim() })}>{x.save}</Button></div>
                <div className="flex flex-wrap items-center gap-2"><RoomAvatar path={room.avatar_path} title={room.title} /><Button variant="outline" disabled={uploading} onClick={() => avatarInput.current?.click()}><ImagePlus />{x.avatar}</Button>{room.avatar_path && <Button variant="ghost" onClick={() => void changeRoom({ avatar_path: null })}>{x.removeAvatar}</Button>}</div>
                <div className="space-y-1">
                  <div className="text-sm font-semibold">{t.invite}</div>
                  <Button onClick={() => { void navigator.clipboard.writeText(room.invite_code); toast.success(t.copy); }} className="flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 font-mono text-sm">{room.invite_code}<Copy className="h-4 w-4" /></Button>
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
                  {isAdmin && <Button aria-label={t.remove} onClick={() => void removeMind(m.id).then(reload)}><Trash2 className="h-4 w-4" /></Button>}
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
              {isOwner && room.kind !== "dm" && <select aria-label={x.addFriend} value="" className="w-full rounded-lg border border-border bg-background p-2 text-sm" onChange={(e) => { if (e.target.value) void addRoomFriend(roomId, e.target.value).then(reload).catch((err) => toast.error(err.message)); }}><option value="">+ {x.addFriend}</option>{friends.filter((f) => !members.some((m) => m.user_id === f.id)).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
              {isOwner && !friends.filter((f) => !members.some((m) => m.user_id === f.id)).length && <p className="text-xs text-muted-foreground">{x.noFriends}</p>}
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{m.display_name || "—"} <span className="text-xs text-muted-foreground">({m.role})</span></span>
                  {isOwner && m.role !== "owner" && (
                    <Button onClick={() => void setMemberRole(m.id, m.role === "admin" ? "member" : "admin").then(reload)} className="rounded-full border border-border px-2 py-0.5 text-xs">{m.role === "admin" ? t.makeMember : t.makeAdmin}</Button>
                  )}
                  {isAdmin && m.role !== "owner" && m.user_id !== userId && (
                    <Button aria-label={t.remove} onClick={() => void removeMember(m.id).then(reload)}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
              ))}
            </section>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => exportRoom(room, messages, "md")} className="flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm"><Download className="h-4 w-4" /> MD</Button>
              <Button onClick={() => exportRoom(room, messages, "json")} className="flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm"><Download className="h-4 w-4" /> JSON</Button>
              {!isOwner && <Button onClick={() => void leaveRoom(room.id).then(() => navigate({ to: "/chats" }))} className="rounded-full border border-border px-3 py-2 text-sm">{t.leave}</Button>}
              {isOwner && (
                <Button onClick={() => { if (confirm(t.delConfirm)) void deleteRoom(room.id).then(() => navigate({ to: "/chats" })).catch((e) => toast.error(e.message)); }} className="rounded-full border border-destructive px-3 py-2 text-sm text-destructive">{t.del}</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
