import { MindDownloadButtons } from "@/components/mind-download-buttons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Loader2, Mic, Square, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-fetch";
import type { GamingExtraction } from "@/lib/gemini";
import { buildTacticalPlaybook } from "@/lib/game-bot";
import { pickCopy, type Lang } from "@/lib/i18n";

const C = {
  trigger: { en: "Coach me", mn: "Надад дасгалжуулах", ko: "코칭 받기" },
  title: { en: "Game Coach", mn: "Тоглоомын дасгалжуулагч", ko: "게임 코치" },
  desc: {
    en: "The Coach watches your screen and hears you, then teaches in this Mind's own style. It never plays — that is the Teammate's job.",
    mn: "Дасгалжуулагч таны дэлгэцийг харж, дууг сонсоод энэ Оюуны хэв маягаар заана. Тоглохгүй — тоглох нь Хамтрагчийн ажил.",
    ko: "코치는 화면을 보고 목소리를 들은 뒤 이 마인드의 스타일로 가르칩니다. 직접 플레이하지는 않습니다.",
  },
  start: { en: "Live Screen-Share Coach", mn: "Шууд дэлгэц хуваалцах дасгалжуулагч", ko: "라이브 화면 공유 코치" },
  stop: { en: "Stop coaching", mn: "Зогсоох", ko: "코칭 중지" },
  watching: { en: "Watching… advice lands every few seconds.", mn: "Харж байна… зөвлөгөө хэд хэдэн секунд тутам ирнэ.", ko: "관전 중… 몇 초마다 조언이 옵니다." },
  micOn: { en: "Mic on — the coach hears you", mn: "Мик асаалттай — дасгалжуулагч таныг сонсож байна", ko: "마이크 켜짐 — 코치가 듣고 있습니다" },
  micOff: { en: "Mic off", mn: "Мик унтарсан", ko: "마이크 꺼짐" },
  empty: {
    en: "Share your game window and the coach starts teaching from what it sees.",
    mn: "Тоглоомын цонхоо хуваалцаарай — дасгалжуулагч харснаараа зааж эхэлнэ.",
    ko: "게임 창을 공유하면 코치가 보이는 대로 가르치기 시작합니다.",
  },
  noBrain: {
    en: "This Mind has no mined gameplay yet — mine a gameplay video first.",
    mn: "Энэ Оюунд тоглолтын өгөгдөл алга — эхлээд тоглолтын видео олборлоорой.",
    ko: "아직 마이닝된 게임플레이가 없습니다 — 먼저 게임 영상을 마이닝하세요.",
  },
} as const;

type Urgency = "calm" | "warn" | "critical";
type Advice = { at: number; text: string; urgency?: Urgency; situation?: string; action?: string };
const URGENCY_CLASS: Record<Urgency, string> = {
  calm: "border-border",
  warn: "border-primary",
  critical: "border-destructive",
};

/**
 * Screen-watching coach. Frames are JPEG snapshots sent to /api/mind-coach,
 * analysed in memory and never stored. Mic input is transcribed locally with
 * the browser speech recognizer when available.
 */
