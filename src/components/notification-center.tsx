/**
 * Bottom-bar notification center.
 *
 * Shows everything that needs the creator's attention in one place: mining
 * jobs that are running, paused, failed or finished, and setup problems such
 * as a missing free Gemini key (with a direct link to the fix).
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCircle2, KeyRound, Loader2, PauseCircle, TriangleAlert } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { listMiningJobs } from "@/lib/mining-jobs.functions";
import { jobProgress, type MiningJob } from "@/lib/mining-jobs";
import { listUnreadUpdates, markUpdateRead } from "@/lib/creator-updates.functions";
import { hasAnyCredential } from "@/lib/api-keys";
import { pickCopy, type Lang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";

type Note = {
  id: string;
  tone: "info" | "warn" | "ok";
  icon: typeof Bell;
  title: string;
  body: string;
  /** Where tapping the notification takes the creator. */
  href?: string;
  attention: boolean;
};

const COPY = {
  en: {
    title: "Notifications",
    empty: "Nothing needs your attention right now.",
    open: "Notifications",
    label: "Alerts",
    keyTitle: "Add your free Gemini key",
    keyBody: "Mining, chat and translation run on your own free Gemini access. Add the key once in Engines.",
    running: "Mining in progress",
    queued: "Waiting in the queue",
    pausedQuota: "Paused — free quota used up",
    pausedUser: "Paused by you",
    failed: "Mining failed",
    done: "Mining finished",
    signedOut: "Sign in to see your notifications.",
    updateTitle: "New update from a Mind you follow",
    updateBody: (title: string) => title,
  },
  mn: {
    title: "Мэдэгдэл",
    empty: "Одоогоор анхаарах зүйл алга.",
    open: "Мэдэгдэл",
    label: "Мэдэгдэл",
    keyTitle: "Үнэгүй Gemini түлхүүрээ нэмнэ үү",
    keyBody: "Олборлолт, чат, орчуулга таны өөрийн үнэгүй Gemini хандалтаар ажилладаг. Хөдөлгүүр хэсэгт нэг удаа нэмнэ үү.",
    running: "Олборлож байна",
    queued: "Дараалалд хүлээж байна",
    pausedQuota: "Түр зогссон — үнэгүй хязгаар дууссан",
    pausedUser: "Таны зогсоосон",
    failed: "Олборлолт амжилтгүй",
    done: "Олборлолт дууслаа",
    signedOut: "Мэдэгдлээ харахын тулд нэвтэрнэ үү.",
    updateTitle: "Дагаж буй оюун ухаанаас шинэ мэдээ",
    updateBody: (title: string) => title,
  },
  ko: {
    title: "알림",
    empty: "지금 확인할 알림이 없습니다.",
    open: "알림",
    label: "알림",
    keyTitle: "무료 Gemini 키를 추가하세요",
    keyBody: "마이닝, 채팅, 번역은 본인의 무료 Gemini 액세스로 실행됩니다. 엔진에서 한 번만 추가하세요.",
    running: "마이닝 진행 중",
    queued: "대기열에서 대기 중",
    pausedQuota: "일시 중지 — 무료 할당량 소진",
    pausedUser: "직접 일시 중지함",
    failed: "마이닝 실패",
    done: "마이닝 완료",
    signedOut: "알림을 보려면 로그인하세요.",
    updateTitle: "구독 중인 Mind의 새 업데이트",
    updateBody: (title: string) => title,
  },
};

function jobNote(job: MiningJob, t: (typeof COPY)["en"]): Note | null {
  const label = job.sourceLabel || job.sourceUrl;
  const pct = jobProgress(job);
  switch (job.status) {
    case "running":
      return { id: job.id, tone: "info", icon: Loader2, title: t.running, body: `${label} — ${pct}%`, href: "/mining", attention: false };
    case "queued":
      return { id: job.id, tone: "info", icon: Loader2, title: t.queued, body: label, href: "/mining", attention: false };
    case "paused_quota":
      return { id: job.id, tone: "warn", icon: PauseCircle, title: t.pausedQuota, body: label, href: "/mining", attention: true };
    case "paused_user":
      return { id: job.id, tone: "warn", icon: PauseCircle, title: t.pausedUser, body: label, href: "/mining", attention: false };
    case "error":
      return {
        id: job.id,
        tone: "warn",
        icon: TriangleAlert,
        title: t.failed,
        body: job.lastError ? `${label} — ${job.lastError.slice(0, 120)}` : label,
        href: "/mining",
        attention: true,
      };
    case "done":
      return { id: job.id, tone: "ok", icon: CheckCircle2, title: t.done, body: label, href: "/vaults", attention: false };
    default:
      return null;
  }
}

export function NotificationCenter({ lang = "en" }: { lang?: Lang }) {
  const t = pickCopy(COPY, lang);
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    let alive = true;
    void hasAnyCredential().then((ok) => alive && setHasKey(ok));
    return () => {
      alive = false;
    };
  }, [isAuthenticated, open]);

  const fetchJobs = useServerFn(listMiningJobs);
  const { data: jobs = [] } = useQuery({
    queryKey: ["mining-jobs"],
    queryFn: () => fetchJobs(),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

  const fetchUpdates = useServerFn(listUnreadUpdates);
  const { data: updates = [] } = useQuery({
    queryKey: ["unread-creator-updates"],
    queryFn: () => fetchUpdates(),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
    staleTime: 60_000,
  });

  const markRead = useServerFn(markUpdateRead);

  const notes: Note[] = [];
  if (isAuthenticated && !hasKey) {
    notes.push({
      id: "gemini-key",
      tone: "warn",
      icon: KeyRound,
      title: t.keyTitle,
      body: t.keyBody,
      href: "/creator#engines",
      attention: true,
    });
  }
  for (const job of jobs.slice(0, 20)) {
    const n = jobNote(job, t);
    if (n) notes.push(n);
  }
  for (const update of updates.slice(0, 10)) {
    notes.push({
      id: `update-${update.id}`,
      tone: "ok",
      icon: Bell,
      title: t.updateTitle,
      body: t.updateBody(update.title),
      href: `/feed?mind=${update.mind_id}`,
      attention: true,
    });
  }

  const attention = notes.filter((n) => n.attention).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.open}
        className="relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="relative">
          <Bell className="h-5 w-5" />
          {attention > 0 && (
            <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
              {attention}
            </span>
          )}
        </span>
        {t.label}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t.title}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2 pb-6">
            {!isAuthenticated && <p className="text-sm text-muted-foreground">{t.signedOut}</p>}
            {isAuthenticated && notes.length === 0 && (
              <p className="text-sm text-muted-foreground">{t.empty}</p>
            )}
            {notes.map((n) => {
              const Icon = n.icon;
              const inner = (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left">
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      n.tone === "warn" ? "text-destructive" : n.tone === "ok" ? "text-primary" : "text-muted-foreground"
                    } ${n.icon === Loader2 ? "animate-spin" : ""}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                  </div>
                </div>
              );
              if (!n.href) return <div key={n.id}>{inner}</div>;
              if (n.href.includes("#")) {
                return (
                  <a key={n.id} href={n.href} onClick={() => setOpen(false)} className="block">
                    {inner}
                  </a>
                );
              }
              return (
                <Link key={n.id} to={n.href} onClick={() => setOpen(false)} className="block">
                  {inner}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
