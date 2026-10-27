import { useEffect, useState } from "react";
import { CreditCard, Check, Percent, Wallet, Landmark, Loader2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startCheckout, submitPaymentProof, type CheckoutOrder } from "@/lib/purchases.functions";
import type { CheckoutRequest } from "@/lib/purchases";
import { CreatorEarnings } from "@/components/payout-setup";
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
import { pickCopy, useLang, type Lang } from "@/lib/i18n";

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
          <div className="mt-5">
            <CreatorEarnings lang={lang} />
          </div>
        </>
      )}
    </section>
  );
}

/* ───────────── Buyer checkout: card link or bank / QR transfer ───────────── */

const checkoutCopy = {
  en: {
    title: "Checkout", plan: "Plan", total: "Total", card: "Card (Stripe)", bank: "Bank transfer / QR",
    cardHint: "Pay securely on the creator's Stripe page, then paste the receipt or payment ID below.",
    openStripe: "Open card payment", bankHint: "Transfer the exact amount and put this reference in the transfer description:",
    bankName: "Bank", account: "Account number", holder: "Account holder", reference: "Payment reference",
    txLabel: "Transaction ID / receipt number", txPlaceholder: "e.g. 1234567890",
    submit: "I've paid — send for confirmation", sending: "Sending…", copied: "Copied",
    loading: "Preparing your order…",
    pending: "Payment submitted. Access unlocks as soon as the creator confirms it.",
    cancelled: "Checkout closed — nothing was charged.",
    names: { month: "1 month", quarter: "3 months", year: "1 year", lifetime: "Lifetime Complete Edition" },
  },
  mn: {
    title: "Төлбөр төлөх", plan: "Багц", total: "Нийт", card: "Карт (Stripe)", bank: "Дансаар / QR",
    cardHint: "Бүтээгчийн Stripe хуудсаар төлөөд, баримтын эсвэл гүйлгээний дугаараа доор оруулна уу.",
    openStripe: "Картаар төлөх", bankHint: "Яг энэ дүнг шилжүүлж, гүйлгээний утга дээр энэ кодыг бичнэ үү:",
    bankName: "Банк", account: "Дансны дугаар", holder: "Данс эзэмшигч", reference: "Гүйлгээний код",
    txLabel: "Гүйлгээний дугаар / баримт", txPlaceholder: "жишээ нь 1234567890",
    submit: "Төлсөн — баталгаажуулалт илгээх", sending: "Илгээж байна…", copied: "Хуулсан",
    loading: "Захиалга бэлдэж байна…",
    pending: "Төлбөр илгээгдлээ. Бүтээгч баталгаажуулмагц нээгдэнэ.",
    cancelled: "Төлбөрийг хаалаа — мөнгө хасагдаагүй.",
    names: { month: "1 сар", quarter: "3 сар", year: "1 жил", lifetime: "Насан туршийн бүрэн хувилбар" },
  },
  ko: {
    title: "결제", plan: "플랜", total: "합계", card: "카드 (Stripe)", bank: "계좌이체 / QR",
    cardHint: "크리에이터의 Stripe 페이지에서 결제한 뒤 영수증 또는 결제 ID를 아래에 붙여 넣으세요.",
    openStripe: "카드 결제 열기", bankHint: "정확한 금액을 이체하고 이체 메모에 이 코드를 적어 주세요:",
    bankName: "은행", account: "계좌번호", holder: "예금주", reference: "결제 코드",
    txLabel: "거래 ID / 영수증 번호", txPlaceholder: "예: 1234567890",
    submit: "결제 완료 — 확인 요청", sending: "보내는 중…", copied: "복사됨",
    loading: "주문 준비 중…",
    pending: "결제가 제출되었습니다. 크리에이터가 확인하면 바로 열립니다.",
    cancelled: "결제를 닫았습니다 — 청구되지 않았습니다.",
    names: { month: "1개월", quarter: "3개월", year: "1년", lifetime: "평생 완전판" },
  },
} as const;

