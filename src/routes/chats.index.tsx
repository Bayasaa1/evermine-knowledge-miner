import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bot, Download, Loader2, LogIn, MessageCircle, Plus, Users } from "lucide-react";
import { toast } from "sonner";

import { BottomNav } from "@/components/bottom-nav";
import { TalkToMindModal } from "@/components/talk-to-mind-modal";
import { useAuth } from "@/hooks/use-auth";
import { useLang, pickCopy } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { createRoom, dmPartnerNames, joinByCode, listMyRooms, mindLabel, resolveMindNames, type Room } from "@/lib/chat-rooms";

export const Route = createFileRoute("/chats/")({
  head: () => ({
    meta: [
      { title: "Chats — Evermind" },
      { name: "description", content: "Your group rooms with friends and AI Minds, plus every Mind conversation you started from a video." },
      { property: "og:title", content: "Chats — Evermind" },
      { property: "og:description", content: "Group chats with people and AI Minds on Evermind." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatsPage,
});

const COPY = {
  en: { title: "Chats", rooms: "Group rooms", minds: "Mind chats (from videos)", newRoom: "New group", name: "Group name", create: "Create", join: "Join with invite code", joinBtn: "Join", empty: "No rooms yet.", noMinds: "Talk to a Mind under any video — it appears here.", signIn: "Sign in to use chats", exportMd: "MD", exportJson: "JSON", unread: "new" },
  mn: { title: "Чат", rooms: "Бүлгийн өрөөнүүд", minds: "Mind-тай чат (бичлэгээс)", newRoom: "Шинэ бүлэг", name: "Бүлгийн нэр", create: "Үүсгэх", join: "Урилгын кодоор нэгдэх", joinBtn: "Нэгдэх", empty: "Одоогоор өрөө алга.", noMinds: "Аль нэг бичлэг дээр Mind-тай ярилцвал энд гарч ирнэ.", signIn: "Чат ашиглахын тулд нэвтэрнэ үү", exportMd: "MD", exportJson: "JSON", unread: "шинэ" },
  ko: { title: "채팅", rooms: "그룹 방", minds: "마인드 채팅 (영상에서)", newRoom: "새 그룹", name: "그룹 이름", create: "만들기", join: "초대 코드로 참여", joinBtn: "참여", empty: "아직 방이 없습니다.", noMinds: "영상에서 마인드와 대화하면 여기에 표시됩니다.", signIn: "채팅을 사용하려면 로그인하세요", exportMd: "MD", exportJson: "JSON", unread: "새 메시지" },
};

type MindThread = { mindId: string; last: string; count: number };

function ChatsPage() {
  const { lang } = useLang();
  const t = pickCopy(COPY, lang);
  const { isAuthenticated, loading, profile, userId } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<(Room & { unread: boolean })[] | null>(null);
  const [threads, setThreads] = useState<MindThread[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
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
      const { data } = await supabase
        .from("chat_messages")
        .select("mind_id,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1000);
      const map = new Map<string, MindThread>();
      for (const r of data ?? []) {
        const cur = map.get(r.mind_id);
        if (cur) cur.count++;
        else map.set(r.mind_id, { mindId: r.mind_id, last: r.created_at, count: 1 });
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

  const exportThread = async (mindId: string, format: "md" | "json") => {
    const { data } = await supabase
      .from("chat_messages")
      .select("role,body,created_at")
      .eq("user_id", userId!)
      .eq("mind_id", mindId)
      .order("created_at");
    const rows = data ?? [];
    const name = label(mindId);
    const content =
      format === "json"
        ? JSON.stringify({ mind: name, mindId, messages: rows }, null, 2)
        : `# ${name}\n\n` + rows.map((r) => `**${r.role === "user" ? "You" : name}:** ${r.body}\n`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    a.download = `${name.replace(/[^\w-]+/g, "_")}.${format}`;
    a.click();
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

  return (
    <main className="min-h-screen bg-background px-4 pb-32 pt-[calc(env(safe-area-inset-top)+16px)] text-foreground">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-bold">{t.title}</h1>

        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.name} className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const id = await createRoom(name || t.newRoom, profile?.displayName ?? "");
                  void navigate({ to: "/chats/$roomId", params: { roomId: id } });
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
              className="flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> {t.create}
            </button>
          </div>
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.join} className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
            <button
              disabled={busy || !code.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  const id = await joinByCode(code, profile?.displayName ?? "");
                  void navigate({ to: "/chats/$roomId", params: { roomId: id } });
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded-full border border-border px-4 py-2 text-sm"
            >
              {t.joinBtn}
            </button>
          </div>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Users className="h-4 w-4" /> {t.rooms}</h2>
          {rooms === null ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : rooms.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.empty}</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {rooms.map((r) => (
                <li key={r.id}>
                  <Link to="/chats/$roomId" params={{ roomId: r.id }} className="flex items-center justify-between px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">{r.kind === "dm" ? <Users className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />} {r.kind === "dm" ? dmNames.get(r.id) ?? r.title : r.title}</span>
                    {r.unread && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{t.unread}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Bot className="h-4 w-4" /> {t.minds}</h2>
          {threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.noMinds}</p>
          ) : (
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {threads.map((th) => (
                <li key={th.mindId} className="flex items-center justify-between gap-2 px-4 py-3">
                  <button onClick={() => setOpenMind(th.mindId)} className="min-w-0 flex-1 text-left">
                    <div className="truncate font-medium">{label(th.mindId)}</div>
                    <div className="text-xs text-muted-foreground">{th.count} · {new Date(th.last).toLocaleDateString()}</div>
                  </button>
                  <button onClick={() => void exportThread(th.mindId, "md")} className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs"><Download className="h-3 w-3" />{t.exportMd}</button>
                  <button onClick={() => void exportThread(th.mindId, "json")} className="rounded-full border border-border px-2 py-1 text-xs">{t.exportJson}</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <TalkToMindModal open={!!openMind} onClose={() => { setOpenMind(null); void refresh(); }} mindId={openMind} mindName={openMind ? label(openMind) : ""} lang={lang} />
      <BottomNav lang={lang} />
    </main>
  );
}
