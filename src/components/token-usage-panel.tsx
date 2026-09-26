/**
 * Live token & spend meters for the signed-in account.
 *
 * Every number here comes from the account's own server-side usage records, the
 * same source the History list below it reads, so the headline figures can
 * never disagree with the detailed list.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useVisibleInterval } from "@/hooks/use-visible-interval";
import { Cpu, Gauge, Wallet } from "lucide-react";
import { getUsageMeters, type UsageMeters } from "@/lib/ai-usage.functions";
import { rateFor } from "@/lib/token-usage";
import { rateOf } from "@/lib/ai-rates";
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
    geminiTitle: "Gemini free quota",
    geminiCalls: "Free calls left today",
    geminiTokens: "Free tokens left today",
    resetIn: "Resets in",
    resetAt: "at",
    byJob: "Today, by job",
    signIn: "Sign in to see your tokens and spend.",
    roles: {
      translate: "Translation",
      mine: "Mining videos",
      mine_write: "Mining write-up",
      chat: "Chat",
      core_brain: "Core Brain",
      face_clone: "Seeing on video calls",
      voice_clone: "Voice clone",
    } as Record<string, string>,
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
    geminiTitle: "Gemini-ийн үнэгүй эрх",
    geminiCalls: "Өнөөдөр үлдсэн үнэгүй дуудлага",
    geminiTokens: "Өнөөдөр үлдсэн үнэгүй токен",
    resetIn: "Шинэчлэгдэх хугацаа",
    resetAt: "цагт",
    byJob: "Өнөөдөр, ажлаар",
    signIn: "Токен, зарлагаа харахын тулд нэвтэрнэ үү.",
    roles: {
      translate: "Орчуулга",
      mine: "Видео олборлолт",
      mine_write: "Олборлолтын бичилт",
      chat: "Чат",
      core_brain: "Core Brain",
      face_clone: "Видео дуудлагын хараа",
      voice_clone: "Дуу хуулбар",
    } as Record<string, string>,
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
    geminiTitle: "Gemini 무료 한도",
    geminiCalls: "오늘 남은 무료 호출",
    geminiTokens: "오늘 남은 무료 토큰",
    resetIn: "초기화까지",
    resetAt: "시각",
    byJob: "오늘, 작업별",
    signIn: "로그인하면 토큰과 비용을 볼 수 있습니다.",
    roles: {
      translate: "번역",
      mine: "영상 마이닝",
      mine_write: "마이닝 정리",
      chat: "채팅",
      core_brain: "코어 브레인",
      face_clone: "영상 통화 시각",
      voice_clone: "음성 복제",
    } as Record<string, string>,
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

const EMPTY: UsageMeters = {
  totalTokens: 0,
  totalCalls: 0,
  todayTokens: 0,
  todayCalls: 0,
  totalCost: 0,
  todayCost: 0,
  lastCallAt: null,
  providers: [],
  byRoleToday: [],
};

export function TokenUsagePanel({ lang }: { lang: Lang }) {
  const t = pickCopy(copy, lang);
  const load = useServerFn(getUsageMeters);
  const [meters, setMeters] = useState<UsageMeters>(EMPTY);
  const [signedOut, setSignedOut] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const m = await load({});
      setMeters(m);
      setSignedOut(false);
    } catch {
      // Not signed in, or the network blinked — keep the last numbers shown.
      setSignedOut((was) => was || meters.totalCalls === 0);
    }
  }, [load, meters.totalCalls]);

  useEffect(() => {
    void refresh();
    // Loading once on mount; the interval below keeps it fresh afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useVisibleInterval(() => {
    setNow(Date.now());
    void refresh();
  }, 15_000);

  // Free daily allowances live in the local price list; how much of them is
  // already spent comes from the server records.
  const providers = meters.providers.map((p) => {
    const limits = rateFor(p.provider);
    const label = rateOf(p.provider).label || p.provider;
    const dailyFreeCalls = p.free ? limits.dailyFreeCalls : 0;
    const dailyFreeTokens = p.free ? limits.dailyFreeTokens : 0;
    return {
      ...p,
      label,
      dailyFreeCalls,
      dailyFreeTokens,
      callsLeftToday: dailyFreeCalls > 0 ? Math.max(0, dailyFreeCalls - p.callsToday) : null,
      remainingToday: dailyFreeTokens > 0 ? Math.max(0, dailyFreeTokens - p.todayTokens) : 0,
    };
  });

  const freeLeftToday = providers.reduce((n, p) => n + p.remainingToday, 0);
  const callsLeftToday = providers.reduce((n, p) => n + (p.callsLeftToday ?? 0), 0);

  const cards = [
    { key: "total", icon: Cpu, label: t.totalTokens, value: fmt(meters.totalTokens), note: `${meters.totalCalls} ${t.calls}` },
    { key: "today", icon: Gauge, label: t.todayTokens, value: fmt(meters.todayTokens), note: `${t.freeLeft}: ${fmt(freeLeftToday)}` },
    { key: "spend", icon: Wallet, label: t.spend, value: usd(meters.totalCost), note: `${usd(meters.todayCost)} ${t.todaySpend}` },
  ];

  // Gemini is the default engine, so its remaining free allowance and the exact
  // moment it refills get their own headline card.
  const geminiRows = providers.filter((p) => p.provider.startsWith("gemini") && p.free);
  const geminiRate = rateFor("gemini");
  const geminiCallsUsed = geminiRows.reduce((n, p) => n + p.callsToday, 0);
  const geminiTokensUsed = geminiRows.reduce((n, p) => n + p.todayTokens, 0);
  const geminiFreeCalls = geminiRate.dailyFreeCalls;
  const geminiFreeTokens = geminiRate.dailyFreeTokens;
  const geminiCallsLeft = Math.max(0, geminiFreeCalls - geminiCallsUsed);
  const geminiTokensLeft = Math.max(0, geminiFreeTokens - geminiTokensUsed);
  const geminiPct = geminiFreeCalls > 0 ? Math.min(100, (geminiCallsUsed / geminiFreeCalls) * 100) : 0;

  const nextReset = new Date(now);
  nextReset.setHours(24, 0, 0, 0);
  const msLeft = Math.max(0, nextReset.getTime() - now);
  const hLeft = Math.floor(msLeft / 3_600_000);
  const mLeft = Math.floor((msLeft % 3_600_000) / 60_000);

  const geminiCard = (
    <div className="mt-4 min-w-0 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold text-foreground">{t.geminiTitle}</h4>
        <p className="ml-auto text-xs tabular-nums text-muted-foreground">
          {t.resetIn} {hLeft}h {mLeft}m · {t.resetAt} {nextReset.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">{t.geminiCalls}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {geminiCallsLeft}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/ {geminiFreeCalls}</span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${geminiPct}%` }} />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t.geminiTokens}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {fmt(geminiTokensLeft)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/ {fmt(geminiFreeTokens)}</span>
          </p>
        </div>
      </div>
    </div>
  );

  const credits = (
    <div className="mt-5 min-w-0 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-semibold text-foreground">{t.creditsTitle}</h4>
        <p className="text-xs text-muted-foreground">{t.creditsSub}</p>
        <p className="ml-auto text-xs tabular-nums text-muted-foreground">
          {meters.todayCalls} {t.callsUsed} · {callsLeftToday} {t.callsLeft}
        </p>
      </div>
      {providers.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{t.creditsNone}</p>
      ) : (
        <ul className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          {providers.map((p) => {
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
      </div>

      {signedOut && meters.totalCalls === 0 ? (
        <p className="text-sm text-muted-foreground">{t.signIn}</p>
      ) : (
        <>
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

          {geminiCard}
          {credits}

          {meters.byRoleToday.length > 0 && (
            <div className="mt-4 rounded-xl border border-border p-3">
              <p className="text-xs font-medium text-foreground">{t.byJob}</p>
              <ul className="mt-2 space-y-1">
                {meters.byRoleToday.map((row) => (
                  <li key={row.role} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t.roles[row.role] ?? row.role}</span>
                    <span className="tabular-nums text-foreground">
                      {row.calls}× · {fmt(row.tokens)} · {usd(row.cost)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
                {providers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {t.none}
                    </td>
                  </tr>
                )}
                {providers.map((p) => (
                  <tr key={p.provider} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="font-medium text-foreground">{p.label}</span>
                      <span
                        className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          p.free ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground"
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
            {meters.lastCallAt ? ` · ${t.lastCall}: ${new Date(meters.lastCallAt).toLocaleString()}` : ""}
          </p>
        </>
      )}
    </section>
  );
}