function CheckoutModal({ req, lang, onDone }: { req: CheckoutRequest; lang: Lang; onDone: (r: { error: string | null }) => void }) {
  const t = pickCopy(checkoutCopy, lang);
  const start = useServerFn(startCheckout);
  const submitProof = useServerFn(submitPaymentProof);
  const [method, setMethod] = useState<"bank" | "stripe">("bank");
  const [order, setOrder] = useState<CheckoutOrder | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState("");
  const [sending, setSending] = useState(false);
  const plan = (req.plan ?? "lifetime") as PlanLength;

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null); setOrder(null);
    void start({ data: { mindId: req.mindId, category: req.category, plan, method } })
      .then((r) => { if (!alive) return; if (r.ok && r.order) setOrder(r.order); else setErr(r.error); })
      .catch((e: unknown) => alive && setErr(e instanceof Error ? e.message : "Checkout failed"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [method, plan, req.mindId, req.category, start]);

  const send = async () => {
    if (!order) return;
    setSending(true);
    try {
      const r = await submitProof({ data: { orderId: order.orderId, transactionRef: tx } });
      if (!r.ok) return void toast.error(r.error ?? "Failed");
      onDone({ error: t.pending });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSending(false);
    }
  };

  const copy = (v: string) => void navigator.clipboard?.writeText(v).then(() => toast.success(t.copied));

  return (
    <Dialog open onOpenChange={(o) => !o && onDone({ error: t.cancelled })}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t.title}</DialogTitle></DialogHeader>
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">{t.plan}: <b className="text-foreground">{t.names[plan]}</b></span>
          {order && <span className="font-mono font-semibold text-foreground">{formatMoney(order.amount, order.currency)}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(["bank", "stripe"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${method === m ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
              {m === "bank" ? <Landmark className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
              {m === "bank" ? t.bank : t.card}
            </button>
          ))}
        </div>
        {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t.loading}</p>}
        {err && !loading && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground">{err}</p>}
        {order && !loading && (
          <div className="space-y-3 text-sm">
            {method === "bank" && order.bank && (
              <>
                <p className="text-muted-foreground">{t.bankHint}</p>
                <button type="button" onClick={() => copy(order.reference)}
                  className="flex w-full items-center justify-between rounded-lg border border-primary/50 bg-primary/10 px-3 py-2 font-mono text-lg font-bold text-primary">
                  {order.reference}<Copy className="h-4 w-4" />
                </button>
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">{t.bankName}</dt><dd className="text-foreground">{order.bank.bankName}</dd>
                  <dt className="text-muted-foreground">{t.account}</dt>
                  <dd><button type="button" onClick={() => copy(order.bank!.accountNumber)} className="font-mono text-foreground underline-offset-2 hover:underline">{order.bank.accountNumber}</button></dd>
                  <dt className="text-muted-foreground">{t.holder}</dt><dd className="text-foreground">{order.bank.holder}</dd>
                </dl>
                {order.bank.qrUrl && /^https:\/\//.test(order.bank.qrUrl) && (
                  <img src={order.bank.qrUrl} alt="QR" className="mx-auto h-44 w-44 rounded-lg border border-border bg-card object-contain" />
                )}
              </>
            )}
            {method === "stripe" && order.stripeLink && (
              <>
                <p className="text-muted-foreground">{t.cardHint}</p>
                <a href={order.stripeLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground">
                  <ExternalLink className="h-4 w-4" />{t.openStripe}
                </a>
                <p className="text-xs text-muted-foreground">{t.reference}: <span className="font-mono">{order.reference}</span></p>
              </>
            )}
            <label htmlFor="ckTx" className="block text-xs text-muted-foreground">{t.txLabel}</label>
            <input id="ckTx" value={tx} onChange={(e) => setTx(e.target.value)} placeholder={t.txPlaceholder}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-foreground outline-none focus:border-primary" />
            <button type="button" disabled={sending || tx.trim().length < 4} onClick={() => void send()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground disabled:opacity-50">
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}{sending ? t.sending : t.submit}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Mount once (root layout). Opens the checkout whenever a paid Mind is bought anywhere in the app. */
export function CheckoutHost() {
  const { lang } = useLang();
  const [req, setReq] = useState<CheckoutRequest | null>(null);
  useEffect(() => {
    const on = (e: Event) => setReq((e as CustomEvent<CheckoutRequest>).detail);
    window.addEventListener("evermind:checkout", on);
    return () => window.removeEventListener("evermind:checkout", on);
  }, []);
  if (!req) return null;
  return <CheckoutModal req={req} lang={lang} onDone={(r) => { req.resolve(r); setReq(null); }} />;
}
