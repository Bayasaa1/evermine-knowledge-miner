import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PLAN_LENGTHS, formatMoney } from "@/lib/subscription";
import { listCreatorSales, decideOrder, type SaleRow } from "@/lib/purchases.functions";
import { toast } from "sonner";
import { Banknote, Bitcoin, CreditCard, Loader2, Wallet } from "lucide-react";
import {
  CRYPTO_NETWORKS,
  PAYOUT_CHANNELS,
  connectPayoutMethod,
  validateDestination,
  LOCAL_BANKS,
  emptyReceivingAccount,
  isSafeHttpsUrl,
  loadReceivingAccount,
  saveReceivingAccount,
  summarizeSales,
  type ReceivingAccount,
  type PayoutChannel,
  type PayoutSettings,
} from "@/lib/payouts";
import { pickCopy, type Lang } from "@/lib/i18n";

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
  ko: {
    title: "출금 방법 연결",
    hint: "출금할 때만 필요합니다. 편한 채널을 선택하세요 — 언제든 변경할 수 있습니다.",
    channels: {
      stripe: "Stripe (카드)",
      paypal: "PayPal",
      crypto: "USDT / 암호화폐 지갑",
      bank: "은행 송금 / 현지 결제망",
    } as Record<PayoutChannel, string>,
    destLabel: {
      stripe: "Stripe 계정 이메일",
      paypal: "PayPal 이메일",
      crypto: "지갑 주소",
      bank: "계좌번호 / IBAN",
    } as Record<PayoutChannel, string>,
    network: "네트워크",
    bankName: "은행 / 결제망 이름",
    holder: "예금주명",
    save: "출금 방법 저장",
    saving: "저장 중…",
    saved: "출금 방법이 연결되었습니다.",
    errors: {
      required: "필수 입력 항목입니다.",
      email: "올바른 이메일 주소를 입력하세요.",
      wallet: "올바른 지갑 주소를 입력하세요.",
      bank: "올바른 계좌번호를 입력하세요.",
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
  lang: Lang;
  defaultEmail?: string;
  onConnected: (s: PayoutSettings) => void;
}) {
  const t = pickCopy(copy, lang);
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

/* ───────────── Creator receiving account + sales dashboard ───────────── */

const earnCopy = {
  en: {
    acctTitle: "Where buyers pay you", acctHint: "Shown to buyers at checkout. Bank transfers are confirmed by you below.",
    bank: "Bank", account: "Account number / IBAN", holder: "Account holder name", qr: "QR image link (https, optional)",
    stripe: "Stripe Payment Link per plan (optional)", save: "Save receiving details", saved: "Receiving details saved.",
    badUrl: "Links must start with https://", needAcct: "Enter an account number and holder name.",
    sales: "Sales", revenue: "Earned (approved)", net: "Your share after commission", pendingSum: "Waiting for your confirmation",
    none: "No sales yet.", buyer: "Buyer", plan: "Plan", amount: "Amount", method: "Method", ref: "Reference / Tx ID", status: "Status",
    approve: "Approve", reject: "Reject", revoke: "Revoke access", signIn: "Sign in to manage payments.",
    statuses: { awaiting: "Awaiting payment", submitted: "Needs check", approved: "Approved", rejected: "Rejected", revoked: "Revoked" } as Record<string, string>,
    names: { month: "1 month", quarter: "3 months", year: "1 year", lifetime: "Lifetime" } as Record<string, string>,
  },
  mn: {
    acctTitle: "Худалдан авагч хаана төлөх вэ", acctHint: "Төлбөр төлөх үед харагдана. Дансны шилжүүлгийг та доор баталгаажуулна.",
    bank: "Банк", account: "Дансны дугаар / IBAN", holder: "Данс эзэмшигчийн нэр", qr: "QR зургийн холбоос (https, заавал биш)",
    stripe: "Багц тус бүрийн Stripe Payment Link (заавал биш)", save: "Хүлээн авах мэдээлэл хадгалах", saved: "Хадгаллаа.",
    badUrl: "Холбоос https:// -ээр эхлэх ёстой", needAcct: "Дансны дугаар болон эзэмшигчийн нэрээ оруулна уу.",
    sales: "Борлуулалт", revenue: "Орлого (батлагдсан)", net: "Шимтгэлийн дараа танд", pendingSum: "Таны баталгаажуулалтыг хүлээж буй",
    none: "Одоогоор борлуулалт алга.", buyer: "Худалдан авагч", plan: "Багц", amount: "Дүн", method: "Арга", ref: "Код / Гүйлгээ", status: "Төлөв",
    approve: "Батлах", reject: "Татгалзах", revoke: "Эрх цуцлах", signIn: "Төлбөр удирдахын тулд нэвтэрнэ үү.",
    statuses: { awaiting: "Төлбөр хүлээж буй", submitted: "Шалгах шаардлагатай", approved: "Батлагдсан", rejected: "Татгалзсан", revoked: "Цуцалсан" } as Record<string, string>,
    names: { month: "1 сар", quarter: "3 сар", year: "1 жил", lifetime: "Насан турш" } as Record<string, string>,
  },
  ko: {
    acctTitle: "구매자 결제 받을 곳", acctHint: "결제 화면에 표시됩니다. 계좌이체는 아래에서 직접 확인합니다.",
    bank: "은행", account: "계좌번호 / IBAN", holder: "예금주명", qr: "QR 이미지 링크 (https, 선택)",
    stripe: "플랜별 Stripe 결제 링크 (선택)", save: "수령 정보 저장", saved: "저장되었습니다.",
    badUrl: "링크는 https:// 로 시작해야 합니다", needAcct: "계좌번호와 예금주명을 입력하세요.",
    sales: "판매", revenue: "수익 (승인됨)", net: "수수료 후 실수령", pendingSum: "확인 대기 중",
    none: "아직 판매가 없습니다.", buyer: "구매자", plan: "플랜", amount: "금액", method: "방식", ref: "코드 / 거래 ID", status: "상태",
    approve: "승인", reject: "거절", revoke: "접근 취소", signIn: "결제를 관리하려면 로그인하세요.",
    statuses: { awaiting: "결제 대기", submitted: "확인 필요", approved: "승인됨", rejected: "거절됨", revoked: "취소됨" } as Record<string, string>,
    names: { month: "1개월", quarter: "3개월", year: "1년", lifetime: "평생" } as Record<string, string>,
  },
} as const;

const inputCls = "w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";

export function CreatorEarnings({ lang }: { lang: Lang }) {
  const t = pickCopy(earnCopy, lang);
  const { userId } = useAuth();
  const [acct, setAcct] = useState<ReceivingAccount>(emptyReceivingAccount);
  const [saving, setSaving] = useState(false);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const listSales = useServerFn(listCreatorSales);
  const decide = useServerFn(decideOrder);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try { setSales(await listSales()); } catch { /* keep last list */ }
  }, [userId, listSales]);

  useEffect(() => {
    if (!userId) return;
    void loadReceivingAccount(userId).then(setAcct);
    void refresh();
    const ch = supabase.channel(`sales-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mind_payment_orders", filter: `creator_user_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [userId, refresh]);

  if (!userId) return <p className="text-sm text-muted-foreground">{t.signIn}</p>;

  const save = async () => {
    if (!acct.account_number.trim() || !acct.account_holder.trim()) return void toast.error(t.needAcct);
    if (![acct.qr_url, ...Object.values(acct.stripe_links)].every((u) => isSafeHttpsUrl(u ?? ""))) return void toast.error(t.badUrl);
    setSaving(true);
    const err = await saveReceivingAccount(userId, acct);
    setSaving(false);
    if (err) toast.error(err); else toast.success(t.saved);
  };

  const act = async (orderId: string, decision: "approve" | "reject" | "revoke") => {
    setBusy(orderId);
    try {
      const r = await decide({ data: { orderId, decision } });
      if (!r.ok) toast.error(r.error ?? "Failed");
      await refresh();
    } finally { setBusy(null); }
  };

  const sum = summarizeSales(sales);
  const cur = sales[0]?.currency ?? "USD";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Banknote className="h-4 w-4 text-primary" />{t.acctTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t.acctHint}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">{t.bank}
            <select value={acct.bank_name} onChange={(e) => setAcct({ ...acct, bank_name: e.target.value })} className={`mt-1 ${inputCls}`}>
              {LOCAL_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">{t.account}
            <input value={acct.account_number} onChange={(e) => setAcct({ ...acct, account_number: e.target.value.slice(0, 64) })} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-muted-foreground">{t.holder}
            <input value={acct.account_holder} onChange={(e) => setAcct({ ...acct, account_holder: e.target.value.slice(0, 120) })} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-muted-foreground">{t.qr}
            <input value={acct.qr_url} onChange={(e) => setAcct({ ...acct, qr_url: e.target.value.trim() })} className={`mt-1 ${inputCls}`} />
          </label>
        </div>
        <p className="mt-3 text-xs font-semibold text-muted-foreground">{t.stripe}</p>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {PLAN_LENGTHS.map((p) => (
            <input key={p} placeholder={`${t.names[p]} — https://buy.stripe.com/…`} value={acct.stripe_links[p] ?? ""}
              onChange={(e) => setAcct({ ...acct, stripe_links: { ...acct.stripe_links, [p]: e.target.value.trim() } })} className={inputCls} />
          ))}
        </div>
        <button type="button" onClick={() => void save()} disabled={saving}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}{t.save}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">{t.sales}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[[t.revenue, sum.gross], [t.net, sum.net], [t.pendingSum, sum.pending]].map(([l, v]) => (
            <div key={String(l)} className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="font-mono text-lg font-semibold text-foreground">{formatMoney(Number(v), cur)}</p>
            </div>
          ))}
        </div>
        {sales.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t.none}</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-muted-foreground"><tr>
                {[t.buyer, t.plan, t.amount, t.method, t.ref, t.status, ""].map((h, i) => <th key={i} className="px-2 py-1.5 font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className="border-t border-border text-foreground">
                    <td className="px-2 py-2">{s.buyer_name}<div className="text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</div></td>
                    <td className="px-2 py-2">{t.names[s.plan] ?? s.plan}</td>
                    <td className="px-2 py-2 font-mono">{formatMoney(s.amount, s.currency)}</td>
                    <td className="px-2 py-2">{s.method === "stripe" ? "Stripe" : "Bank / QR"}</td>
                    <td className="px-2 py-2 font-mono">{s.reference}<div className="text-muted-foreground">{s.transaction_ref || "—"}</div></td>
                    <td className="px-2 py-2">{t.statuses[s.status] ?? s.status}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        {(s.status === "submitted" || s.status === "awaiting") && (<>
                          <button type="button" disabled={busy === s.id} onClick={() => void act(s.id, "approve")} className="rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground disabled:opacity-50">{t.approve}</button>
                          <button type="button" disabled={busy === s.id} onClick={() => void act(s.id, "reject")} className="rounded-md border border-border px-2 py-1 text-muted-foreground disabled:opacity-50">{t.reject}</button>
                        </>)}
                        {s.status === "approved" && (
                          <button type="button" disabled={busy === s.id} onClick={() => void act(s.id, "revoke")} className="rounded-md border border-destructive/50 px-2 py-1 text-destructive disabled:opacity-50">{t.revoke}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
