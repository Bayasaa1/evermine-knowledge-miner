import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Check, Link2, Loader2, Percent } from "lucide-react";
import {
  PLATFORM_COMMISSION,
  PRICE_PRESETS,
  connectStripeAccount,
  createPlan,
  formatMoney,
  loadPlan,
  savePlan,
  splitRevenue,
  type SubscriptionPlan,
} from "@/lib/subscription";

const copy = {
  en: {
    title: "Monthly subscription",
    hint: "Fans pay a flat monthly price for full access to your AI clone — chat, voice and video calls.",
    enable: "Sell monthly access",
    price: "Monthly price",
    currency: "Currency",
    perks: "What subscribers get",
    presets: "Quick prices",
    split: "Revenue split",
    gross: "Subscriber pays",
    fee: `Platform commission (${Math.round(PLATFORM_COMMISSION * 100)}%)`,
    net: "You receive",
    per100: "At 100 subscribers",
    connect: "Stripe Connect",
    connectHint: "Payouts land in your own Stripe account. Commission is taken automatically at checkout.",
    connectBtn: "Connect Stripe account",
    connected: "Stripe account connected",
    connecting: "Connecting…",
    needEmail: "Add your creator email in Mind Ownership first.",
    saved: "Subscription settings saved on this device.",
  },
  mn: {
    title: "Сарын захиалга",
    hint: "Дэмжигчид таны AI хуулбартай чат, дуу, видео дуудлагаар бүрэн харилцах сарын төлбөр төлнө.",
    enable: "Сарын хандалт зарах",
    price: "Сарын үнэ",
    currency: "Валют",
    perks: "Захиалагч юу авах вэ",
    presets: "Түргэн үнэ",
    split: "Орлогын хуваарилалт",
    gross: "Захиалагчийн төлбөр",
    fee: `Платформын шимтгэл (${Math.round(PLATFORM_COMMISSION * 100)}%)`,
    net: "Танд ногдох",
    per100: "100 захиалагчтай үед",
    connect: "Stripe Connect",
    connectHint: "Төлбөр таны Stripe данс руу шууд ороно. Шимтгэл автоматаар суутгагдана.",
    connectBtn: "Stripe данс холбох",
    connected: "Stripe данс холбогдсон",
    connecting: "Холбож байна…",
    needEmail: "Эхлээд Mind Ownership хэсэгт бүтээгчийн имэйлээ оруулна уу.",
    saved: "Захиалгын тохиргоо төхөөрөмж дээр хадгалагдлаа.",
  },
} as const;

export function SubscriptionPanel({ lang, creatorEmail }: { lang: "en" | "mn"; creatorEmail: string }) {
  const t = copy[lang];
  const [plan, setPlan] = useState<SubscriptionPlan>(createPlan);
  const [hydrated, setHydrated] = useState(false);
  const [connecting, setConnecting] = useState(false);

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

  const handleConnect = useCallback(() => {
    const email = creatorEmail.trim() || plan.connect.email;
    if (!email) {
      toast.error(t.needEmail);
      return;
    }
    setConnecting(true);
    setTimeout(() => {
      setPlan((p) => ({ ...p, connect: connectStripeAccount(email) }));
      setConnecting(false);
      toast.success(t.connected);
    }, 900);
  }, [creatorEmail, plan.connect.email, t]);

  const one = splitRevenue(plan.monthlyPrice);
  const hundred = splitRevenue(plan.monthlyPrice, 100);

  return (
    <section id="subscription" className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CreditCard className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={plan.enabled}
            onChange={(e) => setPlan((p) => ({ ...p, enabled: e.target.checked }))}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />
          {t.enable}
        </label>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t.hint}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="subPrice" className="mb-2 block text-sm text-muted-foreground">{t.price}</label>
          <input
            id="subPrice"
            type="number"
            min={0}
            step="1"
            value={plan.monthlyPrice}
            onChange={(e) => setPlan((p) => ({ ...p, monthlyPrice: Math.max(0, Number(e.target.value) || 0) }))}
            className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
          />
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
        <div>
          <span className="mb-2 block text-sm text-muted-foreground">{t.presets}</span>
          <div className="flex gap-2">
            {PRICE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan((s) => ({ ...s, monthlyPrice: p }))}
                className={`flex-1 rounded-lg border px-2 py-2.5 text-sm font-semibold transition-colors ${
                  plan.monthlyPrice === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-muted text-muted-foreground hover:border-primary/50 hover:text-primary"
                }`}
              >
                ${p}
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
            <Link2 className="h-4 w-4 text-primary" /> {t.connect}
          </div>
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{t.connectHint}</p>
          {plan.connect.status === "connected" ? (
            <div className="space-y-1.5">
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-status-green">
                <Check className="h-4 w-4" /> {t.connected}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{plan.connect.accountId}</p>
              <p className="truncate text-xs text-muted-foreground">{plan.connect.email}</p>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:opacity-60"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {connecting ? t.connecting : t.connectBtn}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
