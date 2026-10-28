import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Camera, Copy, Download, Lock, MonitorDown, Play, Smartphone, Square, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { buildRobotPackage, deploymentUrl, evermindRunnerScript, quickStartCommand } from "@/lib/robot-deploy";
import { getDeployment } from "@/lib/robot-deploy.functions";
import { apiFetch } from "@/lib/api-fetch";
import { useAuth } from "@/hooks/use-auth";
import type { FeedItem } from "@/lib/feed";
import type { ChunkResult } from "@/lib/gemini";
import { MindSpecs } from "@/components/mind-specs";
import { copyMindAsMasterPrompt, downloadOllamaModelfile, downloadStandaloneMindHtmlApp } from "@/lib/mind-json";
import { downloadBedrockAddon } from "@/lib/bedrock-addon";
import { purchaseMind, useMindEntitlement } from "@/lib/purchases";
import { pickCopy, type Lang } from "@/lib/i18n";

const TOPIC = "/evermind/mind_action";

type Tab = "browser" | "installer" | "device";
type Decision = { speech?: string; action_primitive?: string; target_object?: string; confidence?: number };
type InstallPrompt = Event & { prompt: () => Promise<void> };

const copy = {
  en: {
    instant: "⚡ Instant Use (No Coding)", pro: "🛠️ Pro / Bot / Hardware Files", html: "Download Standalone App (.HTML)", prompt: "Copy for ChatGPT / Claude", ollama: "Download Ollama Modelfile", addon: "Download Minecraft Add-on (.mcaddon)", runnerPy: "Download Bot / Robot Runner (.PY)", brainJson: "Download Complete Brain (.JSON)",
    freeDl: "Free Download", unlocked: "Unlocked — Complete Edition", buyDl: "Buy to Download (.JSON / Bot)", checkoutSoon: "Checkout is not connected yet — paid downloads open once payments are on.",
    title: "Complete Edition — 1-Click Install & Run",
    tBrowser: "Run in browser", tInstaller: "PC / Robot installer", tDevice: "Install app",
    browserHint: "Starts your camera and lets the Mind see, speak and pick its next move right here.",
    start: "Start now", stop: "Stop", signIn: "Sign in to run live camera decisions.",
    waiting: "Watching…", camFail: "Camera is not available.",
    installerHint: "Download the runner, then paste one line into a terminal. No coding needed.",
    runner: "Download evermind_runner.py", command: "Copy run command", bundle: "Download full bundle (.json)",
    copied: "Copied", publishFirst: "Publish this Mind in Robot Deployment Studio to get its own link and token.",
    deviceHint: "Put Evermind on your home screen like an app.",
    install: "Install app", iosHint: "On iPhone: tap Share → Add to Home Screen.", installed: "Already installed or not offered by this browser.",
  },
  mn: {
    instant: "⚡ Шууд ашиглах (код хэрэггүй)", pro: "🛠️ Мэргэжлийн / Бот / Төхөөрөмжийн файл", html: "Бие даасан апп татах (.HTML)", prompt: "ChatGPT / Claude-д хуулах", ollama: "Ollama Modelfile татах", addon: "Minecraft нэмэлт татах (.mcaddon)", runnerPy: "Бот / Робот ажиллуулагч татах (.PY)", brainJson: "Бүтэн Brain татах (.JSON)",
    freeDl: "Үнэгүй татах", unlocked: "Нээгдсэн — Бүрэн хувилбар", buyDl: "Худалдаж аваад татах (.JSON / Бот)", checkoutSoon: "Төлбөрийн систем хараахан холбогдоогүй — холбогдмогц төлбөртэй татах нээгдэнэ.",
    title: "Бүрэн хувилбар — 1 товчоор суулгаж ажиллуулах",
    tBrowser: "Хөтөч дээр ажиллуулах", tInstaller: "Компьютер / Робот", tDevice: "Апп суулгах",
    browserHint: "Камераа асаагаад Оюун энд шууд харж, ярьж, дараагийн алхмаа сонгоно.",
    start: "Одоо эхлэх", stop: "Зогсоох", signIn: "Камерын шийдвэр гаргуулахын тулд нэвтэрнэ үү.",
    waiting: "Харж байна…", camFail: "Камер ашиглах боломжгүй байна.",
    installerHint: "Скриптийг татаад, нэг мөрийг терминалд буулгахад л болно. Код бичих шаардлагагүй.",
    runner: "evermind_runner.py татах", command: "Ажиллуулах командыг хуулах", bundle: "Бүтэн багц татах (.json)",
    copied: "Хуулагдлаа", publishFirst: "Өөрийн холбоос, токен авахын тулд Роботын студиэс энэ Оюуныг нийтэлнэ үү.",
    deviceHint: "Evermind-г утасныхаа нүүр дэлгэцэнд апп шиг байрлуулах.",
    install: "Апп суулгах", iosHint: "iPhone дээр: Share → Add to Home Screen.", installed: "Аль хэдийн суусан эсвэл энэ хөтөч дэмжихгүй.",
  },
  ko: {
    instant: "⚡ 바로 사용 (코딩 불필요)", pro: "🛠️ 프로 / 봇 / 하드웨어 파일", html: "독립 실행 앱 다운로드 (.HTML)", prompt: "ChatGPT / Claude용 복사", ollama: "Ollama Modelfile 다운로드", addon: "마인크래프트 애드온 다운로드 (.mcaddon)", runnerPy: "봇 / 로봇 러너 다운로드 (.PY)", brainJson: "전체 브레인 다운로드 (.JSON)",
    freeDl: "무료 다운로드", unlocked: "잠금 해제 — 컴플리트 에디션", buyDl: "구매 후 다운로드 (.JSON / 봇)", checkoutSoon: "결제가 아직 연결되지 않았습니다 — 연결되면 유료 다운로드가 열립니다.",
    title: "컴플리트 에디션 — 원클릭 설치 및 실행",
    tBrowser: "브라우저에서 실행", tInstaller: "PC / 로봇 설치", tDevice: "앱 설치",
    browserHint: "카메라를 켜면 마인드가 바로 보고, 말하고, 다음 동작을 고릅니다.",
    start: "지금 시작", stop: "중지", signIn: "라이브 카메라 판단을 쓰려면 로그인하세요.",
    waiting: "보는 중…", camFail: "카메라를 사용할 수 없습니다.",
    installerHint: "러너를 내려받고 터미널에 한 줄만 붙여넣으세요. 코딩이 필요 없습니다.",
    runner: "evermind_runner.py 다운로드", command: "실행 명령 복사", bundle: "전체 번들 다운로드 (.json)",
    copied: "복사됨", publishFirst: "로봇 배포 스튜디오에서 이 마인드를 게시하면 전용 링크와 토큰이 생깁니다.",
    deviceHint: "Evermind를 홈 화면에 앱처럼 추가하세요.",
    install: "앱 설치", iosHint: "iPhone: 공유 → 홈 화면에 추가.", installed: "이미 설치되었거나 이 브라우저에서 지원하지 않습니다.",
  },
} as const;

