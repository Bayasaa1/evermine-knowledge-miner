import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Video, MessagesSquare, Timer, Sparkles, Coins, Wallet, Loader2 } from "lucide-react";
import {
  loadAnalytics,
  requestPayout,
  summarize,
  emptyAnalytics,
  type Analytics,
  type AnalyticsSummary,
} from "@/lib/analytics";
import type { Ownership } from "@/lib/ownership";

const copy = {
  en: {
    title: "Analytics & Earnings",
    live: "Live",
    calls: "Total video calls",
    activeChats: "Active chat sessions",
    minutes: "Engagement minutes",
    queries: "queries answered",
    inCall: "in call now",
    growth: "Mind growth this week",
    beliefs: "New beliefs",
    memories: "New memories",
    skills: "New skills",
    growthEmpty: "Mine a video to grow your mind this week.",
    money: "Creator monetization",
    perQuery: "Per-query earnings",
    perMinute: "Per-call-minute earnings",
    gross: "Gross earned",
    paid: "Already paid out",
    available: "Available for payout",
    payout: "Request payout",
    payoutDone: (v: string) => `Payout requested for ${v}. We'll process it within 3 business days.`,
    payoutEmpty: "Nothing to pay out yet.",
    rateHint: "Rates come from your Mind Ownership settings.",
  },
  mn: {
    title: "Аналитик ба орлого",
    live: "Шууд",
    calls: "Нийт видео дуудлага",
    activeChats: "Идэвхтэй чат",
    minutes: "Харилцсан минут",
    queries: "хариулсан асуулт",
    inCall: "яг одоо дуудлагад",
    growth: "Энэ долоо хоногийн ухааны өсөлт",
    beliefs: "Шинэ итгэл үнэмшил",
    memories: "Шинэ дурсамж",
    skills: "Шинэ ур чадвар",
    growthEmpty: "Видео олборлож ухаанаа өсгөнө үү.",
    money: "Бүтээгчийн орлого",
    perQuery: "Асуулт тутмын орлого",
    perMinute: "Дуудлагын минут тутмын орлого",
    gross: "Нийт олсон",
    paid: "Олгосон",
    available: "Авах боломжтой",
    payout: "Төлбөр хүсэх",
    payoutDone: (v: string) => `${v} төлбөрийн хүсэлт илгээгдлээ. 3 ажлын өдөрт шийдвэрлэнэ.`,
    payoutEmpty: "Одоогоор олгох мөнгө алга.",
    rateHint: "Ханшийг Mind Ownership тохиргооноос авдаг.",
  },
};

function money(v: number, currency: string) {
  return `${v.toFixed(2)} ${currency}`;
}

export function AnalyticsPanel({ lang, ownership }: { lang: "en" | "mn"; ownership: Ownership }) {
  const t = copy[lang];
  const [data, setData] = useState<Analytics>(() => emptyAnalytics());
  const [now, setNow] = useState(() => Date.now());
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const a = await loadAnalytics();
      if (alive) setData(a);
    };
    void pull();
    const poll = setInterval(() => void pull(), 4000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  const s: AnalyticsSummary = summarize(data, ownership, now);

  const onPayout = useCallback(async () => {
    if (s.available <= 0) {
      toast.error(t.payoutEmpty);
      return;
    }
    setPaying(true);
    const next = await requestPayout(s.available, s.currency);
    setData(next);
    setPaying(false);
    toast.success(t.payoutDone(money(s.available, s.currency)));
  }, [s.available, s.currency, t]);

  const stats = [
    { key: "calls", icon: Video, label: t.calls, value: String(s.totalCalls), note: `${s.activeCalls} ${t.inCall}` },
    {
      key: "chats",
      icon: MessagesSquare,
      label: t.activeChats,
      value: String(s.activeChats),
      note: `${s.totalQueries} ${t.queries}`,
    },
    {
      key: "minutes",
      icon: Timer,
      label: t.minutes,
      value: s.engagementMinutes.toFixed(1),
      note: `${s.callMinutes.toFixed(1)} min · call`,
    },
  ];

  const growth = [
    { key: "beliefs", label: t.beliefs, value: s.weekBeliefs },
    { key: "memories", label: t.memories, value: s.weekMemories },
    { key: "skills", label: t.skills, value: s.weekSkills },
  ];

  return (
    <section id="analytics" className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {t.live}
        </span>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        {stats.map((st) => {
          const Icon = st.icon;
          return (
            <div key={st.key} className="min-w-0 rounded-xl border border-border bg-muted p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <p className="truncate text-xs font-medium uppercase tracking-wider">{st.label}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{st.value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{st.note}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-xl border border-border bg-muted p-4">
        <div className="flex items-center gap-2 text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">{t.growth}</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {growth.map((g) => (
            <div key={g.key} className="rounded-lg border border-border bg-card px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{g.label}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-primary">+{g.value}</p>
            </div>
          ))}
        </div>
        {s.weekBeliefs + s.weekMemories + s.weekSkills === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">{t.growthEmpty}</p>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-border bg-muted p-4">
        <div className="flex items-center gap-2 text-foreground">
          <Coins className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">{t.money}</p>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {[
            [t.perQuery, money(s.queryEarnings, s.currency)],
            [t.perMinute, money(s.callEarnings, s.currency)],
            [t.gross, money(s.gross, s.currency)],
            [t.paid, money(s.paidOut, s.currency)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium tabular-nums text-foreground">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">{t.available}</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{money(s.available, s.currency)}</p>
          </div>
          <button
            onClick={() => void onPayout()}
            disabled={paying || s.available <= 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {t.payout}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t.rateHint}</p>
      </div>
    </section>
  );
}
