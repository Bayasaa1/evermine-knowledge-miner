import { useEffect, useState } from "react";
import { Cpu, Gauge, Wallet, RotateCcw } from "lucide-react";
import {
  clearUsage,
  loadUsage,
  rateFor,
  summarizeUsage,
  type ProviderUsage,
  type UsageLedger,
  type UsageSummary,
} from "@/lib/token-usage";
import { pickCopy, type Lang } from "@/lib/i18n";

const copy = {
  en: {
    title: "AI tokens & spend",
    sub: "Every AI call your account made, what it burned and what it cost.",
    totalTokens: "Total tokens used",
    todayTokens: "Used today",
    freeLeft: "Free tokens left today",
    spend: "Money the APIs charged",
    todaySpend: "today",
    calls: "AI calls",
    provider: "AI",
    used: "Tokens used",
    inOut: "in / out",
    left: "Free left today",
    cost: "Cost",
    none: "No AI calls yet. Mine a video and this fills up automatically.",
    reset: "Clear history",
    free: "Free",
    paid: "Paid",
    note: "Costs are estimated from each provider's own token counts and public prices — not a bill.",
    lastCall: "Last call",
    creditsTitle: "AI credits today",
    creditsSub: "One credit = one AI call. Resets every midnight.",
    callsUsed: "used today",
    callsLeft: "left today",
    unlimited: "Pay per use — no daily call limit",
    creditsNone: "No AI calls today yet.",
  },
  mn: {
    title: "AI токен ба зарлага",
    sub: "Таны бүртгэлийн хийсэн бүх AI дуудлага, зарцуулсан токен, төлсөн мөнгө.",
    totalTokens: "Нийт ашигласан токен",
    todayTokens: "Өнөөдөр ашигласан",
    freeLeft: "Өнөөдөр үлдсэн үнэгүй токен",
    spend: "API-д төлсөн мөнгө",
    todaySpend: "өнөөдөр",
    calls: "AI дуудлага",
    provider: "AI",
    used: "Ашигласан токен",
    inOut: "орсон / гарсан",
    left: "Өнөөдөр үлдсэн",
    cost: "Зардал",
    none: "Одоогоор AI дуудлага алга. Видео олборловол автоматаар бөглөгдөнө.",
    reset: "Түүх цэвэрлэх",
    free: "Үнэгүй",
    paid: "Төлбөртэй",
    note: "Зардлыг тухайн AI-ийн токен тоо, нийтэлсэн үнээр тооцсон тооцоолол — албан ёсны нэхэмжлэх биш.",
    lastCall: "Сүүлийн дуудлага",
    creditsTitle: "Өнөөдрийн AI кредит",
    creditsSub: "1 кредит = 1 AI дуудлага. Шөнө дунд шинэчлэгдэнэ.",
    callsUsed: "өнөөдөр ашигласан",
    callsLeft: "өнөөдөр үлдсэн",
    unlimited: "Ашигласнаараа төлдөг — өдрийн хязгааргүй",
    creditsNone: "Өнөөдөр AI дуудлага хийгээгүй байна.",
  },
  ko: {
    title: "AI 토큰 및 지출",
    sub: "계정에서 발생한 모든 AI 호출, 사용 토큰과 비용입니다.",
    totalTokens: "총 사용 토큰",
    todayTokens: "오늘 사용",
    freeLeft: "오늘 남은 무료 토큰",
    spend: "API 청구 금액",
    todaySpend: "오늘",
    calls: "AI 호출",
    provider: "AI",
    used: "사용 토큰",
    inOut: "입력 / 출력",
    left: "오늘 남은 무료",
    cost: "비용",
    none: "아직 AI 호출이 없습니다. 영상을 채굴하면 자동으로 채워집니다.",
    reset: "기록 지우기",
    free: "무료",
    paid: "유료",
    note: "비용은 각 제공사의 토큰 수와 공개 단가로 추정한 값이며 청구서가 아닙니다.",
    lastCall: "마지막 호출",
    creditsTitle: "오늘의 AI 크레딧",
    creditsSub: "크레딧 1 = AI 호출 1회. 매일 자정에 초기화됩니다.",
    callsUsed: "오늘 사용",
    callsLeft: "오늘 남음",
    unlimited: "사용량 과금 — 일일 호출 제한 없음",
    creditsNone: "오늘은 아직 AI 호출이 없습니다.",
  },
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function usd(n: number): string {
  return n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`;
}

export function TokenUsagePanel({ lang }: { lang: Lang }) {
  const t = pickCopy(copy, lang);
  const [ledger, setLedger] = useState<UsageLedger>({ entries: [] });

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const l = await loadUsage();
      if (alive) setLedger(l);
    };
    void pull();
    const poll = setInterval(() => void pull(), 5000);
    return () => {
      alive = false;
      clearInterval(poll);
    };
  }, []);

  const s: UsageSummary = summarizeUsage(ledger);

  const cards = [
    { key: "total", icon: Cpu, label: t.totalTokens, value: fmt(s.totalTokens), note: `${s.totalCalls} ${t.calls}` },
    { key: "today", icon: Gauge, label: t.todayTokens, value: fmt(s.todayTokens), note: `${t.freeLeft}: ${fmt(s.remainingFreeToday)}` },
    { key: "spend", icon: Wallet, label: t.spend, value: usd(s.totalCost), note: `${usd(s.todayCost)} ${t.todaySpend}` },
  ];

  // Per-AI credit counters: how many calls each AI has burned today and how
  // many of its free daily calls are still available.
  const credits = (
    <div className="mt-5 min-w-0 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold text-foreground">{t.creditsTitle}</h4>
        <p className="text-xs text-muted-foreground">{t.creditsSub}</p>
        <p className="ml-auto text-xs tabular-nums text-muted-foreground">
          {s.callsToday} {t.callsUsed} · {s.remainingCallsToday} {t.callsLeft}
        </p>
      </div>
      {s.providers.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{t.creditsNone}</p>
      ) : (
        <ul className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          {s.providers.map((p) => {
            const capped = p.dailyFreeCalls > 0;
            const left = p.callsLeftToday ?? 0;
            const pct = capped ? Math.min(100, Math.round((p.callsToday / p.dailyFreeCalls) * 100)) : 0;
            const low = capped && left <= Math.max(1, Math.round(p.dailyFreeCalls * 0.1));
            return (
              <li key={p.provider} className="min-w-0 rounded-lg border border-border bg-muted p-3">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{p.label}</span>
                  <span className="ml-auto shrink-0 text-sm tabular-nums text-foreground">
                    {p.callsToday}
                    {capped ? ` / ${p.dailyFreeCalls}` : ""}
                  </span>
                </div>
                {capped ? (
                  <>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background">
                      <div
                        className={`h-full rounded-full transition-all ${low ? "bg-destructive" : "bg-primary"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className={`mt-1.5 text-xs tabular-nums ${low ? "text-destructive" : "text-muted-foreground"}`}>
                      {left} {t.callsLeft}
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 text-xs text-muted-foreground">{t.unlimited}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <section id="tokens" className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cpu className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
          <p className="text-xs text-muted-foreground">{t.sub}</p>
        </div>
        {s.totalCalls > 0 && (
          <button
            type="button"
            onClick={() => void clearUsage().then(() => setLedger({ entries: [] }))}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t.reset}
          </button>
        )}
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="min-w-0 rounded-xl border border-border bg-muted p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <p className="truncate text-xs font-medium uppercase tracking-wider">{c.label}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{c.value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{c.note}</p>
            </div>
          );
        })}
      </div>

      {credits}

      <div className="mt-4 min-w-0 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{t.provider}</th>
              <th className="px-3 py-2 font-medium">{t.used}</th>
              <th className="px-3 py-2 font-medium">{t.inOut}</th>
              <th className="px-3 py-2 font-medium">{t.left}</th>
              <th className="px-3 py-2 text-right font-medium">{t.cost}</th>
            </tr>
          </thead>
          <tbody>
            {s.providers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t.none}
                </td>
              </tr>
            )}
            {s.providers.map((p) => (
              <tr key={p.provider} className="border-t border-border">
                <td className="px-3 py-2">
                  <span className="font-medium text-foreground">{p.label}</span>
                  <span
                    className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      p.free
                        ? "border-emerald-500/40 text-emerald-400"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {p.free ? t.free : t.paid}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">{p.calls}×</span>
                </td>
                <td className="px-3 py-2 tabular-nums text-foreground">{fmt(p.totalTokens)}</td>
                <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground">
                  {fmt(p.inputTokens)} / {fmt(p.outputTokens)}
                </td>
                <td className="px-3 py-2 tabular-nums text-xs text-muted-foreground">
                  {p.dailyFreeTokens > 0 ? fmt(p.remainingToday) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{usd(p.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {t.note}
        {s.lastCallAt ? ` · ${t.lastCall}: ${new Date(s.lastCallAt).toLocaleString()}` : ""}
      </p>
    </section>
  );
}
