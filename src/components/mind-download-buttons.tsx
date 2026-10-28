/**
 * 1-Click "Download Complete Mind (.JSON)" (+ optional PC Bot Runner .PY)
 * gated by the shared Mind entitlement check. Own/free Minds download
 * directly; paid Minds of other creators show a lock.
 */
import { Copy, Download, Lock } from "lucide-react";
import { toast } from "sonner";
import { copyMindAsMasterPrompt, downloadCompleteMindJson, downloadOllamaModelfile, downloadStandaloneMindHtmlApp } from "@/lib/mind-json";
import { downloadBedrockAddon } from "@/lib/bedrock-addon";
import type { GamingExtraction } from "@/lib/gemini";
import { useAuth } from "@/hooks/use-auth";
import { useMindEntitlement } from "@/lib/purchases";
import { evermindRunnerScript } from "@/lib/robot-deploy";
import type { Lang } from "@/lib/i18n";

const COPY = {
  en: { instant: "⚡ Instant Use (No Coding)", pro: "🛠️ Pro / Bot / Hardware Files", html: "Download Standalone App (.HTML)", prompt: "Copy for ChatGPT / Claude", copied: "Copied — paste it into ChatGPT or Claude", json: "Download Complete Brain (.JSON)", py: "Download Bot / Robot Runner (.PY)", ollama: "Download Ollama Modelfile", addon: "Download Minecraft Add-on (.mcaddon)", locked: "Buy to Download" },
  mn: { instant: "⚡ Шууд ашиглах (код хэрэггүй)", pro: "🛠️ Мэргэжлийн / Бот / Төхөөрөмжийн файл", html: "Бие даасан апп татах (.HTML)", prompt: "ChatGPT / Claude-д хуулах", copied: "Хуулагдлаа — ChatGPT эсвэл Claude-д буулгана уу", json: "Бүтэн Brain татах (.JSON)", py: "Бот / Робот ажиллуулагч татах (.PY)", ollama: "Ollama Modelfile татах", addon: "Minecraft нэмэлт татах (.mcaddon)", locked: "Худалдаж авч татах" },
  ko: { instant: "⚡ 바로 사용 (코딩 불필요)", pro: "🛠️ 프로 / 봇 / 하드웨어 파일", html: "독립 실행 앱 다운로드 (.HTML)", prompt: "ChatGPT / Claude용 복사", copied: "복사됨 — ChatGPT나 Claude에 붙여넣으세요", json: "전체 브레인 다운로드 (.JSON)", py: "봇 / 로봇 러너 다운로드 (.PY)", ollama: "Ollama Modelfile 다운로드", addon: "마인크래프트 애드온 다운로드 (.mcaddon)", locked: "구매 후 다운로드" },
} as const;

function save(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** First gaming extraction with decisions found anywhere in the bundle. */
export function findGaming(data: unknown, depth = 0): GamingExtraction | null {
  if (!data || typeof data !== "object" || depth > 6) return null;
  const o = data as Record<string, unknown>;
  const g = o["gaming"] as Record<string, unknown> | undefined;
  if (g && Array.isArray(g["decisions"]) && g["decisions"].length) return g as unknown as GamingExtraction;
  for (const v of Array.isArray(data) ? data : Object.values(o)) {
    const hit = findGaming(v, depth + 1);
    if (hit) return hit;
  }
  return null;
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
  const input = { name: name || "Mind", data, allowed: ent.allowed };
  const gaming = findGaming(data);
  const head = "w-full text-[10px] font-semibold uppercase tracking-wide text-muted-foreground";
  return (
    <div className="flex flex-col gap-1.5">
      <p className={head}>{t.instant}</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn} onClick={() => downloadStandaloneMindHtmlApp(input)}>
          <Download className="h-3.5 w-3.5" /> {t.html}
        </button>
        <button type="button" className={btn} onClick={() => void copyMindAsMasterPrompt(input).then((ok) => ok && toast.success(t.copied), () => toast.error("Clipboard blocked"))}>
          <Copy className="h-3.5 w-3.5" /> {t.prompt}
        </button>
      </div>
      <p className={head}>{t.pro}</p>
      <div className="flex flex-wrap gap-1">
        <button type="button" className={btn} onClick={() => downloadCompleteMindJson({ ...input, name: base })}>
          <Download className="h-3.5 w-3.5" /> {t.json}
        </button>
        {runner && (
          <button type="button" className={btn} onClick={() => save("evermind_runner.py", evermindRunnerScript(window.location.origin, token), "text/x-python")}>
            <Download className="h-3.5 w-3.5" /> {t.py}
          </button>
        )}
        <button type="button" className={btn} onClick={() => downloadOllamaModelfile(input)}>
          <Download className="h-3.5 w-3.5" /> {t.ollama}
        </button>
        {gaming && (
          <button type="button" className={btn} onClick={() => downloadBedrockAddon(name || "Mind", gaming)}>
            <Download className="h-3.5 w-3.5" /> {t.addon}
          </button>
        )}
      </div>
    </div>
  );
}
