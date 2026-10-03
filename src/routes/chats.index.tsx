import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bot, Check, CirclePlus, Download, Loader2, LogIn, Search, SquarePen, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { BottomNav } from "@/components/bottom-nav";
import { StoryBar } from "@/components/story-bar";
import { TalkToMindModal } from "@/components/talk-to-mind-modal";
import { useAuth } from "@/hooks/use-auth";
import { useLang, pickCopy } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { createRoom, deleteRoom, dmPartnerNames, joinByCode, leaveRoom, listMyRooms, mindLabel, resolveMindNames, type Room } from "@/lib/chat-rooms";
import { openDm, searchPeople, type Person } from "@/lib/friends";

export const Route = createFileRoute("/chats/")({
  head: () => ({
    meta: [
      { title: "Chats — Evermind" },
      { name: "description", content: "Your stories, group rooms, direct messages and every Mind conversation in one list." },
      { property: "og:title", content: "Chats — Evermind" },
      { property: "og:description", content: "Stories, group chats and AI Minds on Evermind." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatsPage,
});

const COPY = {
  en: { title: "Chats", edit: "Edit", done: "Done", newRoom: "New group", name: "Group name", create: "Create", join: "Invite code", joinBtn: "Join", empty: "No chats yet. Talk to a Mind under any video or start a new chat.", signIn: "Sign in to use chats", write: "New message", search: "Search by name or @username", notMutual: "You can only message people who subscribe to each other.", del: "Delete", confirm: "Delete or leave the selected chats?", noMsg: "No messages yet", mindChat: "Mind chat", messages: "messages" },
  mn: { title: "Чат", edit: "Засах", done: "Болсон", newRoom: "Шинэ бүлэг", name: "Бүлгийн нэр", create: "Үүсгэх", join: "Урилгын код", joinBtn: "Нэгдэх", empty: "Одоогоор чат алга. Бичлэг дээр Mind-тай ярилцах эсвэл шинэ чат эхлүүлээрэй.", signIn: "Чат ашиглахын тулд нэвтэрнэ үү", write: "Шинэ мессеж", search: "Нэр эсвэл @username-ээр хайх", notMutual: "Зөвхөн бие биеэ дагасан хүмүүстэй мессеж бичих боломжтой.", del: "Устгах", confirm: "Сонгосон чатуудыг устгах/гарах уу?", noMsg: "Мессеж алга", mindChat: "Mind чат", messages: "мессеж" },
  ko: { title: "채팅", edit: "편집", done: "완료", newRoom: "새 그룹", name: "그룹 이름", create: "만들기", join: "초대 코드", joinBtn: "참여", empty: "아직 채팅이 없습니다. 영상에서 마인드와 대화하거나 새 채팅을 시작하세요.", signIn: "채팅을 사용하려면 로그인하세요", write: "새 메시지", search: "이름 또는 @username 검색", notMutual: "서로 구독한 사람에게만 메시지를 보낼 수 있습니다.", del: "삭제", confirm: "선택한 채팅을 삭제/나갈까요?", noMsg: "메시지 없음", mindChat: "마인드 채팅", messages: "메시지" },
};

type MindThread = { mindId: string; last: string; count: number; snippet: string };
type RoomRow = Room & { unread: boolean };

const AVATAR_TONES = ["bg-primary", "bg-accent", "bg-secondary", "bg-muted"];
function initials(s: string) {
  return s.replace(/^@/, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}
function tone(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}
function when(iso: string, lang: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (now.getTime() - d.getTime() < 6 * 864e5) return d.toLocaleDateString(lang, { weekday: "short" });
  return d.toLocaleDateString(lang, { month: "2-digit", day: "2-digit" });
}

function Avatar({ label, bot }: { label: string; bot?: boolean }) {
  return (
    <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-foreground ${tone(label)}`}>
      {bot ? <Bot className="h-6 w-6" /> : initials(label)}
    </span>
  );
}

function ChatsPage() {
  const { lang } = useLang();
  const t = pickCopy(COPY, lang);
  const { isAuthenticated, loading, profile, userId } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [threads, setThreads] = useState<MindThread[]>([]);
  const [lastMsg, setLastMsg] = useState<Map<string, { body: string; author: string; at: string }>>(new Map());
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"none" | "group" | "write">("none");
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [openMind, setOpenMind] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [dmNames, setDmNames] = useState<Map<string, string>>(new Map());
  const label = (id: string) => names.get(id) ?? (id.startsWith("project:") ? "…" : mindLabel(id));

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const rs = await listMyRooms();
      setRooms(rs);
      void dmPartnerNames(rs.filter((r) => r.kind === "dm").map((r) => r.id), userId).then(setDmNames);
      if (rs.length) {
        const { data: msgs } = await supabase
          .from("chat_room_messages")
          .select("room_id,body,author_name,created_at")
          .in("room_id", rs.map((r) => r.id))
          .order("created_at", { ascending: false })
          .limit(500);
        const m = new Map<string, { body: string; author: string; at: string }>();
        for (const r of msgs ?? []) if (!m.has(r.room_id)) m.set(r.room_id, { body: r.body, author: r.author_name, at: r.created_at });
        setLastMsg(m);
      }
      const { data } = await supabase
        .from("chat_messages")
        .select("mind_id,created_at,body")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1000);
      const map = new Map<string, MindThread>();
      for (const r of data ?? []) {
        const cur = map.get(r.mind_id);
        if (cur) cur.count++;
        else map.set(r.mind_id, { mindId: r.mind_id, last: r.created_at, count: 1, snippet: r.body ?? "" });
      }
      setThreads([...map.values()]);
      setNames(await resolveMindNames([...map.keys()]));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [userId]);

  useEffect(() => {
    setRooms(null);
    setThreads([]);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (panel !== "write") return;
    const id = setTimeout(() => void searchPeople(q).then(setPeople).catch(() => setPeople([])), 300);
    return () => clearTimeout(id);
  }, [q, panel]);

  const exportThread = async (mindId: string, format: "md" | "json") => {
    const { data } = await supabase.from("chat_messages").select("role,body,created_at").eq("user_id", userId!).eq("mind_id", mindId).order("created_at");
    const rows = data ?? [];
    const n = label(mindId);
    const content = format === "json" ? JSON.stringify({ mind: n, mindId, messages: rows }, null, 2) : `# ${n}\n\n` + rows.map((r) => `**${r.role === "user" ? "You" : n}:** ${r.body}\n`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    a.download = `${n.replace(/[^\w-]+/g, "_")}.${format}`;
    a.click();
  };

  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const removeSelected = async () => {
    if (!selected.size || !confirm(t.confirm)) return;
    setBusy(true);
    try {
      for (const k of selected) {
        if (k.startsWith("r")) {
          const r = rooms?.find((x) => x.id === k.slice(1));
          if (r) await (r.owner_id === userId ? deleteRoom(r.id) : leaveRoom(r.id));
        } else {
          await supabase.from("chat_messages").delete().eq("user_id", userId!).eq("mind_id", k.slice(1));
        }
      }
      setSelected(new Set());
      setEditing(false);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background px-4 pb-32 pt-16 text-foreground">
        <Link to="/auth" className="mx-auto flex max-w-sm items-center justify-center gap-2 rounded-full border border-border px-5 py-3">
          <LogIn className="h-4 w-4" /> {t.signIn}
        </Link>
        <BottomNav lang={lang} />
      </main>
    );
  }

  const items = [
    ...(rooms ?? []).map((r) => ({ at: lastMsg.get(r.id)?.at ?? r.updated_at, key: `r${r.id}`, room: r as RoomRow | null, th: null as MindThread | null })),
    ...threads.map((th) => ({ at: th.last, key: `m${th.mindId}`, room: null as RoomRow | null, th })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <main className="min-h-screen bg-background pb-32 pt-[calc(env(safe-area-inset-top)+12px)] text-foreground">
      <div className="mx-auto max-w-xl">
        <header className="flex items-center justify-between px-4 py-2">
          <button type="button" onClick={() => { setEditing((v) => !v); setSelected(new Set()); }} className="rounded-full bg-card px-4 py-2 text-base font-medium">
            {editing ? t.done : t.edit}
          </button>
          <h1 className="text-lg font-semibold">{t.title}</h1>
          <div className="flex items-center gap-1 rounded-full bg-card px-2 py-1">
            <button type="button" aria-label={t.newRoom} onClick={() => setPanel((p) => (p === "group" ? "none" : "group"))} className="flex h-9 w-9 items-center justify-center rounded-full"><CirclePlus className="h-5 w-5" /></button>
            <button type="button" aria-label={t.write} onClick={() => setPanel((p) => (p === "write" ? "none" : "write"))} className="flex h-9 w-9 items-center justify-center rounded-full"><SquarePen className="h-5 w-5" /></button>
          </div>
        </header>

        {panel === "group" && (
          <section className="mx-4 mb-3 space-y-2 rounded-2xl border border-border bg-card p-3">
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.name} className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
              <button disabled={busy} onClick={async () => { setBusy(true); try { const id = await createRoom(name || t.newRoom, profile?.displayName ?? ""); void navigate({ to: "/chats/$roomId", params: { roomId: id } }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{t.create}</button>
            </div>
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.join} className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
              <button disabled={busy || !code.trim()} onClick={async () => { setBusy(true); try { const id = await joinByCode(code, profile?.displayName ?? ""); void navigate({ to: "/chats/$roomId", params: { roomId: id } }); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } }} className="rounded-full border border-border px-4 py-2 text-sm">{t.joinBtn}</button>
            </div>
          </section>
        )}

        {panel === "write" && (
          <section className="mx-4 mb-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
              <button onClick={() => setPanel("none")} aria-label="close"><X className="h-4 w-4" /></button>
            </div>
            <ul className="mt-2 max-h-72 overflow-y-auto">
              {people.map((p) => (
                <li key={p.id}>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted"
                    onClick={async () => {
                      try { const id = await openDm(p.id); void navigate({ to: "/chats/$roomId", params: { roomId: id } }); }
                      catch (e) { toast.error((e as Error).message === "not_mutual" ? t.notMutual : (e as Error).message); }
                    }}
                  >
                    {p.avatar ? <img src={p.avatar} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${tone(p.name)}`}>{initials(p.name)}</span>}
                    <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span>{p.username && <span className="block truncate text-xs text-muted-foreground">@{p.username}</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="px-4 pb-2"><StoryBar /></div>

        {rooms === null ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <ul>
            {items.map(({ key, room: r, th, at }) => {
              const title = r ? (r.kind === "dm" ? dmNames.get(r.id) ?? r.title : r.title) : label(th!.mindId);
              const lm = r ? lastMsg.get(r.id) : null;
              const snippet = r ? (lm ? (r.kind === "dm" ? lm.body : `${lm.author}: ${lm.body}`) : t.noMsg) : th!.snippet || t.mindChat;
              const body = (
                <>
                  {editing && (
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected.has(key) ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}>
                      {selected.has(key) && <Check className="h-4 w-4" />}
                    </span>
                  )}
                  <Avatar label={title} bot={!r} />
                  <span className="flex min-w-0 flex-1 items-start gap-2 border-b border-border py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{title}</span>
                      <span className="line-clamp-2 text-sm text-muted-foreground">{snippet}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-2">
                      <span className="text-xs text-muted-foreground">{when(at, lang)}</span>
                      {r?.unread && <span className="h-5 min-w-5 rounded-full bg-primary px-1.5 text-center text-xs leading-5 text-primary-foreground">•</span>}
                      {th && !editing && <span className="rounded-full bg-muted px-2 text-xs leading-5">{th.count}</span>}
                    </span>
                  </span>
                </>
              );
              const cls = "flex w-full items-center gap-3 px-4 text-left";
              if (editing) return <li key={key}><button type="button" onClick={() => toggle(key)} className={cls}>{body}</button></li>;
              return r ? (
                <li key={key}><Link to="/chats/$roomId" params={{ roomId: r.id }} className={cls}>{body}</Link></li>
              ) : (
                <li key={key}><button type="button" onClick={() => setOpenMind(th!.mindId)} className={cls}>{body}</button></li>
              );
            })}
          </ul>
        )}

        {editing && (
          <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center gap-2 px-4">
            {[...selected].filter((k) => k.startsWith("m")).length === 1 && (
              <>
                <button onClick={() => void exportThread([...selected][0]!.slice(1), "md")} className="flex items-center gap-1 rounded-full border border-border bg-card px-4 py-2 text-sm"><Download className="h-4 w-4" />MD</button>
                <button onClick={() => void exportThread([...selected][0]!.slice(1), "json")} className="rounded-full border border-border bg-card px-4 py-2 text-sm">JSON</button>
              </>
            )}
            <button disabled={!selected.size || busy} onClick={() => void removeSelected()} className="flex items-center gap-1 rounded-full bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> {t.del} {selected.size > 0 && `(${selected.size})`}
            </button>
          </div>
        )}
      </div>
      <TalkToMindModal open={!!openMind} onClose={() => { setOpenMind(null); void refresh(); }} mindId={openMind} mindName={openMind ? label(openMind) : ""} lang={lang} />
      <BottomNav lang={lang} />
    </main>
  );
}
