/**
 * The one-time "add your free Gemini key" card. One tap opens Google AI
 * Studio (keys are free), the creator pastes the key, we test it live, and it
 * is stored in two places: the device vault (instant use everywhere) and the
 * creator's account (so background mining keeps running after the app closes).
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { loadApiKeys, makeKeyEntry, saveApiKeys, type ApiKeyEntry } from "@/lib/keystore";
import { deleteUserAiKey, getUserAiKeyStatus, saveUserAiKey } from "@/lib/user-ai-keys.functions";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";

const COPY = {
  en: {
    title: "Your free Gemini key",
    body: "Mining, chat, voice and video calls run on YOUR own free Google quota — never on app credits. Google gives every account a free key.",
    get: "Get my free key",
    step1: "1. Tap the button — Google AI Studio opens",
    step2: "2. Sign in and tap “Create API key”",
    step3: "3. Paste it here",
    placeholder: "Paste your key (AIza…)",
    test: "Test & save",
    testing: "Testing…",
    saved: "Key saved — everything now runs on your free quota.",
    invalid: "That key was rejected by Google. Check it and try again.",
    account: "Also saved to your account for background mining.",
    remove: "Remove",
    removed: "Key removed.",
    keys: "Saved keys",
  },
  mn: {
    title: "Таны үнэгүй Gemini түлхүүр",
    body: "Шинжилгээ, чат, дуудлагууд ЗӨВХӨН таны өөрийн үнэгүй Google квота ашиглана — аппын кредит огт биш. Google бүртгэл бүрт үнэгүй түлхүүр өгдөг.",
    get: "Үнэгүй түлхүүр авах",
    step1: "1. Товчийг дарна — Google AI Studio нээгдэнэ",
    step2: "2. Нэвтэрч “Create API key” дарна",
    step3: "3. Энд буулгана",
    placeholder: "Түлхүүрээ буулгана уу (AIza…)",
    test: "Шалгаад хадгалах",
    testing: "Шалгаж байна…",
    saved: "Түлхүүр хадгалагдлаа — бүх зүйл таны үнэгүй квота дээр ажиллана.",
    invalid: "Google энэ түлхүүрийг хүлээн авахгүй байна. Шалгаад дахин оролдоно уу.",
    account: "Ард ажиллах шинжилгээнд зориулж бүртгэлд ч хадгалагдлаа.",
    remove: "Устгах",
    removed: "Түлхүүр устгагдлаа.",
    keys: "Хадгалсан түлхүүрүүд",
  },
  ko: {
    title: "내 무료 Gemini 키",
    body: "분석, 채팅, 통화는 모두 본인의 무료 Google 할당량으로만 실행됩니다 — 앱 크레딧은 전혀 사용하지 않습니다. Google은 모든 계정에 무료 키를 제공합니다.",
    get: "무료 키 받기",
    step1: "1. 버튼을 누르면 Google AI Studio가 열립니다",
    step2: "2. 로그인 후 “Create API key”를 누릅니다",
    step3: "3. 여기에 붙여넣습니다",
    placeholder: "키를 붙여넣으세요 (AIza…)",
    test: "테스트 후 저장",
    testing: "테스트 중…",
    saved: "키가 저장되었습니다 — 이제 모든 기능이 무료 할당량으로 실행됩니다.",
    invalid: "Google에서 이 키를 거부했습니다. 확인 후 다시 시도하세요.",
    account: "백그라운드 분석을 위해 계정에도 저장했습니다.",
    remove: "삭제",
    removed: "키가 삭제되었습니다.",
    keys: "저장된 키",
  },
} as const;

async function testGeminiKey(key: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
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
  } catch {
    return false;
  }
}

export function GeminiKeyCard({ compact = false }: { compact?: boolean }) {
  const { lang } = useLang();
  const t = COPY[lang as keyof typeof COPY] ?? COPY.en;
  const { isAuthenticated } = useAuth();
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const [accountSaved, setAccountSaved] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setKeys(await loadApiKeys());
      if (isAuthenticated) {
        try {
          const status = await getUserAiKeyStatus();
          setAccountSaved(Array.isArray(status) ? status.length > 0 : !!status);
        } catch {
          /* account status is a bonus, never a blocker */
        }
      }
    })();
  }, [isAuthenticated]);

  const save = useCallback(async () => {
    const key = value.trim();
    if (!key || busy) return;
    setBusy(true);
    try {
      const ok = await testGeminiKey(key);
      if (!ok) {
        toast.error(t.invalid);
        return;
      }
      const next = [...keys.filter((k) => k.value !== key), makeKeyEntry(key, `Key ${keys.length + 1}`)];
      await saveApiKeys(next);
      setKeys(next);
      setValue("");
      let desc: string | undefined;
      if (isAuthenticated) {
        try {
          await saveUserAiKey({ data: { provider: "gemini", apiKey: key } });
          setAccountSaved(true);
          desc = t.account;
        } catch {
          /* device save already succeeded */
        }
      }
      toast.success(t.saved, desc ? { description: desc } : undefined);
    } finally {
      setBusy(false);
    }
  }, [busy, isAuthenticated, keys, t, value]);

  const remove = useCallback(
    async (id: string) => {
      const next = keys.filter((k) => k.id !== id);
      await saveApiKeys(next);
      setKeys(next);
      if (isAuthenticated) {
        try {
          await deleteUserAiKey({ data: { provider: "gemini" } });
          setAccountSaved(false);
        } catch {
          /* fine */
        }
      }
      toast.success(t.removed);
    },
    [isAuthenticated, keys, t],
  );

  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <KeyRound className="h-4 w-4 text-primary" /> {t.title}
      </p>
      {!compact && <p className="text-xs leading-relaxed text-muted-foreground">{t.body}</p>}
      {keys.length === 0 && !accountSaved ? (
        <div className="space-y-2.5">
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ExternalLink className="h-4 w-4" /> {t.get}
          </a>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>{t.step1}</p>
            <p>{t.step2}</p>
            <p>{t.step3}</p>
          </div>
          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t.placeholder}
              autoComplete="off"
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !value.trim()}
              className="flex h-10 items-center gap-1.5 rounded-lg bg-foreground px-3.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? t.testing : t.test}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
            <CheckCircle2 className="h-4 w-4" /> {t.saved}
          </p>
          {keys.length > 0 && (
            <ul className="space-y-1">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground"
                >
                  <span className="font-mono">{k.label}</span>
                  <button
                    type="button"
                    onClick={() => void remove(k.id)}
                    className="text-muted-foreground/70 transition-colors hover:text-destructive"
                    aria-label={t.remove}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
