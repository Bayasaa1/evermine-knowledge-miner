/**
 * "My AI keys" — the one place that shows every key this creator saved.
 *
 * Gemini is required and free (several keys allowed). Other providers are
 * optional; paid ones stay switched off until the creator turns them on and
 * never spend past their own monthly cap. Adding a key that is already saved
 * is refused instead of silently replacing it.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import { saveUserAiKey, deleteUserAiKey } from "@/lib/user-ai-keys.functions";
import {
  addKey,
  DuplicateKeyError,
  listAllKeys,
  PROVIDERS,
  removeKey,
  setProviderCap,
  setProviderEnabled,
  type ProviderId,
  type SavedKey,
} from "@/lib/key-manager";

const COPY = {
  en: {
    title: "My AI keys",
    sub: "Gemini is required and free. Everything else is optional.",
    empty: "No keys yet. Add your free Gemini key to start.",
    add: "Add a key",
    get: "Get a free key",
    placeholder: "Paste the key",
    save: "Test & save",
    testing: "Testing…",
    saved: "Key tested and saved.",
    dupe: "You already added this key.",
    invalid: "That key was rejected. Check it and try again.",
    removed: "Key removed.",
    today: "today",
    calls: "calls",
    working: "working",
    usedUp: "used up",
    rejected: "rejected",
    free: "free",
    paid: "paid",
    cap: "Monthly limit",
    on: "On",
    off: "Off",
    capHint: "Mining stops on this key when the limit is reached.",
    freeTier: "free tier",
    freeModel: "free model selected",
    paidModel: "paid model selected",
    geminiNote:
      "Free tier. If you switch on billing in your own Google account, this same key just runs faster — Evermind never asks for it.",
    ownKeys: "Every call runs on your own keys. Evermind never bills you and never uses its own AI budget.",
  },
  mn: {
    title: "Миний AI түлхүүрүүд",
    sub: "Gemini заавал бөгөөд үнэгүй. Бусад нь сонголт.",
    empty: "Түлхүүр алга. Үнэгүй Gemini түлхүүрээ нэмнэ үү.",
    add: "Түлхүүр нэмэх",
    get: "Үнэгүй түлхүүр авах",
    placeholder: "Түлхүүрээ буулгана уу",
    save: "Шалгаад хадгалах",
    testing: "Шалгаж байна…",
    saved: "Түлхүүр шалгагдаж хадгалагдлаа.",
    dupe: "Энэ түлхүүр аль хэдийн нэмэгдсэн байна.",
    invalid: "Түлхүүр татгалзагдлаа. Шалгаад дахин оролдоно уу.",
    removed: "Түлхүүр устгагдлаа.",
    today: "өнөөдөр",
    calls: "дуудлага",
    working: "ажиллаж байна",
    usedUp: "дууссан",
    rejected: "татгалзсан",
    free: "үнэгүй",
    paid: "төлбөртэй",
    cap: "Сарын хязгаар",
    on: "Асаалттай",
    off: "Унтраалттай",
    capHint: "Хязгаарт хүрэхэд энэ түлхүүр ашиглагдахаа болино.",
    freeTier: "үнэгүй хувилбар",
    freeModel: "үнэгүй загвар сонгосон",
    paidModel: "төлбөртэй загвар сонгосон",
    geminiNote:
      "Үнэгүй хувилбар. Өөрийн Google данснаасаа төлбөрт шилжвэл яг энэ түлхүүр илүү хурдан ажиллана — Evermind үүнийг шаарддаггүй.",
    ownKeys: "Бүх дуудлага таны өөрийн түлхүүрээр явна. Evermind танаас төлбөр авахгүй, өөрийн AI төсөв ашиглахгүй.",
  },
  ko: {
    title: "내 AI 키",
    sub: "Gemini는 필수이며 무료입니다. 나머지는 선택입니다.",
    empty: "저장된 키가 없습니다. 무료 Gemini 키를 추가하세요.",
    add: "키 추가",
    get: "무료 키 받기",
    placeholder: "키를 붙여넣으세요",
    save: "테스트 후 저장",
    testing: "테스트 중…",
    saved: "키가 테스트되고 저장되었습니다.",
    dupe: "이미 추가된 키입니다.",
    invalid: "키가 거부되었습니다. 확인 후 다시 시도하세요.",
    removed: "키가 삭제되었습니다.",
    today: "오늘",
    calls: "호출",
    working: "정상",
    usedUp: "소진됨",
    rejected: "거부됨",
    free: "무료",
    paid: "유료",
    cap: "월 한도",
    on: "켜짐",
    off: "꺼짐",
    capHint: "한도에 도달하면 이 키 사용이 중지됩니다.",
    freeTier: "무료 티어",
    freeModel: "무료 모델 선택됨",
    paidModel: "유료 모델 선택됨",
    geminiNote:
      "무료 티어입니다. 본인 Google 계정에서 결제를 켜면 같은 키가 더 빨라질 뿐, Evermind가 요구하지는 않습니다.",
    ownKeys: "모든 호출은 본인 키로 실행됩니다. Evermind는 요금을 청구하지 않으며 자체 AI 예산도 쓰지 않습니다.",
  },
} as const;

/** One tiny call to prove the key works before it is saved. */
async function testKey(providerId: ProviderId, key: string): Promise<boolean> {
  const p = PROVIDERS.find((x) => x.id === providerId)!;
  try {
    if (p.id === "gemini") {
      const res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Say OK" }] }],
            generationConfig: { maxOutputTokens: 4 },
          }),
        },
      );
      return res.ok;
    }
    if (p.id === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: p.testModel,
          max_tokens: 8,
          messages: [{ role: "user", content: "ok" }],
        }),
      });
      return res.ok;
    }
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: p.testModel, max_tokens: 8, messages: [{ role: "user", content: "ok" }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function AiKeysCard({ onChange }: { onChange?: (keys: SavedKey[]) => void }) {
  const { lang } = useLang();
  const t = COPY[lang as keyof typeof COPY] ?? COPY.en;
  const { isAuthenticated } = useAuth();
  const [rows, setRows] = useState<SavedKey[]>([]);
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("gemini");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const all = await listAllKeys();
    setRows(all);
    onChange?.(all);
    return all;
  }, [onChange]);

  useEffect(() => {
    void refresh();
  }, [refresh, isAuthenticated]);

  const submit = useCallback(async () => {
    const key = value.trim();
    if (!key || busy) return;
    setBusy(true);
    try {
      if (!(await testKey(provider, key))) {
        toast.error(t.invalid);
        return;
      }
      await addKey(provider, key);
      setValue("");
      setOpen(false);
      const all = await refresh();
      if (isAuthenticated) {
        try {
          await saveUserAiKey({ data: { provider, apiKey: key } });
        } catch {
          /* the device save already succeeded */
        }
      }
      toast.success(t.saved);
      void all;
    } catch (err) {
      toast.error(err instanceof DuplicateKeyError ? t.dupe : t.invalid);
    } finally {
      setBusy(false);
    }
  }, [busy, isAuthenticated, provider, refresh, t, value]);

  const drop = useCallback(
    async (row: SavedKey) => {
      await removeKey(row);
      await refresh();
      if (isAuthenticated) {
        try {
          await deleteUserAiKey({ data: { provider: row.provider.id } });
        } catch {
          /* fine */
        }
      }
      toast.success(t.removed);
    },
    [isAuthenticated, refresh, t],
  );

  const info = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <KeyRound className="h-4 w-4 text-primary" /> {t.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.sub}</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground">{row.provider.label}</span>
                  <span className="text-muted-foreground">••••{row.maskedTail}</span>
                  <span className={row.state === "ok" ? "text-emerald-500" : "text-amber-500"}>
                    {row.state === "ok" ? t.working : row.state === "exhausted" ? t.usedUp : t.rejected}
                  </span>
                  <span className="text-muted-foreground">{row.provider.paid ? t.paid : t.free}</span>
                  {row.callsToday > 0 && (
                    <span className="text-muted-foreground">
                      {t.today}: {row.callsToday} {t.calls}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => void drop(row)}
                  className="text-muted-foreground/70 transition-colors hover:text-destructive"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {row.provider.paid && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void setProviderEnabled(row.provider.keyField, !row.enabled).then(refresh)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      row.enabled
                        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-500"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {row.enabled ? t.on : t.off}
                  </button>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {t.cap} $
                    <input
                      type="number"
                      min={0}
                      value={row.monthlyCapUsd}
                      onChange={(e) =>
                        void setProviderCap(row.provider.keyField, Number(e.target.value) || 0).then(refresh)
                      }
                      className="h-7 w-16 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                    />
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    ${row.spendUsd.toFixed(2)} · {t.capHint}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  provider === p.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={info.placeholder || t.placeholder}
              autoComplete="off"
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || !value.trim()}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? t.testing : t.save}
            </button>
          </div>
          {info.keyUrl && (
            <a
              href={info.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> {t.get}
            </a>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" /> {t.add}
        </button>
      )}

      {rows.some((r) => r.provider.id === "gemini") && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-500">
          <CheckCircle2 className="h-3.5 w-3.5" /> Gemini {t.working}
        </p>
      )}
    </div>
  );
}
