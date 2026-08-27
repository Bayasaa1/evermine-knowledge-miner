import { useState } from "react";
import { toast } from "sonner";
import { Banknote, Bitcoin, CreditCard, Loader2, Wallet } from "lucide-react";
import {
  CRYPTO_NETWORKS,
  PAYOUT_CHANNELS,
  connectPayoutMethod,
  validateDestination,
  type PayoutChannel,
  type PayoutSettings,
} from "@/lib/payouts";

const copy = {
  en: {
    title: "Connect a payout method",
    hint: "Only needed when you withdraw. Pick the channel that suits you — you can change it anytime.",
    channels: {
      stripe: "Stripe (cards)",
      paypal: "PayPal",
      crypto: "USDT / Crypto wallet",
      bank: "Bank transfer / local gateway",
    } as Record<PayoutChannel, string>,
    destLabel: {
      stripe: "Stripe account email",
      paypal: "PayPal email",
      crypto: "Wallet address",
      bank: "Account number / IBAN",
    } as Record<PayoutChannel, string>,
    network: "Network",
    bankName: "Bank / gateway name",
    holder: "Account holder name",
    save: "Save payout method",
    saving: "Saving…",
    saved: "Payout method connected.",
    errors: {
      required: "This field is required.",
      email: "Enter a valid email address.",
      wallet: "Enter a valid wallet address.",
      bank: "Enter a valid account number.",
    } as Record<string, string>,
  },
  mn: {
    title: "Төлбөр авах суваг холбох",
    hint: "Зөвхөн мөнгөө авахад хэрэгтэй. Тохирох сувгаа сонго — хэзээ ч солиж болно.",
    channels: {
      stripe: "Stripe (карт)",
      paypal: "PayPal",
      crypto: "USDT / Крипто хэтэвч",
      bank: "Банк шилжүүлэг / дотоод суваг",
    } as Record<PayoutChannel, string>,
    destLabel: {
      stripe: "Stripe бүртгэлийн имэйл",
      paypal: "PayPal имэйл",
      crypto: "Хэтэвчний хаяг",
      bank: "Дансны дугаар / IBAN",
    } as Record<PayoutChannel, string>,
    network: "Сүлжээ",
    bankName: "Банк / сувгийн нэр",
    holder: "Данс эзэмшигчийн нэр",
    save: "Төлбөрийн суваг хадгалах",
    saving: "Хадгалж байна…",
    saved: "Төлбөрийн суваг холбогдлоо.",
    errors: {
      required: "Заавал бөглөнө үү.",
      email: "Зөв имэйл оруулна уу.",
      wallet: "Зөв хэтэвчний хаяг оруулна уу.",
      bank: "Зөв дансны дугаар оруулна уу.",
    } as Record<string, string>,
  },
} as const;

const icons: Record<PayoutChannel, typeof CreditCard> = {
  stripe: CreditCard,
  paypal: Wallet,
  crypto: Bitcoin,
  bank: Banknote,
};

export function PayoutSetup({
  lang,
  defaultEmail = "",
  onConnected,
}: {
  lang: "en" | "mn";
  defaultEmail?: string;
  onConnected: (s: PayoutSettings) => void;
}) {
  const t = copy[lang];
  const [channel, setChannel] = useState<PayoutChannel>("stripe");
  const [destination, setDestination] = useState(defaultEmail);
  const [network, setNetwork] = useState<string>(CRYPTO_NETWORKS[0]);
  const [holder, setHolder] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const problem = validateDestination(channel, destination);
    if (problem) {
      toast.error(t.errors[problem] ?? t.errors['required']!);
      return;
    }
    setSaving(true);
    const next = await connectPayoutMethod({
      channel,
      destination: destination.trim(),
      network: channel === "crypto" ? network : channel === "bank" ? network.trim() : "",
      holder: holder.trim(),
    });
    setSaving(false);
    onConnected(next);
    toast.success(t.saved);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">{t.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {PAYOUT_CHANNELS.map((c) => {
          const Icon = icons[c];
          const active = channel === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setChannel(c);
                if (c === "crypto") setNetwork(CRYPTO_NETWORKS[0]);
                if (c === "bank") setNetwork("");
              }}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground hover:border-primary/50"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{t.channels[c]}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="payoutDest" className="mb-1.5 block text-xs text-muted-foreground">
            {t.destLabel[channel]}
          </label>
          <input
            id="payoutDest"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>

        {channel === "crypto" && (
          <div>
            <label htmlFor="payoutNet" className="mb-1.5 block text-xs text-muted-foreground">{t.network}</label>
            <select
              id="payoutNet"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            >
              {CRYPTO_NETWORKS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}

        {channel === "bank" && (
          <div>
            <label htmlFor="payoutBank" className="mb-1.5 block text-xs text-muted-foreground">{t.bankName}</label>
            <input
              id="payoutBank"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        )}

        {(channel === "bank" || channel === "stripe") && (
          <div>
            <label htmlFor="payoutHolder" className="mb-1.5 block text-xs text-muted-foreground">{t.holder}</label>
            <input
              id="payoutHolder"
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:opacity-60"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? t.saving : t.save}
      </button>
    </div>
  );
}
