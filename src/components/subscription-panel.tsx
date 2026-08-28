import { useEffect, useState } from "react";
import { CreditCard, Check, Percent, Wallet } from "lucide-react";
import {
  PLATFORM_COMMISSION,
  PRICE_HINTS,
  createPlan,
  formatMoney,
  loadPlan,
  savePlan,
  splitRevenue,
  type SubscriptionPlan,
} from "@/lib/subscription";
import type { Lang } from "@/lib/i18n";

const copy = {
  en: {
    title: "Monetization",
    hint: "Fans pay a flat monthly price for full access to your AI clone — chat, voice and video calls.",
    freeMode: "Free",
    paidMode: "Paid",
    freeNote: "Free mode is on — anyone can chat with your AI clone for free. Switch to Paid any time.",
    price: "Monthly price — set any amount you want",
    priceHint: "No caps, no fixed tiers. Type $1, $250 or anything in between. 0 means free access.",
    currency: "Currency",
    perks: "What subscribers get",
    hints: "Quick fill (optional)",
    freeChip: "Free",
    split: "Revenue split",
    gross: "Subscriber pays",
    fee: `Platform commission (${Math.round(PLATFORM_COMMISSION * 100)}%)`,
    net: "You receive",
    per100: "At 100 subscribers",
    payoutLater: "Payouts later",
    payoutLaterHint:
      "You don't need a wallet or bank details to publish. Earnings collect as Unclaimed Earnings — connect a payout method only when you decide to withdraw.",
  },
  mn: {
    title: "Орлого",
    hint: "Дэмжигчид таны AI хуулбартай чат, дуу, видео дуудлагаар бүрэн харилцах сарын төлбөр төлнө.",
    freeMode: "Үнэгүй",
    paidMode: "Төлбөртэй",
    freeNote: "Үнэгүй горим идэвхтэй — хэн ч таны AI клонтой үнэгүй чатлаж чадна. Хүссэн үедээ Төлбөртэй болгож сольж болно.",
    price: "Сарын үнэ — дурын дүн тавь",
    priceHint: "Хязгаар, тогтсон багц байхгүй. $1, $250 эсвэл дурын дүн бичиж болно. 0 бол үнэгүй.",
    currency: "Валют",
    perks: "Захиалагч юу авах вэ",
    hints: "Түргэн бөглөх (заавал биш)",
    freeChip: "Үнэгүй",
    split: "Орлогын хуваарилалт",
    gross: "Захиалагчийн төлбөр",
    fee: `Платформын шимтгэл (${Math.round(PLATFORM_COMMISSION * 100)}%)`,
    net: "Танд ногдох",
    per100: "100 захиалагчтай үед",
    payoutLater: "Төлбөрөө дараа холбоно",
    payoutLaterHint:
      "Нийтлэхэд хэтэвч, дансны мэдээлэл шаардлагагүй. Орлого “Аваагүй орлого” болж хуримтлагдана — та мөнгөө авахаар шийдсэн үедээ л төлбөрийн суваг холбоно.",
  },
  ko: {
    title: "수익화",
    hint: "팬들은 월 정액 요금으로 당신의 AI 클론에 완전히 접근합니다 — 채팅, 음성, 영상 통화 포함.",
    freeMode: "무료",
    paidMode: "유료",
    freeNote: "무료 모드가 켜져 있습니다 — 누구나 당신의 AI 클론과 무료로 대화할 수 있습니다. 언제든 유료로 전환할 수 있습니다.",
    price: "월 요금 — 원하는 금액을 설정하세요",
    priceHint: "상한선이나 고정 등급이 없습니다. $1, $250 또는 그 사이 아무 값이나 입력하세요. 0은 무료 이용을 뜻합니다.",
    currency: "통화",
    perks: "구독자가 받는 혜택",
    hints: "빠른 입력 (선택 사항)",
    freeChip: "무료",
    split: "수익 분배",
    gross: "구독자 결제액",
    fee: `플랫폼 수수료 (${Math.round(PLATFORM_COMMISSION * 100)}%)`,
    net: "실수령액",
    per100: "구독자 100명 기준",
    payoutLater: "출금은 나중에",
    payoutLaterHint:
      "공개하는 데 지갑이나 은행 정보가 필요하지 않습니다. 수익은 '미청구 수익'으로 쌓이며, 출금하기로 결정했을 때만 결제 수단을 연결하면 됩니다.",
  },
} as const;

