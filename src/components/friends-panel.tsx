import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Ban, Loader2, MessageCircle, MoreHorizontal, Search, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { useAuth, initials } from "@/hooks/use-auth";
import { pickCopy, useLang } from "@/lib/i18n";
import {
  block, loadGraph, openDm, removeSubscriber, searchPeople, subscribe, unblock, unsubscribe,
  type Graph, type Person,
} from "@/lib/friends";

const copy = {
  en: {
    friends: "Friends", subscribers: "Subscribers", following: "Following", blocked: "Blocked",
    search: "Search people by name…", chat: "Chat", subBack: "Subscribe back", sub: "Subscribe",
    unsub: "Unsubscribe", remove: "Remove subscriber", blockL: "Block", unblockL: "Unblock",
    mutual: "You subscribe to each other", subHint: "Subscribe back to unlock direct chat",
    folHint: "Chat opens when they subscribe back", empty: "No one here yet.",
    signIn: "Sign in to manage friends.", confirmBlock: "Block this person? Subscriptions both ways are removed.",
    notMutual: "You both need to subscribe to each other first.",
  },
  mn: {
    friends: "Найзууд", subscribers: "Намайг дагагчид", following: "Миний дагасан", blocked: "Блоклосон",
    search: "Нэрээр хүн хайх…", chat: "Чатлах", subBack: "Буцааж Sub", sub: "Subscribe",
    unsub: "Unsubscribe", remove: "Дагагчаас хасах", blockL: "Блоклох", unblockL: "Блок цуцлах",
    mutual: "Та хоёр бие биедээ Sub хийсэн", subHint: "Буцааж Sub хийвэл шууд чат нээгдэнэ",
    folHint: "Тэр буцааж Sub хийвэл чат нээгдэнэ", empty: "Одоогоор хэн ч алга.",
    signIn: "Найзаа удирдахын тулд нэвтэрнэ үү.", confirmBlock: "Энэ хүнийг блоклох уу? Хоёр талын Sub цуцлагдана.",
    notMutual: "Эхлээд хоёулаа бие биедээ Sub хийх хэрэгтэй.",
  },
  ko: {
    friends: "친구", subscribers: "구독자", following: "구독 중", blocked: "차단됨",
    search: "이름으로 검색…", chat: "채팅", subBack: "맞구독", sub: "구독",
    unsub: "구독 취소", remove: "구독자 삭제", blockL: "차단", unblockL: "차단 해제",
    mutual: "서로 구독 중", subHint: "맞구독하면 1:1 채팅이 열립니다",
    folHint: "상대가 맞구독하면 채팅이 열립니다", empty: "아직 아무도 없습니다.",
    signIn: "로그인 후 친구를 관리하세요.", confirmBlock: "차단할까요? 양쪽 구독이 삭제됩니다.",
    notMutual: "서로 구독해야 채팅할 수 있습니다.",
  },
} as const;

type Tab = "friends" | "subscribers" | "following" | "blocked";

