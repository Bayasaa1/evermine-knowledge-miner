import { useCallback, useEffect, useRef, useState } from "react";
import { inferEmotion, NEUTRAL_EMOTION, type AvatarEmotion } from "@/lib/emotion";
import { startDub, type DubHandle } from "@/lib/voice-dub";
import { apiFetch } from "@/lib/api-fetch";
import type { Lang } from "@/lib/i18n";

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

type RecognitionCtor = new () => Recognition;

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
  const camRef = useRef<{ stream: MediaStream; timer: number } | null>(null);
  const voiceId = opts?.voiceId;

  const stopCamera = useCallback(() => {
    if (!camRef.current) return;
    window.clearInterval(camRef.current.timer);
    camRef.current.stream.getTracks().forEach((t) => t.stop());
    camRef.current = null;
    setSees("");
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    dubRef.current?.stop();
    dubRef.current = null;
    queueRef.current = [];
    drainingRef.current = false;
    stopCamera();
    setListening(false);
    setSpeaking(false);
    setMouth(0);
  }, [stopCamera]);

  useEffect(() => stop, [stop]);

  const listen = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
    if (!Ctor) throw new Error("Voice input is not supported by this browser.");
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (text) onTranscript(text);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, [lang, listening, onTranscript]);

  const drain = useCallback(async () => {
    if (drainingRef.current || !mindId) return;
    drainingRef.current = true;
    setSpeaking(true);
    while (queueRef.current.length > 0) {
      const phrase = queueRef.current.shift()!;
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
    let buffer = "";
    return {
      push(delta: string) {
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
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: false });
    video.srcObject = stream;
    await video.play().catch(() => {});
    const canvas = document.createElement("canvas");
    const look = async () => {
      if (!video.videoWidth) return;
      canvas.width = 320;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320);
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg", 0.6);
      try {
        const { credentialPayload } = await import("@/lib/api-keys");
        const res = await apiFetch("/api/mind-vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, name: mindName, lang, ...(await credentialPayload()) }),
        });
        const data = (await res.json()) as { seen?: string };
        if (res.ok && data.seen) setSees(data.seen);
      } catch {
        /* a missed frame never interrupts the call */
      }
    };
    const timer = window.setInterval(() => void look(), 6000);
    camRef.current = { stream, timer };
    void look();
  }, [lang]);

  return { listening, speaking, mouth, emotion, sees, listen, speak, speakStreaming, startCamera, stopCamera, stop };
}
