import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown, Download, History, Loader2, RotateCcw } from "lucide-react";

import { clearUsageHistory, getUsageHistory, type UsageHistory } from "@/lib/ai-usage.functions";
import { rateOf } from "@/lib/ai-rates";
import { pickCopy, type Lang } from "@/lib/i18n";

const copy = {
  en: {
    title: "History",
    sub: "Every AI call your account made — what it was for, what it used, what it cost.",
    today: "Today",
    month: "This month",
    all: "All time",
    tokens: "tokens",
    calls: "calls",
    spent: "Money the AIs charged",
    free: "on free keys",
    byJob: "Where it went",
    byVideo: "Per video",
    everyCall: "Every call",
    leaks: "Where you are losing tokens",
    noLeaks: "Nothing wasteful found. ",
    empty: "No AI calls recorded yet. Translate something or mine a video and this fills up.",
    range: "Last",
    d7: "7 days",
    d30: "30 days",
    d365: "All",
    onlyFail: "Only failures",
    clear: "Clear history",
    export: "Export CSV",
    more: "Show more",
    failed: "failed",
    signIn: "Sign in to see your AI history.",
    roles: {
      translate: "Translation",
      mine: "Mining videos",
      chat: "Chat",
      core_brain: "Core Brain",
      face_clone: "Seeing on video calls",
      voice_clone: "Voice clone",
      other: "Other",
    } as Record<string, string>,
  },
  mn: {
    title: "Түүх",
    sub: "Таны бүртгэлийн хийсэн бүх AI дуудлага — юунд, хэдэн токен, хэдэн төгрөг.",
    today: "Өнөөдөр",
    month: "Энэ сар",
    all: "Нийт",
    tokens: "токен",
    calls: "дуудлага",
    spent: "AI-д төлсөн мөнгө",
    free: "үнэгүй түлхүүр дээр",
    byJob: "Хаана зарцуулсан",
    byVideo: "Видео тус бүрээр",
    everyCall: "Бүх дуудлага",
    leaks: "Токен хаана алдагдаж байна",
    noLeaks: "Үрэлгэн зүйл олдсонгүй. ",
    empty: "Одоогоор AI дуудлага бүртгэгдээгүй. Орчуулга хийх юм уу видео олборловол энд гарна.",
    range: "Сүүлийн",
    d7: "7 хоног",
    d30: "30 хоног",
    d365: "Бүгд",
    onlyFail: "Зөвхөн алдаа",
    clear: "Түүх цэвэрлэх",
    export: "CSV татах",
    more: "Илүү харах",
    failed: "амжилтгүй",
    signIn: "AI түүхээ харахын тулд нэвтэрнэ үү.",
    roles: {
      translate: "Орчуулга",
      mine: "Видео олборлолт",
      chat: "Чат",
      core_brain: "Core Brain",
      face_clone: "Видео дуудлагын хараа",
      voice_clone: "Дуу хуулбар",
      other: "Бусад",
    } as Record<string, string>,
  },
  ko: {
    title: "기록",
    sub: "계정에서 발생한 모든 AI 호출 — 용도, 사용량, 비용.",
    today: "오늘",
    month: "이번 달",
    all: "전체",
    tokens: "토큰",
    calls: "호출",
    spent: "AI 청구 금액",
    free: "무료 키 사용",
    byJob: "사용처",
    byVideo: "영상별",
    everyCall: "모든 호출",
    leaks: "토큰이 새는 곳",
    noLeaks: "낭비가 발견되지 않았습니다. ",
    empty: "아직 기록된 AI 호출이 없습니다. 번역하거나 영상을 채굴해 보세요.",
    range: "최근",
    d7: "7일",
    d30: "30일",
    d365: "전체",
    onlyFail: "실패만",
    clear: "기록 지우기",
    export: "CSV 내보내기",
    more: "더 보기",
    failed: "실패",
    signIn: "AI 기록을 보려면 로그인하세요.",
    roles: {
      translate: "번역",
      mine: "영상 채굴",
      chat: "채팅",
      core_brain: "코어 브레인",
      face_clone: "영상 통화 보기",
      voice_clone: "음성 클론",
      other: "기타",
    } as Record<string, string>,
  },
} as const;

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