export function FriendsPanel({ onCounts, initialTab = "subscribers" }: { onCounts?: (g: Graph) => void; initialTab?: "subscribers" | "following" }) {
  const { lang } = useLang();
  const t = pickCopy(copy, lang);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const g = await loadGraph();
      setGraph(g);
      onCounts?.(g);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [onCounts]);

  useEffect(() => {
    if (isAuthenticated) void refresh();
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    if (q.trim().length < 2) return setResults(null);
    const h = setTimeout(() => void searchPeople(q).then(setResults).catch(() => setResults([])), 300);
    return () => clearTimeout(h);
  }, [q]);

  if (!isAuthenticated) return <p className="py-8 text-center text-sm text-muted-foreground">{t.signIn}</p>;

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setMenu(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const chat = async (id: string) => {
    setBusy(id);
    try {
      const roomId = await openDm(id);
      void navigate({ to: "/chats/$roomId", params: { roomId } });
    } catch (e) {
      toast.error(e instanceof Error && e.message === "not_mutual" ? t.notMutual : String(e));
    } finally {
      setBusy(null);
    }
  };

  const relation = (id: string): Tab | null => {
    if (!graph) return null;
    for (const k of ["friends", "subscribers", "following", "blocked"] as Tab[]) if (graph[k].some((p) => p.id === id)) return k;
    return null;
  };

  const row = (p: Person, rel: Tab | null) => (
    <li key={p.id} className="relative flex items-center gap-3 py-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
        {p.avatar ? <img src={p.avatar} alt="" className="h-full w-full object-cover" /> : (
          <span className="flex h-full w-full items-center justify-center text-xs font-semibold">{initials(p.name)}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.name}{p.username && <span className="ml-1 text-xs font-normal text-muted-foreground">@{p.username}</span>}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {rel === "friends" ? t.mutual : rel === "subscribers" ? t.subHint : rel === "following" ? t.folHint : ""}
        </p>
      </div>
      {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : rel === "friends" ? (
        <button onClick={() => void chat(p.id)} className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background">
          <MessageCircle className="h-3.5 w-3.5" />{t.chat}
        </button>
      ) : rel === "subscribers" ? (
        <button onClick={() => void act(p.id, () => subscribe(p.id))} className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background">
          <UserPlus className="h-3.5 w-3.5" />{t.subBack}
        </button>
      ) : rel === "blocked" ? (
        <button onClick={() => void act(p.id, () => unblock(p.id))} className="rounded-full border border-border px-3 py-1.5 text-xs">{t.unblockL}</button>
      ) : rel === null ? (
        <button onClick={() => void act(p.id, () => subscribe(p.id))} className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background">
          <UserPlus className="h-3.5 w-3.5" />{t.sub}
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground">
          <UserCheck className="h-3.5 w-3.5" />{t.following}
        </span>
      )}
      {rel !== "blocked" && (
        <button aria-label="More" onClick={() => setMenu(menu === p.id ? null : p.id)} className="rounded-full p-1.5 hover:bg-muted">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
      {menu === p.id && (
        <div className="absolute right-0 top-12 z-20 w-48 overflow-hidden rounded-xl border border-border bg-popover text-sm shadow-lg">
          {(rel === "friends" || rel === "following") && (
            <button onClick={() => void act(p.id, () => unsubscribe(p.id))} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted">
              <UserMinus className="h-4 w-4" />{t.unsub}
            </button>
          )}
          {(rel === "friends" || rel === "subscribers") && (
            <button onClick={() => void act(p.id, () => removeSubscriber(p.id))} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-muted">
              <UserMinus className="h-4 w-4" />{t.remove}
            </button>
          )}
          <button onClick={() => confirm(t.confirmBlock) && void act(p.id, () => block(p.id))} className="flex w-full items-center gap-2 px-3 py-2 text-destructive hover:bg-muted">
            <Ban className="h-4 w-4" />{t.blockL}
          </button>
        </div>
      )}
    </li>
  );

  useEffect(() => setTab(initialTab), [initialTab]);
  const listFor = (k: Tab): { p: Person; rel: Tab }[] => {
    if (!graph) return [];
    const mut = graph.friends.map((p) => ({ p, rel: "friends" as Tab }));
    if (k === "subscribers") return [...mut, ...graph.subscribers.map((p) => ({ p, rel: k }))];
    if (k === "following") return [...mut, ...graph.following.map((p) => ({ p, rel: k }))];
    return graph[k].map((p) => ({ p, rel: k }));
  };
  const list = results ? results.map((p) => ({ p, rel: relation(p.id) as Tab })) : listFor(tab);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search}
          className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-4 text-sm outline-none focus:border-foreground/40" />
      </div>
      {!results && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {(["subscribers", "following", "blocked"] as Tab[]).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${tab === k ? "bg-foreground text-background" : "border border-border text-muted-foreground"}`}>
              {t[k]} {graph ? `(${listFor(k).length})` : ""}
            </button>
          ))}
        </div>
      )}
      {!graph ? <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin" /> : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">{list.map(({ p, rel }) => row(p, rel))}</ul>
      )}
    </div>
  );
}
