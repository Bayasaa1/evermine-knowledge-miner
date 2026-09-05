/**
 * Step 3 — pick the AI that mines the saved videos.
 *
 * Gemini is preselected. Any other brain asks for its API key exactly once: if a
 * key for that provider is already stored on this device, the field is skipped.
 * Skipping this step entirely is fine — the saved videos simply stay in
 * Saved Minds until the creator comes back.
 */
import { useEffect, useState } from "react";
import { BrainCircuit, Check, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pickCopy, type Lang } from "@/lib/i18n";
import {
  DEFAULT_MINER,
  MINERS,
  existingKeyFor,
  findMiner,
  loadMinerChoice,
  saveMinerChoice,
  storeKeyFor,
  type MinerChoice,
  type MinerId,
} from "@/lib/miner-pool";

const copy = {
  en: {
    title: "Pick the AI that mines your videos",
    sub: "Gemini is the default miner. Choose another brain, or plug in your own AI.",
    keyTitle: "API key",
    keySaved: "Key already saved on this device",
    save: "Save AI choice",
    saved: "AI choice saved",
    keyNeeded: "Add the API key for this AI first.",
    customLabel: "AI name",
    customEndpoint: "Endpoint URL (OpenAI-compatible)",
    customModel: "Model name",
    skip: "Skip this step — every saved video stays in Saved Minds and can be mined later.",
    active: "Active miner",
  },
  mn: {
    title: "Видеог олборлох AI-гаа сонгоно уу",
    sub: "Анхдагч нь Gemini. Өөр тархи сонгох, эсвэл өөрийн AI-гаа холбож болно.",
    keyTitle: "API түлхүүр",
    keySaved: "Түлхүүр энэ төхөөрөмжид аль хэдийн хадгалагдсан",
    save: "AI сонголтыг хадгалах",
    saved: "AI сонголт хадгалагдлаа",
    keyNeeded: "Эхлээд энэ AI-ийн API түлхүүрийг оруулна уу.",
    customLabel: "AI-ийн нэр",
    customEndpoint: "Endpoint хаяг (OpenAI-тэй нийцтэй)",
    customModel: "Загварын нэр",
    skip: "Энэ алхмыг алгасаж болно — хадгалсан бүх видео Хадгалсан оюунд үлдэж, дараа олборлогдоно.",
    active: "Идэвхтэй олборлогч",
  },
  ko: {
    title: "영상을 마이닝할 AI 선택",
    sub: "기본 마이너는 Gemini입니다. 다른 AI를 고르거나 직접 연결할 수 있습니다.",
    keyTitle: "API 키",
    keySaved: "이 기기에 키가 이미 저장되어 있습니다",
    save: "AI 선택 저장",
    saved: "AI 선택이 저장되었습니다",
    keyNeeded: "먼저 이 AI의 API 키를 입력하세요.",
    customLabel: "AI 이름",
    customEndpoint: "엔드포인트 URL (OpenAI 호환)",
    customModel: "모델 이름",
    skip: "이 단계를 건너뛰어도 됩니다 — 저장된 영상은 저장된 마인드에 남아 나중에 마이닝할 수 있습니다.",
    active: "활성 마이너",
  },
};

export function MinerPool({ lang, onChange }: { lang: Lang; onChange?: (choice: MinerChoice) => void }) {
  const t = pickCopy(copy, lang);
  const [choice, setChoice] = useState<MinerChoice>(DEFAULT_MINER);
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadMinerChoice().then((c) => {
      setChoice(c);
      onChange?.(c);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    void existingKeyFor(choice.id).then((k) => {
      if (cancelled) return;
      setHasKey(!!k);
      setApiKey("");
    });
    return () => {
      cancelled = true;
    };
  }, [choice.id]);

  const option = findMiner(choice.id);
  const needsKey = !!option?.keyField && !hasKey;

  const persist = async () => {
    if (needsKey && !apiKey.trim()) {
      toast.error(t.keyNeeded);
      return;
    }
    setBusy(true);
    try {
      if (apiKey.trim()) {
        await storeKeyFor(choice.id, apiKey.trim());
        setHasKey(true);
        setApiKey("");
      }
      await saveMinerChoice(choice);
      onChange?.(choice);
      toast.success(t.saved);
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<MinerChoice>) => {
    const next = { ...choice, ...patch };
    setChoice(next);
    onChange?.(next);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <BrainCircuit className="h-4 w-4 text-primary" /> {t.title}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {MINERS.map((m) => {
          const on = choice.id === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => set({ id: m.id as MinerId })}
              className={`rounded-xl border p-3 text-left transition-colors ${
                on ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                {m.label}
                {m.id === "gemini" && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-primary">
                    default
                  </span>
                )}
                {on && <Check className="ml-auto h-4 w-4 text-primary" />}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{m.note}</span>
            </button>
          );
        })}
      </div>

      {choice.id === "custom" && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <input
            value={choice.custom.label}
            onChange={(e) => set({ custom: { ...choice.custom, label: e.target.value.slice(0, 60) } })}
            placeholder={t.customLabel}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <input
            value={choice.custom.endpoint}
            onChange={(e) => set({ custom: { ...choice.custom, endpoint: e.target.value.slice(0, 300) } })}
            placeholder={t.customEndpoint}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
          <input
            value={choice.custom.model}
            onChange={(e) => set({ custom: { ...choice.custom, model: e.target.value.slice(0, 80) } })}
            placeholder={t.customModel}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
          />
        </div>
      )}

      {option?.keyField &&
        (hasKey ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-emerald-500">
            <Check className="h-3.5 w-3.5" /> {t.keySaved}
          </p>
        ) : (
          <label className="mt-4 block">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5" /> {t.keyTitle}
            </span>
            <input
              value={apiKey}
              type="password"
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={option.keyPlaceholder}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
          </label>
        ))}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void persist()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t.save}
        </button>
        <span className="text-xs text-muted-foreground">
          {t.active}: {option?.label ?? "Gemini"}
        </span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t.skip}</p>
    </div>
  );
}
