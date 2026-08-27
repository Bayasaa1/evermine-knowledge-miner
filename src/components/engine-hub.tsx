import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Cpu, KeyRound, Zap, Gift, Check, Loader2, FlaskConical } from "lucide-react";
import {
  SLOT_ORDER,
  enginesFor,
  estimateHourlyCost,
  findEngine,
  freeStack,
  loadStack,
  missingKeys,
  saveStack,
  stackEngines,
  type BillingMode,
  type EngineSlot,
  type EngineStack,
} from "@/lib/engines";
import { providerForKeyField, testProviderKey } from "@/lib/ai-providers";
import { useAuth } from "@/hooks/use-auth";

const copy = {
  en: {
    title: "API engine stack",
    hint: "Pick the engines that power your clone. Free engines cost nothing; premium engines run on your own key or are billed at the provider's raw price with no platform markup.",
    slots: { llm: "Brain (LLM)", tts: "Voice (TTS)", avatar: "Avatar" } as Record<EngineSlot, string>,
    llmNote: "The brain engine answers chats and extracts knowledge. Video file mining always runs on Gemini — the only engine with native video input — so keep Google linked or a Gemini key saved.",
    free: "Free",
    premium: "Premium",
    billing: "Billing",
    byo: "Use my own API keys",
    passthrough: "Pass-through at raw provider cost",
    keys: "Provider keys",
    keysHint: "Optional — the free platform stack works with no keys at all. Keys you paste stay in this browser and are never uploaded or shared.",
    keyPlaceholder: "Paste key",
    missing: (n: number) => `${n} premium engine(s) still need a key.`,
    cost: "Estimated cost per conversation hour",
    zero: "$0.00 — fully free stack",
    noMarkup: "Raw provider prices. Evermine adds 0%.",
    reset: "Reset to free stack",
    saved: "Engine stack saved.",
    test: "Test",
    testing: "Testing…",
    testOk: "Key works — engine is ready.",
    testFail: "Key test failed",
  },
  mn: {
    title: "API хөдөлгүүрийн багц",
    hint: "Хуулбараа ажиллуулах хөдөлгүүрээ сонго. Үнэгүй нь зардалгүй; premium нь таны түлхүүрээр эсвэл нийлүүлэгчийн жинхэнэ үнээр, нэмэлт шимтгэлгүй ажиллана.",
    slots: { llm: "Тархи (LLM)", tts: "Дуу хоолой (TTS)", avatar: "Аватар" } as Record<EngineSlot, string>,
    llmNote: "Тархины хөдөлгүүр чат болон мэдлэгийн асуултад хариулна. Видео файлыг зөвхөн Gemini шууд уншдаг тул олборлолт үргэлж Gemini дээр ажиллана — Google холбоотой байгаарай эсвэл Gemini түлхүүр хадгалаарай.",
    free: "Үнэгүй",
    premium: "Премиум",
    billing: "Төлбөр",
    byo: "Өөрийн API түлхүүр ашиглах",
    passthrough: "Нийлүүлэгчийн жинхэнэ үнээр дамжуулах",
    keys: "Нийлүүлэгчийн түлхүүр",
    keysHint: "Заавал биш — үнэгүй платформын багц түлхүүргүйгээр ажиллана. Буулгасан түлхүүр зөвхөн энэ хөтөч дээр хадгалагдаж, хэнд ч илгээгдэхгүй.",
    keyPlaceholder: "Түлхүүр буулгах",
    missing: (n: number) => `${n} премиум хөдөлгүүрт түлхүүр дутуу байна.`,
    cost: "Нэг цагийн яриа тутмын тооцоолсон зардал",
    zero: "$0.00 — бүрэн үнэгүй багц",
    noMarkup: "Нийлүүлэгчийн жинхэнэ үнэ. Evermine 0% нэмнэ.",
    reset: "Үнэгүй багц руу буцаах",
    saved: "Хөдөлгүүрийн багц хадгалагдлаа.",
    test: "Шалгах",
    testing: "Шалгаж байна…",
    testOk: "Түлхүүр ажиллаж байна — хөдөлгүүр бэлэн.",
    testFail: "Түлхүүр шалгах амжилтгүй",
  },
} as const;

