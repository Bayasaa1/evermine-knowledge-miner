/**
 * "Who runs what" — one line per job, one chosen key per line.
 *
 * Every choice is the user's own saved key. Leaving a job on "Pick for me"
 * simply uses their newest key that can do that job — and the row says which
 * key that is, so a silent fallback can never look like success.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, RefreshCw, X } from "lucide-react";

import { getUserAiKeyStatus } from "@/lib/user-ai-keys.functions";
import { describeAiRoles, listAiRoles, setAiRole, testAiRoleKey, testAllAiRoles } from "@/lib/ai-roles.functions";
import { AI_ROLES, PROVIDER_LABEL, ROLE_COPY, ROLE_PROVIDERS, type AiRole } from "@/lib/ai-roles";
import { clearRoleCache } from "@/lib/api-keys";
import { Button } from "@/components/ui/button";
import { pickCopy, useLang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";

type KeyRow = { id: string; provider: string; tail: string; enabled: boolean; status?: string };
type Report = { role: string; provider: string; assignedTail: string | null; effectiveTail: string | null; missing: boolean };
type TestState = { ok: boolean; message: string } | "running";

const AUTO = "auto";
export function AiRolesCard() {
  const { lang } = useLang();
  const { isAuthenticated } = useAuth();
  const loadKeys = useServerFn(getUserAiKeyStatus);
  const loadRoles = useServerFn(listAiRoles);
  const loadReports = useServerFn(describeAiRoles);
  const saveRole = useServerFn(setAiRole);
  const runTest = useServerFn(testAiRoleKey);
  const runAllTests = useServerFn(testAllAiRoles);

  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [fallback, setFallback] = useState<Record<string, boolean>>({});
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [busy, setBusy] = useState<AiRole | null>(null);
  const [note, setNote] = useState("");

  const t = {
    auto: pickCopy({ en: "Pick for me", mn: "Автоматаар сонгох", ko: "자동 선택" }, lang),
    none: pickCopy({ en: "No key for this yet", mn: "Энэд түлхүүр алга", ko: "이 작업용 키가 없습니다" }, lang),
    signIn: pickCopy(
      { en: "Sign in to choose who runs what.", mn: "Нэвтэрч ороод хэн юу ажиллуулахыг сонго.", ko: "로그인하면 담당 엔진을 고를 수 있습니다." },
      lang,
    ),
    saved: pickCopy({ en: "Saved", mn: "Хадгаллаа", ko: "저장됨" }, lang),
    test: pickCopy({ en: "Test", mn: "Шалгах", ko: "테스트" }, lang),
    running: pickCopy({ en: "Running it now", mn: "Одоо ажиллуулж байна", ko: "지금 실행 중" }, lang),
    noKey: pickCopy({ en: "Add a key first", mn: "Эхлээд түлхүүр нэм", ko: "먼저 키를 추가하세요" }, lang),
    fallback: pickCopy({ en: "Switch automatically when this key runs out", mn: "Энэ түлхүүр дуусвал автоматаар солих", ko: "이 키가 소진되면 자동 전환" }, lang),
    checkAll: pickCopy({ en: "Check everything", mn: "Бүгдийг шалгах", ko: "모두 확인" }, lang),
  };

  const copy = ROLE_COPY[(["en", "mn", "ko"] as const).includes(lang as "en") ? (lang as "en" | "mn" | "ko") : "en"] ?? ROLE_COPY.en;

  const refresh = async () => {
    const [k, r, d] = await Promise.all([loadKeys(), loadRoles(), loadReports()]);
    setKeys((k as KeyRow[]).filter((row) => row.enabled && row.status !== "invalid" && row.status !== "exhausted"));
    const next: Record<string, string> = {};
    const nextFallback: Record<string, boolean> = {};
    for (const row of r) {
      next[row.role] = row.keyId ?? AUTO;
      nextFallback[row.role] = row.autoFallback;
    }
    setChoice(next);
    setFallback(nextFallback);
    const byRole: Record<string, Report> = {};
    for (const row of d as Report[]) byRole[row.role] = row;
    setReports(byRole);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      try {
        await refresh();
      } catch {
        /* not signed in yet */
      }
    })();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <p className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">{t.signIn}</p>;
  }

  const pick = async (role: AiRole, value: string) => {
    setChoice((c) => ({ ...c, [role]: value }));
    setBusy(role);
    setNote("");
    setTests((s) => ({ ...s, [role]: undefined as unknown as TestState }));
    try {
      if (value === AUTO) {
        await saveRole({ data: { role, provider: null, keyTail: null } });
      } else {
        const selected = keys.find((key) => key.id === value);
        if (!selected) throw new Error(t.noKey);
        await saveRole({ data: { role, provider: selected.provider, keyTail: selected.tail, keyId: selected.id, autoFallback: fallback[role] ?? true } });
      }
      clearRoleCache();
      setNote(t.saved);
      await refresh();
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const toggleFallback = async (role: AiRole, enabled: boolean) => {
    setFallback((current) => ({ ...current, [role]: enabled }));
    const selected = keys.find((key) => key.id === choice[role]);
    if (selected) await saveRole({ data: { role, provider: selected.provider, keyTail: selected.tail, keyId: selected.id, autoFallback: enabled } });
  };

  const testAll = async () => {
    setBusy("chat");
    try {
      const result = await runAllTests();
      const next: Record<string, TestState> = {};
      for (const row of result) next[row.role] = { ok: row.ok, message: row.message };
      setTests(next);
    } finally {
      setBusy(null);
    }
  };

  const test = async (role: AiRole) => {
    setTests((s) => ({ ...s, [role]: "running" }));
    try {
      const res = await runTest({ data: { role } });
      setTests((s) => ({ ...s, [role]: { ok: res.ok, message: res.message } }));
    } catch (err) {
      setTests((s) => ({ ...s, [role]: { ok: false, message: err instanceof Error ? err.message : String(err) } }));
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      {AI_ROLES.map((role) => {
        const options = keys.filter((k) => ROLE_PROVIDERS[role].includes(k.provider));
        const report = reports[role];
        const state = tests[role];

        return (
          <div key={role} className="border-b border-border/60 py-2 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{copy[role].name}</p>
                <p className="text-xs text-muted-foreground">{copy[role].hint}</p>
              </div>

                <select
                  value={choice[role] ?? AUTO}
                  disabled={busy === role}
                  onChange={(e) => void pick(role, e.target.value)}
                  aria-label={copy[role].name}
                  className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground"
                >
                  <option value={AUTO}>{options.length ? t.auto : t.none}</option>
                  {options.map((k) => (
                    <option key={k.id} value={k.id}>
                      {PROVIDER_LABEL[k.provider] ?? k.provider} ···{k.tail}
                    </option>
                  ))}
                </select>

              {report?.effectiveTail && (
                <button
                  type="button"
                  onClick={() => void test(role)}
                  className="rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {state === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t.test}
                </button>
              )}
            </div>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={fallback[role] ?? true} onChange={(event) => void toggleFallback(role, event.target.checked)} />
              {t.fallback}
            </label>

            {report && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {report.effectiveTail
                  ? `${PROVIDER_LABEL[report.provider] ?? report.provider} ···${report.effectiveTail}`
                  : t.noKey}
              </p>
            )}
            {report?.missing && (
              <p className="mt-1 text-[11px] text-amber-500">
                {pickCopy(
                  {
                    en: `The key you chose (···${report.assignedTail}) is gone — ···${report.effectiveTail ?? "?"} is running it.`,
                    mn: `Сонгосон түлхүүр (···${report.assignedTail}) алга — ···${report.effectiveTail ?? "?"} ажиллаж байна.`,
                    ko: `선택한 키(···${report.assignedTail})가 없어 ···${report.effectiveTail ?? "?"} 가 실행합니다.`,
                  },
                  lang,
                )}
              </p>
            )}
            {state && state !== "running" && (
              <p className={`mt-1 flex items-center gap-1 text-[11px] ${state.ok ? "text-emerald-500" : "text-destructive"}`}>
                {state.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {state.message}
              </p>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => void testAll()} disabled={busy != null}>
        {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} {t.checkAll}
      </Button>
      {note && <p className="pt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