export function SubscriptionPanel({ lang }: { lang: Lang; creatorEmail?: string }) {
  const t = copy[lang];
  const [plan, setPlan] = useState<SubscriptionPlan>(createPlan);
  const [hydrated, setHydrated] = useState(false);
  const [priceText, setPriceText] = useState("");

  useEffect(() => {
    void (async () => {
      const next = await loadPlan();
      setPlan(next);
      setPriceText(String(next.monthlyPrice));
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => void savePlan(plan), 400);
    return () => clearTimeout(id);
  }, [hydrated, plan]);

  const setPrice = (value: number) => {
    setPriceText(String(value));
    setPlan((p) => ({ ...p, monthlyPrice: value }));
  };

  const one = splitRevenue(plan.monthlyPrice);
  const hundred = splitRevenue(plan.monthlyPrice, 100);

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
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="subPrice" className="mb-2 block text-sm text-muted-foreground">{t.price}</label>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 focus-within:border-primary">
                <span className="text-sm text-muted-foreground">{plan.currency}</span>
                <input
                  id="subPrice"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={priceText}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setPriceText(raw);
                    const n = Number(raw);
                    setPlan((p) => ({ ...p, monthlyPrice: Number.isFinite(n) && n > 0 ? n : 0 }));
                  }}
                  onBlur={() => setPriceText(String(plan.monthlyPrice))}
                  className="w-full bg-transparent py-2.5 text-sm text-foreground outline-none"
                />
                <span className="text-xs text-muted-foreground">/mo</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{t.priceHint}</p>
            </div>
            <div>
              <label htmlFor="subCurrency" className="mb-2 block text-sm text-muted-foreground">{t.currency}</label>
              <input
                id="subCurrency"
                value={plan.currency}
                onChange={(e) => setPlan((p) => ({ ...p, currency: e.target.value.toUpperCase().slice(0, 4) }))}
                className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>
            <div className="sm:col-span-3">
              <span className="mb-2 block text-sm text-muted-foreground">{t.hints}</span>
              <div className="flex flex-wrap gap-2">
                {PRICE_HINTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrice(p)}
                    className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {p === 0 ? t.freeChip : `$${p}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="subPerks" className="mb-2 block text-sm text-muted-foreground">{t.perks}</label>
              <textarea
                id="subPerks"
                rows={2}
                value={plan.perks}
                onChange={(e) => setPlan((p) => ({ ...p, perks: e.target.value }))}
                className="w-full resize-y rounded-lg border border-border bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[12px] border border-border bg-muted/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Percent className="h-4 w-4 text-primary" /> {t.split}
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t.gross}</dt>
                  <dd className="font-mono text-foreground">{formatMoney(one.gross, plan.currency)}/mo</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{t.fee}</dt>
                  <dd className="font-mono text-status-amber">−{formatMoney(one.commission, plan.currency)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-border pt-2">
                  <dt className="font-medium text-foreground">{t.net}</dt>
                  <dd className="font-mono font-semibold text-status-green">{formatMoney(one.net, plan.currency)}</dd>
                </div>
                <div className="flex justify-between gap-3 text-xs">
                  <dt className="text-muted-foreground">{t.per100}</dt>
                  <dd className="font-mono text-muted-foreground">{formatMoney(hundred.net, plan.currency)}/mo</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-[12px] border border-border bg-muted/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Wallet className="h-4 w-4 text-primary" /> {t.payoutLater}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t.payoutLaterHint}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
