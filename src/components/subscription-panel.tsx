import { useEffect, useState } from "react";
import { CreditCard, Check, Percent, Wallet } from "lucide-react";
import {
  PLATFORM_COMMISSION,
  PLAN_LENGTHS,
  PRICE_HINTS,
  createPlan,
  formatMoney,
  loadPlan,
  savePlan,
  splitRevenue,
  type PlanLength,
  type SubscriptionPlan,
} from "@/lib/subscription";
import { pickCopy, type Lang } from "@/lib/i18n";

const copy = {
  en: {
    title: "Monetization",
    hint: "Fans pay for full access to your AI clone — chat, voice and video calls. Offer as many plan lengths as you like.",
    freeMode: "Free",
    paidMode: "Paid",
    freeNote: "Free mode is on — anyone can chat with your AI clone for free. Switch to Paid any time.",
    lengths: "Plan lengths you offer",
    lengthsHint: "Turn on the lengths you want and set any price. Lifetime is a one-time payment that never expires.",
    price: "Price",
    currency: "Currency",
    perks: "What subscribers get",
    hints: "Quick fill (optional)",
    freeChip: "Free",
    split: "You receive after commission",
    fee: `Platform commission (${Math.round(PLATFORM_COMMISSION * 100)}%)`,
    noneOn: "Turn on at least one plan length so fans can subscribe.",
    payoutLater: "Payouts later",
    payoutLaterHint:
      "You don't need a wallet or bank details to publish. Earnings collect as Unclaimed Earnings — connect a payout method only when you decide to withdraw.",
    names: { month: "1 month", quarter: "3 months", year: "1 year", lifetime: "Lifetime" },
  },
  mn: {
    title: "Орлого",
    hint: "Дэмжигчид таны AI хуулбартай чат, дуу, видеогоор бүрэн харилцахын төлөө төлнө. Хүссэн хугацааны багцаа санал болго.",
    freeMode: "Үнэгүй",
    paidMode: "Төлбөртэй",
    freeNote: "Үнэгүй горим идэвхтэй — хэн ч таны AI клонтой үнэгүй чатлаж чадна. Хүссэн үедээ Төлбөртэй болгоно.",
    lengths: "Санал болгох хугацаанууд",
    lengthsHint: "Хүссэн хугацаагаа асааж дурын үнэ тавь. Насан туршийн багц нэг удаа төлөгдөж, хэзээ ч дуусахгүй.",
    price: "Үнэ",
    currency: "Валют",
    perks: "Захиалагч юу авах вэ",
    hints: "Түргэн бөглөх (заавал биш)",
    freeChip: "Үнэгүй",
    split: "Шимтгэлийн дараа танд",
    fee: `Платформын шимтгэл (${Math.round(PLATFORM_COMMISSION * 100)}%)`,
    noneOn: "Дор хаяж нэг хугацааг асаавал дэмжигчид захиалж чадна.",
    payoutLater: "Төлбөрөө дараа холбоно",
    payoutLaterHint:
      "Нийтлэхэд хэтэвч, дансны мэдээлэл шаардлагагүй. Орлого “Аваагүй орлого” болж хуримтлагдана — мөнгөө авахаар шийдсэн үедээ л төлбөрийн суваг холбоно.",
    names: { month: "1 сар", quarter: "3 сар", year: "1 жил", lifetime: "Насан турш" },
  },
  ko: {
    title: "수익화",
    hint: "팬들은 당신의 AI 클론에 완전히 접근하기 위해 결제합니다 — 채팅, 음성, 영상 통화. 원하는 기간제를 자유롭게 제공하세요.",
    freeMode: "무료",
    paidMode: "유료",
    freeNote: "무료 모드가 켜져 있습니다 — 누구나 무료로 대화할 수 있습니다. 언제든 유료로 전환할 수 있습니다.",
    lengths: "제공하는 구독 기간",
    lengthsHint: "원하는 기간을 켜고 금액을 입력하세요. 평생 이용권은 1회 결제로 만료되지 않습니다.",
    price: "가격",
    currency: "통화",
    perks: "구독자가 받는 혜택",
    hints: "빠른 입력 (선택 사항)",
    freeChip: "무료",
    split: "수수료 후 실수령액",
    fee: `플랫폼 수수료 (${Math.round(PLATFORM_COMMISSION * 100)}%)`,
    noneOn: "최소 한 가지 기간을 켜야 팬이 구독할 수 있습니다.",
    payoutLater: "출금은 나중에",
    payoutLaterHint:
      "공개하는 데 지갑이나 은행 정보가 필요하지 않습니다. 수익은 '미청구 수익'으로 쌓이며, 출금할 때만 결제 수단을 연결하면 됩니다.",
    names: { month: "1개월", quarter: "3개월", year: "1년", lifetime: "평생" },
  },
} as const;