export function GameCoach({
  lang,
  mindName,
  brain,
}: {
  lang: Lang;
  mindName: string;
  brain: GamingExtraction;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advice, setAdvice] = useState<Advice[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heardRef = useRef("");
  const recRef = useRef<{ stop: () => void } | null>(null);

  const playbook = useMemo(() => buildTacticalPlaybook(brain), [brain]);
  const hasBrain =
    brain.skills.length > 0 || brain.tactics.length > 0 || brain.decisions.length > 0;

  const genRef = useRef(0);
  const stop = useCallback(() => {
    genRef.current += 1;
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = null;
    recRef.current?.stop();
    recRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setRunning(false);
    setMicOn(false);
  }, []);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (!open) stop();
  }, [open, stop]);

  const snapshot = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || !streamRef.current) return;
    const gen = genRef.current;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.6);
    const heard = heardRef.current;
    heardRef.current = "";
    setBusy(true);
    try {
      const res = await apiFetch("/api/mind-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: mindName, lang, image, heard, brain, playbook }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        advice?: string;
        error?: string;
        callout?: string;
        urgency?: Urgency;
        detected_situation?: string;
        recommended_action?: string;
      };
      if (gen !== genRef.current) return;
      if (!res.ok) {
        setError(data.error ?? `Coaching failed (${res.status}).`);
        if (res.status === 401 || res.status === 402 || res.status === 403) stop();
        return;
      }
      const text = data.callout || data.advice;
      if (text) {
        const item: Advice = {
          at: Date.now(),
          text,
          ...(data.urgency ? { urgency: data.urgency } : {}),
          ...(data.detected_situation ? { situation: data.detected_situation } : {}),
          ...(data.recommended_action ? { action: data.recommended_action } : {}),
        };
        setAdvice((prev) => [item, ...prev].slice(0, 30));
      }
      setError(null);
    } catch {
      setError("Could not reach the coach.");
    } finally {
      setBusy(false);
    }
  }, [brain, lang, mindName, playbook, stop]);

  const start = async () => {
    setError(null);
    setAdvice([]);
    const gen = genRef.current;
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      if (gen !== genRef.current) {
        display.getTracks().forEach((tr) => tr.stop());
        return;
      }
      streamRef.current = display;
      const video = videoRef.current;
      if (video) {
        video.srcObject = display;
        await video.play().catch(() => undefined);
      }
      display.getVideoTracks()[0]?.addEventListener("ended", stop);

      // Mic: local speech-to-text so the coach can react to what you said.
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!streamRef.current) {
          mic.getTracks().forEach((tr) => tr.stop());
          return;
        }
        mic.getTracks().forEach((tr) => streamRef.current?.addTrack(tr));
        const Rec = (window as unknown as Record<string, unknown>)["SpeechRecognition"]
          ?? (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"];
        if (typeof Rec === "function") {
          const rec = new (Rec as new () => {
            continuous: boolean;
            interimResults: boolean;
            onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
            start: () => void;
            stop: () => void;
          })();
          rec.continuous = true;
          rec.interimResults = false;
          rec.onresult = (e) => {
            const last = e.results[e.results.length - 1]?.[0]?.transcript;
            if (last) heardRef.current = `${heardRef.current} ${last}`.trim().slice(-500);
          };
          rec.start();
          recRef.current = rec;
        }
        setMicOn(true);
      } catch {
        setMicOn(false);
      }

      setRunning(true);
      void snapshot();
      timerRef.current = setInterval(() => void snapshot(), 5000);
    } catch {
      setError("Screen share was cancelled or blocked.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!hasBrain} title={hasBrain ? undefined : t("noBrain")}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")} — {mindName}</DialogTitle>
          <DialogDescription>{hasBrain ? t("desc") : t("noBrain")}</DialogDescription>
          <MindDownloadButtons lang={lang} name={mindName} data={{ mindName, brain, playbook }} runner />
        </DialogHeader>

        <video ref={videoRef} muted playsInline className="aspect-video w-full rounded-lg border border-border bg-black" />

        <div className="flex items-center gap-2">
          {running ? (
            <Button size="sm" variant="destructive" onClick={stop}>
              <Square className="mr-1.5 h-3.5 w-3.5" /> {t("stop")}
            </Button>
          ) : (
            <Button size="sm" onClick={() => void start()} disabled={!hasBrain || busy}>
              <Video className="mr-1.5 h-3.5 w-3.5" /> {t("start")}
            </Button>
          )}
          {running ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {t("watching")}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Mic className={`h-3 w-3 ${micOn ? "text-green-500" : ""}`} />
            {micOn ? t("micOn") : t("micOff")}
          </span>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {advice.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            advice.map((a) => (
              <div key={a.at} className={`rounded-lg border-2 bg-card p-3 text-sm text-foreground ${URGENCY_CLASS[a.urgency ?? "calm"]}`}>
                <p className={a.urgency === "critical" ? "font-bold" : "font-medium"}>{a.text}</p>
                {a.situation || a.action ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.situation}{a.situation && a.action ? " → " : ""}{a.action}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
