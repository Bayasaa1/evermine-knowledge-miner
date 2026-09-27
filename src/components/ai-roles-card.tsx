/**
 * "Who runs what" — one line per job, one chosen key per line.
 *
 * Every choice is the user's own saved key. Leaving a job on "Pick for me"
 * simply uses their newest key that can do that job — and the row says which
 * key that is, so a silent fallback can never look like success.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, RefreshCw, X } from "lucide-react";

import { getUserAiKeyStatus } from "@/lib/user-ai-keys.functions";
import { describeAiRoles, listAiRoles, setAiRole, testAiRoleKey, testAllAiRoles } from "@/lib/ai-roles.functions";
import { AI_ROLES, PROVIDER_LABEL, ROLE_COPY, ROLE_PROVIDERS, ROLE_STRENGTH, type AiRole } from "@/lib/ai-roles";
import { clearRoleCache } from "@/lib/api-keys";
import { Button } from "@/components/ui/button";
import { pickCopy, useLang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";

type KeyRow = { id: string; provider: string; tail: string; enabled: boolean; status?: string; costKind?: string; label?: string | null };
type Report = { role: string; provider: string; assignedProvider: string | null; assignedTail: string | null; assignedKeyId: string | null; effectiveProvider: string | null; effectiveTail: string | null; missing: boolean };
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
  const [teams, setTeams] = useState<Record<string, string[]>>({});
  const [exclusive, setExclusive] = useState<Record<string, boolean>>({});
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
    unavailable: pickCopy({ en: "currently unavailable", mn: "одоогоор ажиллахгүй", ko: "현재 사용 불가" }, lang),
    fallback: pickCopy({ en: "Switch automatically when this key runs out", mn: "Энэ түлхүүр дуусвал автоматаар солих", ko: "이 키가 소진되면 자동 전환" }, lang),
    team: pickCopy({ en: "Keys for this job, in order — #1 runs it, the next takes over when it runs out", mn: "Энэ ажлын түлхүүрүүд дарааллаар — #1 ажиллана, дуусвал дараагийнх нь орно", ko: "이 작업의 키 순서 — 1번이 실행하고 소진되면 다음 키로 넘어갑니다" }, lang),
    add: pickCopy({ en: "Add a key to this job", mn: "Энэ ажилд түлхүүр нэмэх", ko: "이 작업에 키 추가" }, lang),
    only: pickCopy({ en: "Only this job may use these keys", mn: "Эдгээр түлхүүрийг зөвхөн энэ ажил ашиглана", ko: "이 키들은 이 작업만 사용" }, lang),
    usedBy: pickCopy({ en: "kept for", mn: "зориулсан:", ko: "전용:" }, lang),
    free: pickCopy({ en: "free", mn: "үнэгүй", ko: "무료" }, lang),
    paid: pickCopy({ en: "paid", mn: "төлбөртэй", ko: "유료" }, lang),
    checkAll: pickCopy({ en: "Check everything", mn: "Бүгдийг шалгах", ko: "모두 확인" }, lang),
    geminiChat: pickCopy({
      en: "Recommended for multilingual character chat: Gemini handles Mongolian and persona consistency better than the default free OpenRouter model.",
      mn: "Олон хэлтэй дүрийн чатад Gemini-г зөвлөж байна. Монгол хэл болон дүрээ хадгалахдаа OpenRouter-ийн үндсэн үнэгүй загвараас илүү найдвартай.",
      ko: "다국어 캐릭터 채팅에는 Gemini를 권장합니다. 몽골어와 인물 일관성이 기본 무료 OpenRouter 모델보다 안정적입니다.",
    }, lang),
  };

  const language = (["en", "mn", "ko"] as const).includes(lang as "en") ? (lang as "en" | "mn" | "ko") : "en";
  const copy = ROLE_COPY[language] ?? ROLE_COPY.en;
  const strengths = ROLE_STRENGTH[language];

  const refresh = async () => {
    const [k, r, d] = await Promise.all([loadKeys(), loadRoles(), loadReports()]);
    // Keep every enabled key visible. A provider limit must not make a saved
    // key or its role assignment look deleted.
    setKeys((k as KeyRow[]).filter((row) => row.enabled));
    const next: Record<string, string> = {};
    const nextFallback: Record<string, boolean> = {};
    const nextTeams: Record<string, string[]> = {};
    const nextOnly: Record<string, boolean> = {};
    for (const row of r) {
      next[row.role] = row.keyId ?? AUTO;
      nextFallback[row.role] = row.autoFallback;
      nextTeams[row.role] = row.teamKeyIds?.length ? row.teamKeyIds : row.keyId ? [row.keyId] : [];
      nextOnly[row.role] = row.exclusive;
    }
    setChoice(next);
    setFallback(nextFallback);
    setTeams(nextTeams);
    setExclusive(nextOnly);
    const byRole: Record<string, Report> = {};
    for (const row of d as Report[]) byRole[row.role] = row;
    setReports(byRole);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const run = () => void (async () => {
      try {
        await refresh();
      } catch {
        /* not signed in yet */
      }
    })();
    run();
    window.addEventListener("evermind:ai-keys-changed", run);
    return () => window.removeEventListener("evermind:ai-keys-changed", run);
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

  const saveTeam = async (role: AiRole, team: string[], only = exclusive[role] ?? false) => {
    setTeams((c) => ({ ...c, [role]: team }));
    setExclusive((c) => ({ ...c, [role]: only }));
    setBusy(role);
    setNote("");
    try {
      const first = keys.find((key) => key.id === team[0]);
      if (!first) {
        await saveRole({ data: { role, provider: null, keyTail: null } });
      } else {
        await saveRole({ data: { role, provider: first.provider, keyTail: first.tail, keyId: first.id, autoFallback: team.length > 1 || (fallback[role] ?? true), teamKeyIds: team, exclusive: only } });
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

  const move = (list: string[], i: number, d: number) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return next;
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
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
    } catch (err) {
      setNote(err instanceof Error ? err.message : t.noKey);
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
            {(() => {
              const team = teams[role] ?? [];
              const ownerOf = (id: string) => AI_ROLES.find((r) => r !== role && exclusive[r] && (teams[r] ?? []).includes(id));
              const addable = options.filter((k) => !team.includes(k.id));
              const label = (k: KeyRow) => `${PROVIDER_LABEL[k.provider] ?? k.provider}${k.label ? ` · ${k.label}` : ""} ···${k.tail}`;
              return (
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] text-muted-foreground">{t.team}</p>
                  {team.length === 0 && <p className="text-[11px] text-muted-foreground">— {options.length ? t.auto : t.none}</p>}
                  {team.map((id, i) => {
                    const k = keys.find((key) => key.id === id);
                    if (!k) return null;
                    const out = k.status === "exhausted" || k.status === "invalid";
                    return (
                      <div key={id} className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 px-2 py-1 text-xs">
                        <span className="w-5 font-semibold text-foreground">#{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-foreground">{label(k)}</span>
                        <span className={`rounded px-1 text-[10px] ${k.costKind === "paid" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {k.costKind === "paid" ? t.paid : t.free}
                        </span>
                        {out && <span className="text-[10px] text-amber-500">{t.unavailable}</span>}
                        <button type="button" aria-label="up" disabled={busy === role || i === 0} onClick={() => void saveTeam(role, move(team, i, -1))} className="p-1 text-muted-foreground disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                        <button type="button" aria-label="down" disabled={busy === role || i === team.length - 1} onClick={() => void saveTeam(role, move(team, i, 1))} className="p-1 text-muted-foreground disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                        <button type="button" aria-label="remove" disabled={busy === role} onClick={() => void saveTeam(role, team.filter((x) => x !== id))} className="p-1 text-muted-foreground"><X className="h-3 w-3" /></button>
                      </div>
                    );
                  })}
                  {addable.length > 0 && (
                    <div className="flex items-center gap-1">
                      <Plus className="h-3 w-3 text-muted-foreground" />
                      <select
                        value=""
                        disabled={busy === role}
                        onChange={(e) => e.target.value && void saveTeam(role, [...team, e.target.value])}
                        aria-label={`${copy[role].name} — ${t.add}`}
                        className="flex-1 rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground"
                      >
                        <option value="">{t.add}</option>
                        {addable.map((k) => {
                          const owner = ownerOf(k.id);
                          return (
                            <option key={k.id} value={k.id} disabled={!!owner}>
                              {label(k)} ({k.costKind === "paid" ? t.paid : t.free}){owner ? ` — ${t.usedBy} ${copy[owner].name}` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                  {team.length > 0 && (
                    <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <input type="checkbox" checked={exclusive[role] ?? false} disabled={busy === role} onChange={(e) => void saveTeam(role, team, e.target.checked)} />
                      {t.only}
                    </label>
                  )}
                </div>
              );
            })()}
            {(teams[role]?.length ?? 0) <= 1 && <label className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={fallback[role] ?? true} onChange={(event) => void toggleFallback(role, event.target.checked)} />
              {t.fallback}
            </label>}

            {report && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {report.effectiveTail
                  ? `${PROVIDER_LABEL[report.effectiveProvider ?? report.provider] ?? report.effectiveProvider ?? report.provider} ···${report.effectiveTail}`
                  : t.noKey}
              </p>
            )}
            {choice[role] && choice[role] !== AUTO && (() => {
              const selected = keys.find((key) => key.id === choice[role]);
              const hint = selected ? strengths[selected.provider] : null;
              return hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null;
            })()}
            {role === "chat" && report?.effectiveProvider !== "gemini" && keys.some((key) => key.provider === "gemini") && (
              <p className="mt-1 text-[11px] text-amber-500">{t.geminiChat}</p>
            )}
            {report?.missing && (
              <p className="mt-1 text-[11px] text-amber-500">
                {pickCopy(
                  {
                    en: `${PROVIDER_LABEL[report.assignedProvider ?? ""] ?? report.assignedProvider} ···${report.assignedTail} is unavailable. Automatic switching is using ${PROVIDER_LABEL[report.effectiveProvider ?? ""] ?? report.effectiveProvider} ···${report.effectiveTail ?? "?"}.`,
                    mn: `${PROVIDER_LABEL[report.assignedProvider ?? ""] ?? report.assignedProvider} ···${report.assignedTail} одоогоор ажиллахгүй. Автомат солилт ${PROVIDER_LABEL[report.effectiveProvider ?? ""] ?? report.effectiveProvider} ···${report.effectiveTail ?? "?"}-г ашиглаж байна.`,
                    ko: `${PROVIDER_LABEL[report.assignedProvider ?? ""] ?? report.assignedProvider} ···${report.assignedTail} 키는 현재 사용할 수 없습니다. 자동 전환이 ${PROVIDER_LABEL[report.effectiveProvider ?? ""] ?? report.effectiveProvider} ···${report.effectiveTail ?? "?"} 키를 사용 중입니다.`,
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
