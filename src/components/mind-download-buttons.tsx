/**
 * 1-Click "Download Complete Mind (.JSON)" (+ optional PC Bot Runner .PY)
 * gated by the shared Mind entitlement check. Own/free Minds download
 * directly; paid Minds of other creators show a lock.
 */
import { Download, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMindEntitlement } from "@/lib/purchases";
import { evermindRunnerScript } from "@/lib/robot-deploy";
import type { Lang } from "@/lib/i18n";

const COPY = {
  en: { json: "Download Complete Mind (.JSON)", py: "Download PC Bot Runner (.PY)", locked: "Buy to Download" },
  mn: { json: "Бүтэн Mind татах (.JSON)", py: "PC Бот ажиллуулагч татах (.PY)", locked: "Худалдаж авч татах" },
  ko: { json: "전체 마인드 다운로드 (.JSON)", py: "PC 봇 러너 다운로드 (.PY)", locked: "구매 후 다운로드" },
} as const;

function save(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MindDownloadButtons({
  lang,
  name,
  data,
  runner = false,
  token = "",
  mindId = null,
  ownerId = null,
  price = 0,
}: {
  lang: Lang | string;
  name: string;
  data: unknown;
  runner?: boolean;
  token?: string;
  mindId?: string | null;
  ownerId?: string | null;
  price?: number | null;
}) {
  const t = COPY[(lang in COPY ? lang : "en") as keyof typeof COPY];
  const { user } = useAuth();
  const ent = useMindEntitlement({ mindId, ownerId, userId: user?.id ?? null, price });
  const base = (name || "mind").replace(/[^\w-]+/g, "_").slice(0, 60);
  const btn = "inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:border-primary disabled:opacity-50";
  if (!ent.allowed)
    return (
      <span className={btn}>
        <Lock className="h-3.5 w-3.5" /> {t.locked}
      </span>
    );
  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" className={btn} onClick={() => save(`${base}.evermind.json`, JSON.stringify(data, null, 2), "application/json")}>
        <Download className="h-3.5 w-3.5" /> {t.json}
      </button>
      {runner && (
        <button type="button" className={btn} onClick={() => save("evermind_runner.py", evermindRunnerScript(window.location.origin, token), "text/x-python")}>
          <Download className="h-3.5 w-3.5" /> {t.py}
        </button>
      )}
    </div>
  );
}