export function SubscriptionPanel({ lang }: { lang: Lang; creatorEmail?: string }) {
  const t = pickCopy(copy, lang);
  const [plan, setPlan] = useState<SubscriptionPlan>(createPlan);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void (async () => {
      setPlan(await loadPlan());
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => void savePlan(plan), 400);
    return () => clearTimeout(id);
  }, [hydrated, plan]);

  const setTier = (length: PlanLength, patch: { enabled?: boolean; price?: number }) =>
    setPlan((p) => ({ ...p, tiers: { ...p.tiers, [length]: { ...p.tiers[length], ...patch } } }));

  const anyOn = PLAN_LENGTHS.some((l) => plan.tiers[l]?.enabled);

  return (
    <section id="subscription" className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CreditCard className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
        <div className="ml-auto flex items-center gap-2 rounded-full border border-border bg-muted/50 p-1">
          {([false, true] as const).map((paid) => (
            <button
              key={String(paid)}
              type="button"
              role="switch"
              aria-checked={plan.enabled === paid}
              onClick={() => setPlan((p) => ({ ...p, enabled: paid }))}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                plan.enabled === paid
                  ? paid
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {paid ? t.paidMode : t.freeMode}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t.hint}</p>

      {!plan.enabled ? (
        <p className="flex items-center gap-2 rounded-[12px] border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-foreground">
          <Check className="h-4 w-4 shrink-0 text-status-green" /> {t.freeNote}
        </p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">{t.lengths}</span>
            <span className="text-xs text-muted-foreground">{t.lengthsHint}</span>
          </div>

          <div className="grid gap-3">
            {PLAN_LENGTHS.map((length) => {
              const tier = plan.tiers[length];
              const net = splitRevenue(tier.price).net;
              return (
                <div
                  key={length}
                  className={`rounded-[12px] border p-4 transition-colors ${
                    tier.enabled ? "border-primary/40 bg-muted/40" : "border-border bg-muted/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={tier.enabled}
                      aria-label={t.names[length]}
                      onClick={() => setTier(length, { enabled: !tier.enabled })}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        tier.enabled ? "bg-primary" : "bg-border"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-card transition-all ${
                          tier.enabled ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                    <span className="text-sm font-semibold text-foreground">{t.names[length]}</span>

                    {tier.enabled && (
                      <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-muted px-3 focus-within:border-primary">
                        <span className="text-xs text-muted-foreground">{plan.currency}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.01"
                          aria-label={`${t.names[length]} ${t.price}`}
                          value={tier.price}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setTier(length, { price: Number.isFinite(n) && n > 0 ? n : 0 });
                          }}
                          className="w-24 bg-transparent py-2 text-sm text-foreground outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {tier.enabled && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {PRICE_HINTS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setTier(length, { price: p })}
                          className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                        >
                          {p === 0 ? t.freeChip : `$${p}`}
                        </button>
                      ))}
                      <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Percent className="h-3.5 w-3.5 text-primary" />
                        {t.split}{" "}
                        <span className="font-mono font-semibold text-status-green">
                          {formatMoney(net, plan.currency)}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!anyOn && (
            <p className="mt-3 rounded-[12px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
              {t.noneOn}
            </p>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="subCurrency" className="mb-2 block text-sm text-muted-foreground">{t.currency}</label>
              <input
                id="subCurrency"
                value={plan.currency}
                onChange={(e) => setPlan((p) => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 4) }))}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="subPerks" className="mb-2 block text-sm text-muted-foreground">{t.perks}</label>
              <textarea
                id="subPerks"
                rows={2}
                value={plan.perks}
                onChange={(e) => setPlan((p) => ({ ...p, perks: e.target.value }))}
                className="w-full resize-y rounded-lg border border-border bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>
            <div className="sm:col-span-3 rounded-[12px] border border-border bg-muted/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Wallet className="h-4 w-4 text-primary" /> {t.payoutLater}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t.payoutLaterHint}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t.fee}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
