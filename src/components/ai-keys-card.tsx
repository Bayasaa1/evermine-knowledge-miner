/**
 * "My AI keys" — the one place that shows every key this creator saved, in the
 * order they are used.
 *
 * #1 is tried first. When it runs out of quota (or a paid key hits its monthly
 * cap) the next one takes over automatically. Arrows change that order.
 * Free and paid providers are added through separate buttons so a free list
 * never shows paid names and the other way round.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Lightbulb,
  Loader2,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import { adviceFor } from "@/lib/key-advice";
import { saveUserAiKey, deleteUserAiKey } from "@/lib/user-ai-keys.functions";
import {
  addKey,
  DuplicateKeyError,
  listAllKeys,
  moveKey,
  providersByCost,
  findProviderInfo,
  removeKey,
  setProviderCap,
  setProviderEnabled,
  type ProviderId,
  type ProviderInfo,
  type SavedKey,
} from "@/lib/key-manager";

const COPY = {
  en: {
    title: "My AI keys",
    sub: "#1 is used first. If its tokens run out, #2 takes over, then #3.",
    empty: "No keys yet. Add your free Gemini key to start.",
    addFree: "Get a free key",
    addPaid: "Get a paid key",
    addCustom: "Add my own AI",
    get: "Where to get it",
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
    usedUp: "used up — skipped until it resets",
    rejected: "rejected",
    cap: "Monthly limit",
    on: "On",
    off: "Off",
    capHint: "Mining stops on this key when the limit is reached.",
    freeTier: "free tier",
    freeModel: "free model",
    paidModel: "paid",
    geminiNote: "Gemini is the one that actually watches the video. The others reason over what it found.",
    ownKeys: "Every call runs on your own keys. Evermind never bills you and never uses its own AI budget.",
    up: "Move up",
    down: "Move down",
    cancel: "Cancel",
    customName: "Name",
    customEndpoint: "Endpoint URL (OpenAI-compatible)",
    customModel: "Model name",
    adviceFirst: "Best first choice",
    adviceHelps: "Worth adding",
    adviceSkip: "Not worth it here",
    adviceTips: "Faster mining",
  },
  mn: {
    title: "Миний AI түлхүүрүүд",
    sub: "#1 эхэлж ажиллана. Токен нь дуусвал #2, дараа нь #3 үргэлжилнэ.",
    empty: "Түлхүүр алга. Үнэгүй Gemini түлхүүрээ нэмнэ үү.",
    addFree: "Үнэгүй түлхүүр нэмэх",
    addPaid: "Төлбөртэй түлхүүр нэмэх",
    addCustom: "Өөрийн AI нэмэх",
    get: "Хаанаас авах",
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
    usedUp: "дууссан — сэргэх хүртэл алгасна",
    rejected: "татгалзсан",
    cap: "Сарын хязгаар",
    on: "Асаалттай",
    off: "Унтраалттай",
    capHint: "Хязгаарт хүрэхэд энэ түлхүүр ашиглагдахаа болино.",
    freeTier: "үнэгүй",
    freeModel: "үнэгүй загвар",
    paidModel: "төлбөртэй",
    geminiNote: "Видеог үнэндээ Gemini хардаг. Бусад нь түүний олсон материал дээр бодно.",
    ownKeys: "Бүх дуудлага таны өөрийн түлхүүрээр явна. Evermind танаас төлбөр авахгүй.",
    up: "Дээш",
    down: "Доош",
    cancel: "Болих",
    customName: "Нэр",
    customEndpoint: "Endpoint хаяг (OpenAI-тэй нийцтэй)",
    customModel: "Загварын нэр",
    adviceFirst: "Хамгийн зөв нэгдүгээр сонголт",
    adviceHelps: "Нэмвэл тустай",
    adviceSkip: "Энд хэрэггүй",
    adviceTips: "Хурдан олборлолт",
  },
  ko: {
    title: "내 AI 키",
    sub: "#1이 먼저 사용됩니다. 토큰이 떨어지면 #2, 그다음 #3이 이어받습니다.",
    empty: "저장된 키가 없습니다. 무료 Gemini 키를 추가하세요.",
    addFree: "무료 키 추가",
    addPaid: "유료 키 추가",
    addCustom: "내 AI 추가",
    get: "발급 받는 곳",
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
    usedUp: "소진됨 — 초기화까지 건너뜀",
    rejected: "거부됨",
    cap: "월 한도",
    on: "켜짐",
    off: "꺼짐",
    capHint: "한도에 도달하면 이 키 사용이 중지됩니다.",
    freeTier: "무료",
    freeModel: "무료 모델",
    paidModel: "유료",
    geminiNote: "영상을 실제로 보는 것은 Gemini입니다. 나머지는 그 결과를 두고 추론합니다.",
    ownKeys: "모든 호출은 본인 키로 실행됩니다. Evermind는 요금을 청구하지 않습니다.",
    up: "위로",
    down: "아래로",
    cancel: "취소",
    customName: "이름",
    customEndpoint: "엔드포인트 URL (OpenAI 호환)",
    customModel: "모델 이름",
    adviceFirst: "첫 번째로 좋은 선택",
    adviceHelps: "추가할 만한 것",
    adviceSkip: "여기서는 불필요",
    adviceTips: "빠른 마이닝",
  },
} as const;

/** One tiny call to prove the key works before it is saved. */
async function testKey(
  provider: ProviderInfo,
  key: string,
  custom?: { endpoint: string; model: string },
): Promise<boolean> {
  try {
    if (provider.id === "gemini") {
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
    if (provider.id === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: provider.testModel,
          max_tokens: 8,
          messages: [{ role: "user", content: "ok" }],
        }),
      });
      return res.ok;
    }
    const baseUrl = (custom?.endpoint || provider.baseUrl).replace(/\/+$/, "");
    const model = custom?.model || provider.testModel;
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: "user", content: "ok" }] }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type AddMode = "free" | "paid" | "custom" | null;