/** Complete Edition launcher for any Mind (feed card or Saved Minds). */
export function RobotSyncModal({
  open,
  onClose,
  item,
  lang = "en",
  chunks,
  ownerId,
}: {
  open: boolean;
  onClose: () => void;
  item: FeedItem | null;
  lang?: Lang;
  /** Mined material, when the caller has it, so the bundle is never empty. */
  chunks?: ChunkResult[];
  /** Account that owns this Mind; owners always download free. */
  ownerId?: string | null;
}) {
  const t = pickCopy(copy, lang);
  const { isAuthenticated, user } = useAuth();
  const ent = useMindEntitlement({
    mindId: item ? (item.mindId ?? item.id) : null,
    ownerId: ownerId ?? null,
    userId: user?.id ?? null,
    price: item?.price ?? 0,
  });
  const [buyingDl, setBuyingDl] = useState(false);
  const buyToDownload = async () => {
    if (!item) return;
    if (!user) return void toast.error(t.signIn);
    setBuyingDl(true);
    const { error } = await purchaseMind({ mindId: item.mindId ?? item.id, category: item.category });
    setBuyingDl(false);
    if (error) return void toast.error(error.includes("Checkout is not connected") ? t.checkoutSoon : error);
    ent.refresh();
  };
  const fetchDeployment = useServerFn(getDeployment);
  const [tab, setTab] = useState<Tab>("browser");
  const [token, setToken] = useState<string>("");
  const [qr, setQr] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = token ? deploymentUrl(origin, token) : "";

  useEffect(() => {
    setToken(item?.deployToken ?? "");
    if (!open || !item || item.deployToken || !isAuthenticated) return;
    let alive = true;
    void fetchDeployment({ data: { mindId: item.mindId ?? item.id } })
      .then((d) => { if (alive && d?.token) setToken(d.token); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [open, item, isAuthenticated, fetchDeployment]);

  useEffect(() => {
    if (!url) return void setQr("");
    void import("qrcode").then((m) => (m.default ?? m).toDataURL(url, { margin: 1, width: 220, color: { dark: "#111111", light: "#ffffff" } }))
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  const pkg = useMemo(
    () => item ? buildRobotPackage({ mindId: item.mindId ?? item.id, title: item.title, topic: TOPIC, chunks: chunks ?? [] }) : null,
    [item, chunks],
  );

  // ---- Tab 1: live camera + voice -----------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const runRef = useRef(0);
  const [running, setRunning] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);

  const stopLive = () => {
    runRef.current += 1;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setRunning(false);
  };

  useEffect(() => () => stopLive(), []);
  useEffect(() => { if (!open) stopLive(); }, [open]);

  const tick = async (run: number) => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || run !== runRef.current) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 640 / v.videoWidth);
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.7);
    try {
      const res = await apiFetch("/api/mind-vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "embodied", image, name: item?.creator || item?.title, lang }),
      });
      if (run !== runRef.current) return;
      const body = (await res.json()) as Decision & { action?: Decision; embodied?: Decision; error?: string };
if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const d = body.action ?? body.embodied ?? body;
      setDecision(d);
      if (d.speech && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(d.speech));
      }
    } catch (e) {
      if (run === runRef.current) toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const startLive = async () => {
    if (!isAuthenticated) return void toast.error(t.signIn);
    const run = ++runRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (run !== runRef.current) return stream.getTracks().forEach((tr) => tr.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setRunning(true);
      setDecision(null);
      window.setTimeout(() => void tick(run), 800);
      timerRef.current = window.setInterval(() => void tick(run), 5000);
    } catch {
      toast.error(t.camFail);
    }
  };

  // ---- Tab 3: PWA install --------------------------------------------------
  const [installEvt, setInstallEvt] = useState<InstallPrompt | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as InstallPrompt); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!open || !item || !pkg) return null;

  const download = (name: string, body: string, type: string) => {
    const blob = new Blob([body], { type });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    URL.revokeObjectURL(href);
  };
  const copyText = (s: string) => { void navigator.clipboard.writeText(s); toast.success(t.copied); };
  const command = quickStartCommand(token || "<TOKEN>");
  const btn = "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary";
  const tabs: { id: Tab; label: string; icon: typeof Play }[] = [
    { id: "browser", label: t.tBrowser, icon: Play },
    { id: "installer", label: t.tInstaller, icon: MonitorDown },
    { id: "device", label: t.tDevice, icon: Smartphone },
  ];

  return (
    <div className="dark fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl">
        <div className="mb-1 flex items-center gap-3">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 text-sm font-semibold">{t.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 truncate text-xs text-muted-foreground">{item.title}</p>

        <div role="tablist" className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] font-medium ${tab === id ? "bg-card text-primary" : "text-muted-foreground"}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "browser" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.browserHint}</p>
            <video ref={videoRef} muted playsInline className={`w-full rounded-lg bg-muted ${running ? "" : "hidden"}`} />
            {running ? (
              <>
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  {decision ? (
                    <>
                      <p className="text-foreground">{decision.speech}</p>
                      <p className="mt-1 font-mono text-primary">
                        {decision.action_primitive} {decision.target_object ? `→ ${decision.target_object}` : ""}
                        {typeof decision.confidence === "number" ? ` · ${Math.round(decision.confidence * 100)}%` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">{t.waiting}</p>
                  )}
                </div>
                <button type="button" onClick={stopLive} className={btn}>
                  <Square className="h-3.5 w-3.5" /> {t.stop}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void startLive()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                <Camera className="h-4 w-4" /> {t.start}
              </button>
            )}
          </div>
        )}

        {tab === "installer" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.installerHint}</p>
            {url ? (
              <div className="mx-auto w-fit rounded-xl border border-border bg-white p-3">
                {qr ? <img src={qr} alt="Robot deployment QR code" className="h-36 w-36" /> : null}
              </div>
            ) : (
              <p className="rounded-lg border border-border bg-muted/40 p-2 text-[11px] text-muted-foreground">{t.publishFirst}</p>
            )}
            <code className="block truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[11px] text-primary">{command}</code>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ent.allowed ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>
              {ent.allowed ? (ent.access === "purchased" ? t.unlocked : t.freeDl) : <><Lock className="h-3 w-3" /> {ent.price > 0 ? `${ent.price} ${ent.currency}` : ""}</>}
            </span>
            {!ent.allowed ? (
              <button type="button" disabled={buyingDl} onClick={() => void buyToDownload()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                <Lock className="h-4 w-4" /> {t.buyDl}
              </button>
            ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t.instant}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadStandaloneMindHtmlApp({ name: item.title, data: pkg, allowed: ent.allowed })} className={btn}>
                  <Download className="h-3.5 w-3.5" /> {t.html}
                </button>
                <button type="button" onClick={() => void copyMindAsMasterPrompt({ name: item.title, data: pkg, allowed: ent.allowed }).then((ok) => ok && toast.success(t.copied))} className={btn}>
                  <Copy className="h-3.5 w-3.5" /> {t.prompt}
                </button>
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t.pro}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    download(
                      "evermind-complete-edition.json",
                      JSON.stringify({ ...pkg, source: url || null, quick_start: command }, null, 2),
                      "application/json",
                    )
                  }
                  className={btn}
                >
                  <Download className="h-3.5 w-3.5" /> {t.brainJson}
                </button>
                <button type="button" onClick={() => download("evermind_runner.py", evermindRunnerScript(origin, token), "text/x-python")} className={btn}>
                  <Download className="h-3.5 w-3.5" /> {t.runnerPy}
                </button>
                <button type="button" onClick={() => copyText(command)} className={btn}>
                  <Copy className="h-3.5 w-3.5" /> {t.command}
                </button>
                <button type="button" onClick={() => downloadOllamaModelfile({ name: item.title, data: pkg, allowed: ent.allowed })} className={btn}>
                  <Download className="h-3.5 w-3.5" /> {t.ollama}
                </button>
                {pkg.gaming && Array.isArray(pkg.gaming.decisions) && pkg.gaming.decisions.length > 0 && (
                  <button type="button" onClick={() => downloadBedrockAddon(item.title, pkg.gaming!)} className={btn}>
                    <Download className="h-3.5 w-3.5" /> {t.addon}
                  </button>
                )}
              </div>
            </div>
            )}
          </div>
        )}

        {tab === "device" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.deviceHint}</p>
            <button
              type="button"
              onClick={async () => {
                if (!installEvt) return void toast.message(t.installed);
                await installEvt.prompt();
                setInstallEvt(null);
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              <Smartphone className="h-4 w-4" /> {t.install}
            </button>
            <p className="text-[11px] text-muted-foreground">{t.iosHint}</p>
          </div>
        )}

        <div className="mt-4">
          <MindSpecs mindId={item.mindId ?? item.id} lang={lang} />
        </div>
      </div>
    </div>
  );
}
