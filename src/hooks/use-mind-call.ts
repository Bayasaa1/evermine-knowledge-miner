import { useCallback, useEffect, useRef, useState } from "react";
import { inferEmotion, NEUTRAL_EMOTION, type AvatarEmotion } from "@/lib/emotion";
import { startDub, type DubHandle } from "@/lib/voice-dub";
import { apiFetch } from "@/lib/api-fetch";
import type { Lang } from "@/lib/i18n";
import { toast } from "sonner";
import { createCallLifecycle } from "@/lib/call-lifecycle";

const HEAR_ERR = {
  en: { mic: "Microphone access was blocked. Allow the microphone and try again.", fail: "Couldn't understand the recording. Check your Gemini key in API Manager, or type instead.", busy: "Too many voice turns this minute. Wait a moment and try again.", auth: "Sign in to use voice calls." },
  mn: { mic: "Микрофоны зөвшөөрөл хаалттай байна. Зөвшөөрөөд дахин оролдоно уу.", fail: "Бичлэгийг ойлгож чадсангүй. API Manager дахь Gemini түлхүүрээ шалгах эсвэл бичиж асуугаарай.", busy: "Нэг минутад хэт олон удаа ярилаа. Түр хүлээгээд дахин оролдоно уу.", auth: "Дуудлага ашиглахын тулд нэвтэрнэ үү." },
  ko: { mic: "마이크 권한이 차단되었습니다. 허용한 뒤 다시 시도하세요.", fail: "녹음을 이해하지 못했습니다. API Manager에서 Gemini 키를 확인하거나 입력해 주세요.", busy: "1분 동안 음성 요청이 너무 많습니다. 잠시 후 다시 시도하세요.", auth: "음성 통화를 사용하려면 로그인하세요." },
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Splits streamed text at natural speech breaks so the voice can start early. */
function takePhrase(buffer: string, flush: boolean): [string, string] {
  if (flush) return [buffer.trim(), ""];
  const match = /[.!?…。！？]\s|\n/.exec(buffer);
  if (match) {
    const cut = match.index + match[0].length;
    return [buffer.slice(0, cut).trim(), buffer.slice(cut)];
  }
  // Long clause without punctuation — break at a comma so we never stall.
  if (buffer.length > 140) {
    const comma = buffer.lastIndexOf(", ");
    if (comma > 60) return [buffer.slice(0, comma + 1).trim(), buffer.slice(comma + 2)];
  }
  return ["", buffer];
}

/**
 * One person on the other side: hearing, thinking, the cloned voice, the face
 * and (on video calls) the eyes, all driven from a single call loop so they
 * stay in sync instead of taking turns.
 */
export function useMindCall(
  mindId: string | null,
  lang: Lang,
  onTranscript: (text: string) => void,
  opts?: { voiceId?: string },
) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mouth, setMouth] = useState(0);
  const [emotion, setEmotion] = useState<AvatarEmotion>(NEUTRAL_EMOTION);
  const [sees, setSees] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const dubRef = useRef<DubHandle | null>(null);
  const queueRef = useRef<string[]>([]);
  const drainingRef = useRef(false);
  const camRef = useRef<{ stream: MediaStream; timer: number; video: HTMLVideoElement } | null>(null);
  const lifecycle = useRef(createCallLifecycle());
  const cameraLifecycle = useRef(createCallLifecycle());
  const requestsRef = useRef(new Set<AbortController>());
  const cameraRequestRef = useRef<AbortController | null>(null);
  const voiceId = opts?.voiceId;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const releasePendingRef = useRef(false);

  const stopCamera = useCallback(() => {
    cameraLifecycle.current.invalidate();
    cameraRequestRef.current?.abort();
    cameraRequestRef.current = null;
    if (!camRef.current) return;
    window.clearInterval(camRef.current.timer);
    camRef.current.stream.getTracks().forEach((t) => t.stop());
    camRef.current.video.srcObject = null;
    camRef.current = null;
    setSees("");
  }, []);

  const stop = useCallback(() => {
    lifecycle.current.invalidate();
    requestsRef.current.forEach((controller) => controller.abort());
    requestsRef.current.clear();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      if (recorder.state === "recording") recorder.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    dubRef.current?.stop();
    dubRef.current = null;
    queueRef.current = [];
    drainingRef.current = false;
    stopCamera();
    setListening(false);
    setSpeaking(false);
    setMouth(0);
  }, [stopCamera]);

  useEffect(() => {
    lifecycle.current.mount();
    cameraLifecycle.current.mount();
    return () => {
      lifecycle.current.unmount();
      cameraLifecycle.current.unmount();
      stop();
    };
  }, [stop]);

  /**
   * Starts recording the caller. Push-to-talk style.
   */
  const startListening = useCallback(async () => {
    if (listening) return;
    const token = lifecycle.current.begin();
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("Voice input is not supported by this browser.");
    }

    releasePendingRef.current = false;
    setListening(true);
    try {
      // Reuse the open microphone so recording starts the instant you press.
      let stream = streamRef.current;
      if (!stream || !stream.getAudioTracks().some((t) => t.readyState === "live")) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!lifecycle.current.accept(token, stream)) return;
        streamRef.current = stream;
      }

      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      const began = Date.now();

      // Push-to-talk: only your finger ends the recording (60s safety cap).
      const timer = window.setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 60000);
      timerRef.current = timer;

      rec.onstop = async () => {
        if (!lifecycle.current.current(token)) return;
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = null;
        recorderRef.current = null;

        if (Date.now() - began < 250 || chunks.length === 0) {
          setListening(false);
          return;
        }

        const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
        const b64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
          r.readAsDataURL(blob);
        });

        if (!lifecycle.current.current(token)) return;
        const controller = new AbortController();
        requestsRef.current.add(controller);
        try {
          const res = await apiFetch("/api/mind-hear", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: b64, mime: blob.type.split(";")[0], lang }),
          });
          const json = (await res.json().catch(() => ({}))) as { text?: string };
          if (!lifecycle.current.current(token)) return;
          const msgs = HEAR_ERR[lang] ?? HEAR_ERR.en;
          if (!res.ok) toast.error(res.status === 429 ? msgs.busy : res.status === 401 ? msgs.auth : msgs.fail);
          else if (json.text) onTranscript(json.text);
        } catch {
          if (lifecycle.current.current(token)) toast.error((HEAR_ERR[lang] ?? HEAR_ERR.en).fail);
        } finally {
          requestsRef.current.delete(controller);
          if (lifecycle.current.current(token)) setListening(false);
        }
      };

      rec.start(250);
      if (releasePendingRef.current && rec.state === "recording") rec.stop();
    } catch {
      if (!lifecycle.current.current(token)) return;
      setListening(false);
      toast.error((HEAR_ERR[lang] ?? HEAR_ERR.en).mic);
    }
  }, [lang, listening, onTranscript]);

  const stopListening = useCallback(() => {
    releasePendingRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const drain = useCallback(async () => {
    if (drainingRef.current || !mindId) return;
    drainingRef.current = true;
    const token = lifecycle.current.begin();
    setSpeaking(true);
    while (queueRef.current.length > 0 && lifecycle.current.current(token)) {
      const phrase = queueRef.current.shift();
      if (!phrase) break;
      const nextEmotion = inferEmotion(phrase);
      setEmotion(nextEmotion);
      const dub = startDub({
        mindId,
        text: phrase,
        lang,
        emotion: nextEmotion,
        ...(voiceId ? { voiceId } : {}),
        onViseme: setMouth,
      });
      dubRef.current = dub;
      await dub.done;
      if (!lifecycle.current.current(token)) return;
      if (dubRef.current === dub) dubRef.current = null;
    }
    drainingRef.current = false;
    setSpeaking(false);
    setMouth(0);
  }, [lang, mindId, voiceId]);

  /** Speak a complete answer. */
  const speak = useCallback((text: string) => {
    if (!mindId || !text.trim()) return;
    queueRef.current.push(text.trim());
    void drain();
  }, [drain, mindId]);

  /**
   * Speak while the answer is still being written: each finished phrase is
   * queued immediately, so the reply starts within a breath instead of after
   * the whole answer is ready.
   */
  const speakStreaming = useCallback(() => {
    const token = lifecycle.current.begin();
    let buffer = "";
    return {
      push(delta: string) {
        if (!lifecycle.current.current(token)) return;
        buffer += delta;
        for (;;) {
          const [phrase, rest] = takePhrase(buffer, false);
          if (!phrase) break;
          buffer = rest;
          queueRef.current.push(phrase);
          void drain();
        }
      },
      end() {
        if (!lifecycle.current.current(token)) return;
        const tail = buffer.trim();
        buffer = "";
        if (tail) {
          queueRef.current.push(tail);
          void drain();
        }
      },
    };
  }, [drain]);

  /**
   * Video call eyes: a still is sent every few seconds and read in memory only.
   * Nothing from the camera is stored.
   */
  const startCamera = useCallback(async (video: HTMLVideoElement, mindName: string) => {
    if (camRef.current) return;
    cameraLifecycle.current.invalidate();
    const token = cameraLifecycle.current.begin();
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
    if (!cameraLifecycle.current.accept(token, stream)) return;
    video.srcObject = stream;
    // Register before play() awaits, so ending the call releases it immediately.
    camRef.current = { stream, timer: 0, video };
    await video.play().catch(() => {});
    if (!cameraLifecycle.current.current(token)) return;
    const canvas = document.createElement("canvas");
    const look = async () => {
      if (!cameraLifecycle.current.current(token) || !video.videoWidth || cameraRequestRef.current) return;
      const controller = new AbortController();
      cameraRequestRef.current = controller;
      canvas.width = 320;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.6);
      try {
        const res = await apiFetch("/api/mind-vision", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, name: mindName, lang }),
        });
        const data = (await res.json()) as { seen?: string };
        if (cameraLifecycle.current.current(token) && res.ok && data.seen) setSees(data.seen);
      } catch {
        /* a missed frame never interrupts the call */
      } finally {
        if (cameraRequestRef.current === controller) cameraRequestRef.current = null;
      }
    };
    const timer = window.setInterval(() => void look(), 6000);
    camRef.current = { stream, timer, video };
    void look();
  }, [lang]);

  return { 
    listening, 
    speaking, 
    mouth, 
    emotion, 
    sees, 
    listen: startListening, // Backwards compatibility if needed, but we'll use start/stop
    startListening,
    stopListening,
    speak, 
    speakStreaming, 
    startCamera, 
    stopCamera, 
    stop 
  };
}