export function AiKeysCard({
  onChange,
  category = "knowledge",
}: {
  onChange?: (keys: SavedKey[]) => void;
  category?: string;
}) {
  const { lang } = useLang();
  const t = COPY[lang as keyof typeof COPY] ?? COPY.en;
  const { isAuthenticated } = useAuth();
  const [rows, setRows] = useState<SavedKey[]>([]);
  const [mode, setMode] = useState<AddMode>(null);
  const [provider, setProvider] = useState<ProviderId>("gemini");
  const [value, setValue] = useState("");
  const [custom, setCustom] = useState({ label: "", endpoint: "", model: "" });
  const [busy, setBusy] = useState(false);

  const advice = useMemo(() => adviceFor(category, lang), [category, lang]);

  const refresh = useCallback(async () => {
    const all = await listAllKeys();
    setRows(all);
    onChange?.(all);
    return all;
  }, [onChange]);

  useEffect(() => {
    void refresh();
  }, [refresh, isAuthenticated]);

  const openMode = (next: AddMode) => {
    setMode(next);
    setValue("");
    if (next === "free") setProvider("gemini");
    if (next === "paid") setProvider("openai");
    if (next === "custom") setProvider("custom");
  };

  const submit = useCallback(async () => {
    const key = value.trim();
    const info = findProviderInfo(provider);
    if (!key || busy || !info) return;
    if (provider === "custom" && (!custom.endpoint.trim() || !custom.model.trim())) {
      toast.error(t.invalid);
      return;
    }
    setBusy(true);
    try {
      const ok = await testKey(
        info,
        key,
        provider === "custom" ? { endpoint: custom.endpoint.trim(), model: custom.model.trim() } : undefined,
      );
      if (!ok) {
        toast.error(t.invalid);
        return;
      }
      await addKey(
        provider,
        key,
        provider === "custom"
          ? { label: custom.label.trim() || "My AI", endpoint: custom.endpoint.trim(), model: custom.model.trim() }
          : undefined,
      );
      setValue("");
      setCustom({ label: "", endpoint: "", model: "" });
      setMode(null);
      await refresh();
      if (isAuthenticated) {
        try {
          await saveUserAiKey({ data: { provider, apiKey: key } });
        } catch {
          /* the device save already succeeded */
        }
      }
      toast.success(t.saved);
    } catch (err) {
      toast.error(err instanceof DuplicateKeyError ? t.dupe : t.invalid);
    } finally {
      setBusy(false);
    }
  }, [busy, custom, isAuthenticated, provider, refresh, t, value]);

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

  const shift = useCallback(
    async (row: SavedKey, dir: "up" | "down") => {
      await moveKey(row.id, dir);
      await refresh();
    },
    [refresh],
  );

  const choices: ProviderInfo[] =
    mode === "free" ? providersByCost(false) : mode === "paid" ? providersByCost(true) : [];
  const info = findProviderInfo(provider);

  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <KeyRound className="h-4 w-4 text-primary" /> {t.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.sub}</p>
      </div>

      {/* Guidance that follows the creation type picked in step 1. */}
      <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-xs">
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          <Lightbulb className="h-3.5 w-3.5 text-primary" /> {t.adviceFirst}
        </p>
        <p className="mt-1 text-muted-foreground">{advice.first}</p>
        <p className="mt-2 font-medium text-foreground">{t.adviceHelps}</p>
        <p className="text-muted-foreground">{advice.helps}</p>
        <p className="mt-2 font-medium text-foreground">{t.adviceSkip}</p>
        <p className="text-muted-foreground">{advice.skip}</p>
        <p className="mt-2 font-medium text-foreground">{t.adviceTips}</p>
        <ul className="mt-0.5 space-y-0.5 text-muted-foreground">
          {advice.tips.map((tip) => (
            <li key={tip}>• {tip}</li>
          ))}
        </ul>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li key={row.id} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                  {row.rank}
                </span>
                <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground">{row.label}</span>
                  <span className="text-muted-foreground">••••{row.maskedTail}</span>
                  <span className={row.state === "ok" ? "text-emerald-500" : "text-amber-500"}>
                    {row.state === "ok" ? t.working : row.state === "exhausted" ? t.usedUp : t.rejected}
                  </span>
                  <span className={row.cost === "paid" ? "text-amber-500" : "text-muted-foreground"}>
                    {row.cost === "free-tier" ? t.freeTier : row.cost === "free-model" ? t.freeModel : t.paidModel}
                  </span>
                  {row.callsToday > 0 && (
                    <span className="text-muted-foreground">
                      {t.today}: {row.callsToday} {t.calls}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={t.up}
                    title={t.up}
                    disabled={i === 0}
                    onClick={() => void shift(row, "up")}
                    className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={t.down}
                    title={t.down}
                    disabled={i === rows.length - 1}
                    onClick={() => void shift(row, "down")}
                    className="rounded-md border border-border p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void drop(row)}
                    className="p-1 text-muted-foreground/70 transition-colors hover:text-destructive"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
              {row.cost === "paid" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
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

      {mode ? (
        <div className="space-y-2 rounded-lg border border-border bg-background/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">
              {mode === "free" ? t.addFree : mode === "paid" ? t.addPaid : t.addCustom}
            </p>
            <button
              type="button"
              onClick={() => setMode(null)}
              aria-label={t.cancel}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {mode !== "custom" && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {choices.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={`rounded-lg border p-2 text-left transition-colors ${
                    provider === p.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                  }`}
                >
                  <span className="block text-xs font-medium text-foreground">{p.label}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{p.good}</span>
                </button>
              ))}
            </div>
          )}

          {mode === "custom" && (
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={custom.label}
                onChange={(e) => setCustom({ ...custom, label: e.target.value.slice(0, 60) })}
                placeholder={t.customName}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <input
                value={custom.endpoint}
                onChange={(e) => setCustom({ ...custom, endpoint: e.target.value.slice(0, 300) })}
                placeholder={t.customEndpoint}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
              <input
                value={custom.model}
                onChange={(e) => setCustom({ ...custom, model: e.target.value.slice(0, 120) })}
                placeholder={t.customModel}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={info?.placeholder || t.placeholder}
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

          {info?.keyUrl && (
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openMode("free")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20"
          >
            <Plus className="h-3.5 w-3.5" /> {t.addFree}
          </button>
          <button
            type="button"
            onClick={() => openMode("paid")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/20"
          >
            <Plus className="h-3.5 w-3.5" /> {t.addPaid}
          </button>
          <button
            type="button"
            onClick={() => openMode("custom")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <Wrench className="h-3.5 w-3.5" /> {t.addCustom}
          </button>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{t.geminiNote}</p>
      <p className="text-[11px] text-muted-foreground">{t.ownKeys}</p>

      {rows.some((r) => r.provider.id === "gemini") && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-500">
          <CheckCircle2 className="h-3.5 w-3.5" /> Gemini {t.working}
        </p>
      )}
    </div>
  );
}