const money = (n: number): string => (n >= 0.01 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toFixed(4)}` : "$0.00");

export function TokenHistory({ lang }: { lang: Lang }) {
  const t = pickCopy(copy, lang);
  const load = useServerFn(getUsageHistory);
  const wipe = useServerFn(clearUsageHistory);
  const [days, setDays] = useState(30);
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [data, setData] = useState<UsageHistory | null>(null);
  const [busy, setBusy] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [shown, setShown] = useState(25);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const next = await load({ data: { days, onlyFailures, limit: 200 } });
      setData(next);
      setBlocked(false);
    } catch {
      setBlocked(true);
    } finally {
      setBusy(false);
    }
  }, [load, days, onlyFailures]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const roleName = useCallback((role: string) => t.roles[role] ?? role, [t]);

  const csv = useMemo(() => {
    if (!data) return "";
    const head = "time,job,for,ai,key,in_tokens,out_tokens,characters,cost_usd,status";
    const lines = data.rows.map((r) =>
      [
        new Date(r.at).toISOString(),
        roleName(r.role),
        (r.subjectLabel || "").replace(/[",\n]/g, " "),
        r.provider,
        r.keyTail ?? "",
        r.inputTokens,
        r.outputTokens,
        r.chars,
        r.cost,
        r.status,
      ].join(","),
    );
    return [head, ...lines].join("\n");
  }, [data, roleName]);

  const download = () => {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evermind-ai-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (blocked) {
    return <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">{t.signIn}</div>;
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">{t.title}</h3>
            <p className="text-xs text-muted-foreground">{t.sub}</p>
          </div>
        </div>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {/* range + filters */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {[
          { v: 7, label: t.d7 },
          { v: 30, label: t.d30 },
          { v: 0, label: t.d365 },
        ].map((option) => (
          <button
            key={option.v}
            type="button"
            onClick={() => setDays(option.v)}
            className={`rounded-full border px-3 py-1 ${days === option.v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOnlyFailures((v) => !v)}
          className={`rounded-full border px-3 py-1 ${onlyFailures ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground"}`}
        >
          {t.onlyFail}
        </button>
        <button type="button" onClick={download} className="ml-auto flex items-center gap-1 rounded-full border border-border px-3 py-1 text-muted-foreground">
          <Download className="h-3 w-3" /> {t.export}
        </button>
        <button
          type="button"
          onClick={async () => {
            await wipe({ data: undefined });
            await refresh();
          }}
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-muted-foreground"
        >
          <RotateCcw className="h-3 w-3" /> {t.clear}
        </button>
      </div>

      {!data || data.total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <>
          {/* top line */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: t.today, value: `${fmt(data.today.tokens)} ${t.tokens}`, note: `${data.today.calls} ${t.calls}` },
              { label: t.month, value: `${fmt(data.month.tokens)} ${t.tokens}`, note: money(data.month.cost) },
              { label: t.all, value: `${fmt(data.all.tokens)} ${t.tokens}`, note: `${data.all.calls} ${t.calls}` },
              {
                label: t.spent,
                value: money(data.all.cost),
                note: `${data.all.calls - data.rows.filter((r) => !r.free).length} ${t.free}`,
              },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-border bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
                <p className="mt-1 text-lg font-semibold">{card.value}</p>
                <p className="text-[11px] text-muted-foreground">{card.note}</p>
              </div>
            ))}
          </div>

          {/* by job */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.byJob}</h4>
          <ul className="mt-2 space-y-1">
            {data.byRole.map((bucket) => (
              <li key={bucket.key} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                <span>
                  {roleName(bucket.key)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {bucket.calls} {t.calls}
                    {bucket.failures ? ` · ${bucket.failures} ${t.failed}` : ""}
                  </span>
                </span>
                <span className="text-right text-xs">
                  <span className="font-medium">
                    {bucket.chars > 0 && bucket.tokens === 0 ? `${fmt(bucket.chars)} chars` : `${fmt(bucket.tokens)} ${t.tokens}`}
                  </span>
                  <span className="ml-2 text-muted-foreground">{money(bucket.cost)}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* per video */}
          {data.byVideo.length > 0 && (
            <>
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.byVideo}</h4>
              <ul className="mt-2 space-y-1">
                {data.byVideo.slice(0, 12).map((v) => (
                  <li key={v.key} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <span className="truncate">{v.label}</span>
                    <span className="shrink-0 text-xs">
                      <span className="font-medium">{fmt(v.tokens)}</span>
                      <span className="ml-2 text-muted-foreground">{money(v.cost)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* leaks */}
          <h4 className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> {t.leaks}
          </h4>
          {data.leaks.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t.noLeaks}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {data.leaks.map((leak, i) => (
                <li key={`${leak.kind}-${i}`} className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                  <p className="font-medium">{leak.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {leak.detail} · {fmt(leak.tokens)} {t.tokens} · {money(leak.cost)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {/* every call */}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.everyCall}</h4>
          <ul className="mt-2 divide-y divide-border/60">
            {data.rows.slice(0, shown).map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {roleName(row.role)}
                    {row.subjectLabel ? ` · ${row.subjectLabel}` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(row.at).toLocaleString()} · {rateOf(row.provider).label}
                    {row.keyTail ? ` ····${row.keyTail}` : ""}
                    {row.status !== "ok" ? ` · ${t.failed}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block">
                    {row.chars > 0 ? `${fmt(row.chars)} chars` : `${fmt(row.inputTokens)} / ${fmt(row.outputTokens)}`}
                  </span>
                  <span className="text-muted-foreground">{money(row.cost)}</span>
                </span>
              </li>
            ))}
          </ul>
          {data.rows.length > shown && (
            <button
              type="button"
              onClick={() => setShown((n) => n + 50)}
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs text-muted-foreground"
            >
              <ChevronDown className="h-3 w-3" /> {t.more}
            </button>
          )}
        </>
      )}
    </div>
  );
}
