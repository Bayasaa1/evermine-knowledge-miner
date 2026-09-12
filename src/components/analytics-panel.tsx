import { useCallback, useEffect, useState } from "react";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
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
import { PayoutSetup } from "@/components/payout-setup";
import {
  emptyPayoutSettings,
  loadPayoutSettings,
  maskDestination,
  type PayoutSettings,
} from "@/lib/payouts";
import { pickCopy, type Lang } from "@/lib/i18n";

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
    unclaimed: "Unclaimed earnings",
    connectPrompt: "Connect payout method to withdraw",
    payoutVia: "Paid out via",
    change: "Change method",
    channelNames: { stripe: "Stripe", paypal: "PayPal", crypto: "Crypto wallet", bank: "Bank transfer" },
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
    unclaimed: "Аваагүй орлого",
    connectPrompt: "Мөнгөө авахын тулд төлбөрийн суваг холбоно уу",
    payoutVia: "Төлбөрийн суваг",
    change: "Суваг солих",
    channelNames: { stripe: "Stripe", paypal: "PayPal", crypto: "Крипто хэтэвч", bank: "Банк шилжүүлэг" },
  },
  ko: {
    title: "분석 및 수익",
    live: "실시간",
    calls: "총 영상 통화",
    activeChats: "활성 채팅 세션",
    minutes: "참여 시간(분)",
    queries: "건 답변",
    inCall: "통화 중",
    growth: "이번 주 마인드 성장",
    beliefs: "새로운 신념",
    memories: "새로운 기억",
    skills: "새로운 스킬",
    growthEmpty: "영상을 채굴해 이번 주 마인드를 성장시켜 보세요.",
    money: "창작자 수익화",
    perQuery: "질문당 수익",
    perMinute: "통화 분당 수익",
    gross: "총 수익",
    paid: "이미 지급됨",
    available: "출금 가능 금액",
    payout: "출금 요청",
    payoutDone: (v: string) => `${v} 출금이 요청되었습니다. 영업일 기준 3일 이내에 처리됩니다.`,
    payoutEmpty: "아직 출금할 금액이 없습니다.",
    rateHint: "요율은 Mind Ownership 설정에서 가져옵니다.",
    unclaimed: "미청구 수익",
    connectPrompt: "출금하려면 결제 수단을 연결하세요",
    payoutVia: "지급 방식",
    change: "방식 변경",
    channelNames: { stripe: "Stripe", paypal: "PayPal", crypto: "암호화폐 지갑", bank: "은행 송금" },
  },
};

function money(v: number, currency: string) {
  return `${v.toFixed(2)} ${currency}`;
}

export function AnalyticsPanel({ lang, ownership }: { lang: Lang; ownership: Ownership }) {
  const t = pickCopy(copy, lang);
  const [data, setData] = useState<Analytics>(() => emptyAnalytics());
  const [now, setNow] = useState(() => Date.now());
  const [paying, setPaying] = useState(false);
  // Payout details are collected lazily — only when the creator withdraws.
  const [payout, setPayout] = useState<PayoutSettings>(() => emptyPayoutSettings());
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    void (async () => setPayout(await loadPayoutSettings()))();
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const a = await loadAnalytics();
      if (alive) setData(a);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Only refreshes while the tab is actually open.
  useVisibleInterval(() => void loadAnalytics().then(setData), 4000);
  useVisibleInterval(() => setNow(Date.now()), 1000);

  const s: AnalyticsSummary = summarize(data, ownership, now);

  const onPayout = useCallback(async () => {
    if (s.available <= 0) {
      toast.error(t.payoutEmpty);
      return;
    }
    if (!payout.method) {
      setSetupOpen(true);
      return;
    }
    setPaying(true);
    const next = await requestPayout(s.available, s.currency);
    setData(next);
    setPaying(false);
    toast.success(t.payoutDone(money(s.available, s.currency)));
  }, [payout.method, s.available, s.currency, t]);

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
            <p className="text-xs text-muted-foreground">{t.unclaimed}</p>
            <p className="text-2xl font-semibold tabular-nums text-foreground">{money(s.available, s.currency)}</p>
            {payout.method && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t.payoutVia}: {t.channelNames[payout.method.channel]} · {maskDestination(payout.method.destination)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {payout.method && (
              <button
                type="button"
                onClick={() => setSetupOpen((v) => !v)}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {t.change}
              </button>
            )}
            <button
              onClick={() => void onPayout()}
              disabled={paying || s.available <= 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {payout.method ? t.payout : t.connectPrompt}
            </button>
          </div>
        </div>
        {setupOpen && (
          <div className="mt-3">
            <PayoutSetup
              lang={lang}
              defaultEmail={ownership.creatorEmail ?? ""}
              onConnected={(next) => {
                setPayout(next);
                setSetupOpen(false);
              }}
            />
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t.rateHint}</p>
      </div>
    </section>
  );
}