export function EngineHub({ lang }: { lang: "en" | "mn" }) {
  const t = copy[lang];
  const [stack, setStack] = useState<EngineStack>(freeStack);
  const [hydrated, setHydrated] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  // Keys are per-account: reload the vault whenever the signed-in user changes.
  const { userId } = useAuth();

  const runKeyTest = useCallback(
    async (keyField: string) => {
      const provider = providerForKeyField(keyField);
      const key = stack.keys[keyField]?.trim();
      if (!provider || !key) return;
      setTestingKey(keyField);
      try {
        await testProviderKey(provider.id, key);
        toast.success(t.testOk);
      } catch (err) {
        toast.error(t.testFail, { description: err instanceof Error ? err.message : String(err) });
      } finally {
        setTestingKey(null);
      }
    },
    [stack.keys, t],
  );

  useEffect(() => {
    let alive = true;
    setHydrated(false);
    setStack(freeStack());
    void (async () => {
      const next = await loadStack();
      if (!alive) return;
      setStack(next);
      setHydrated(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => void saveStack(stack), 400);
    return () => clearTimeout(id);
  }, [hydrated, stack]);

  const pick = useCallback((slot: EngineSlot, id: string) => setStack((s) => ({ ...s, [slot]: id })), []);

  const estimate = estimateHourlyCost(stack);
  const needsKeys = missingKeys(stack);
  const keyEngines = stackEngines(stack).filter((e) => e.keyField);

  return (
    <section id="engines" className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cpu className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
        <button
          onClick={() => {
            setStack(freeStack());
            toast.success(t.saved);
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Gift className="h-3.5 w-3.5" />
          {t.reset}
        </button>
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t.hint}</p>

      <div className="grid gap-4 lg:grid-cols-3">
        {SLOT_ORDER.map((slot) => (
          <div key={slot} className="min-w-0">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t.slots[slot]}
            </h4>
            <ul className="space-y-2">
              {enginesFor(slot).map((e) => {
                const active = stack[slot] === e.id;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => pick(slot, e.id)}
                      className={`w-full rounded-[12px] border p-3 text-left transition-colors ${
                        active ? "border-primary bg-primary/5" : "border-border bg-muted/40 hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{e.name}</span>
                        {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            e.tier === "free"
                              ? "bg-status-green/10 text-status-green"
                              : "bg-status-amber/10 text-status-amber"
                          }`}
                        >
                          {e.tier === "free" ? t.free : t.premium}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">{e.rawPrice}</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{e.note}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {t.llmNote}
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[12px] border border-border bg-muted/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="h-4 w-4 text-primary" /> {t.billing}
          </div>
          <div className="space-y-2">
            {(["byo", "passthrough"] as BillingMode[]).map((mode) => (
              <label
                key={mode}
                className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                  stack.billing === mode ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="billing"
                  checked={stack.billing === mode}
                  onChange={() => setStack((s) => ({ ...s, billing: mode }))}
                  className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                />
                <span>{mode === "byo" ? t.byo : t.passthrough}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">{t.cost}</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">
              {estimate.free ? t.zero : `$${estimate.hourly.toFixed(2)}/h`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t.noMarkup}</p>
          </div>
        </div>

        <div className="rounded-[12px] border border-border bg-muted/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-primary" /> {t.keys}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{t.keysHint}</p>
          {keyEngines.length === 0 ? (
            <p className="text-xs text-muted-foreground/80">{t.zero}</p>
          ) : (
            <div className="space-y-3">
              {keyEngines.map((e) => {
                const testable = !!providerForKeyField(e.keyField) && !!(stack.keys[e.keyField] ?? "").trim();
                return (
                <div key={e.id}>
                  <label htmlFor={`key-${e.id}`} className="mb-1.5 block text-xs text-muted-foreground">
                    {e.vendor} · <span className="font-mono">{e.keyField}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`key-${e.id}`}
                      type="password"
                      autoComplete="off"
                      placeholder={t.keyPlaceholder}
                      value={stack.keys[e.keyField] ?? ""}
                      onChange={(ev) =>
                        setStack((s) => ({ ...s, keys: { ...s.keys, [e.keyField]: ev.target.value } }))
                      }
                      className="w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground outline-none transition-colors focus:border-primary"
                    />
                    {testable && (
                      <button
                        type="button"
                        onClick={() => void runKeyTest(e.keyField)}
                        disabled={testingKey !== null}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50"
                      >
                        {testingKey === e.keyField ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FlaskConical className="h-3.5 w-3.5" />
                        )}
                        {testingKey === e.keyField ? t.testing : t.test}
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
              {needsKeys.length > 0 && (
                <p className="text-xs font-medium text-status-amber">{t.missing(needsKeys.length)}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        {stackEngines(stack)
          .map((e) => `${t.slots[e.slot]}: ${findEngine(e.id)?.name}`)
          .join(" · ")}
      </p>

      <p className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        {lang === "mn"
          ? "Үнэгүй багцын мэдэгдэл: задалгаа Google Gemini дээр ажиллана. Үнэгүй багцад Google илгээсэн агуулгыг загвараа сайжруулахад ашиглаж болзошгүйг Gemini API-ийн нөхцөл заасан тул хувийн, нууц бичлэг оруулахаас зайлсхийнэ үү."
          : "Free tier notice: analysis runs on Google Gemini. Under the Gemini API terms, content sent on the free tier may be reviewed by Google to improve their models — avoid private or confidential footage, or switch to a paid key."}
      </p>
    </section>
  );
}
