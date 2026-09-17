/**
 * "Who runs what" — one line per job, one chosen key per line.
 *
 * Every choice is the user's own saved key. Leaving a job on "Pick for me"
 * simply uses their newest key that can do that job.
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { getUserAiKeyStatus } from "@/lib/user-ai-keys.functions";
import { listAiRoles, setAiRole } from "@/lib/ai-roles.functions";
import { AI_ROLES, PROVIDER_LABEL, ROLE_COPY, ROLE_PROVIDERS, type AiRole } from "@/lib/ai-roles";
import { clearRoleCache } from "@/lib/api-keys";
import { pickCopy, useLang } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";

type KeyRow = { provider: string; tail: string };

const AUTO = "auto";

export function AiRolesCard() {
  const { lang } = useLang();
  const { isAuthenticated } = useAuth();
  const loadKeys = useServerFn(getUserAiKeyStatus);
  const loadRoles = useServerFn(listAiRoles);
  const saveRole = useServerFn(setAiRole);

  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<AiRole | null>(null);
  const [note, setNote] = useState("");

  const t = {
    auto: pickCopy({ en: "Pick for me", mn: "Автоматаар сонгох", ko: "자동 선택" }, lang),
    none: pickCopy(
      { en: "No key for this yet", mn: "Энэд түлхүүр алга", ko: "이 작업용 키가 없습니다" },
      lang,
    ),
    signIn: pickCopy(
      { en: "Sign in to choose who runs what.", mn: "Нэвтэрч ороод хэн юу ажиллуулахыг сонго.", ko: "로그인하면 담당 엔진을 고를 수 있습니다." },
      lang,
    ),
    saved: pickCopy({ en: "Saved", mn: "Хадгаллаа", ko: "저장됨" }, lang),
  };

  const copy = ROLE_COPY[(["en", "mn", "ko"] as const).includes(lang as "en") ? (lang as "en" | "mn" | "ko") : "en"] ?? ROLE_COPY.en;

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      try {
        const [k, r] = await Promise.all([loadKeys(), loadRoles()]);
        setKeys((k as KeyRow[]).map((row) => ({ provider: row.provider, tail: row.tail })));
        const next: Record<string, string> = {};
        for (const row of r) next[row.role] = row.keyTail ? `${row.provider}:${row.keyTail}` : `${row.provider}:`;
        setChoice(next);
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
    try {
      if (value === AUTO) {
        await saveRole({ data: { role, provider: null, keyTail: null } });
      } else {
        const [provider, tail] = value.split(":");
        await saveRole({ data: { role, provider: provider ?? null, keyTail: tail || null } });
      }
      clearRoleCache();
      setNote(t.saved);
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3">
      {AI_ROLES.map((role) => {
        const options = keys.filter((k) => ROLE_PROVIDERS[role].includes(k.provider));
        return (
          <div key={role} className="flex flex-wrap items-center gap-2 border-b border-border/60 py-2 last:border-0">
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
                <option key={`${k.provider}:${k.tail}`} value={`${k.provider}:${k.tail}`}>
                  {PROVIDER_LABEL[k.provider] ?? k.provider} ···{k.tail}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {note && <p className="pt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
