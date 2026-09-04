import { useCallback, useEffect, useRef, useState } from "react";
import { inferEmotion, NEUTRAL_EMOTION, type AvatarEmotion } from "@/lib/emotion";
import { startDub, type DubHandle } from "@/lib/voice-dub";
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

export function useMindCall(mindId: string | null, lang: Lang, onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mouth, setMouth] = useState(0);
  const [emotion, setEmotion] = useState<AvatarEmotion>(NEUTRAL_EMOTION);
  const recognitionRef = useRef<Recognition | null>(null);
  const dubRef = useRef<DubHandle | null>(null);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    dubRef.current?.stop();
    dubRef.current = null;
    setListening(false);
    setSpeaking(false);
    setMouth(0);
  }, []);

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

  const speak = useCallback((text: string) => {
    if (!mindId || !text) return;
    dubRef.current?.stop();
    const nextEmotion = inferEmotion(text);
    setEmotion(nextEmotion);
    setSpeaking(true);
    const dub = startDub({
      mindId,
      text,
      lang,
      emotion: nextEmotion,
      onViseme: setMouth,
      onError: () => setSpeaking(false),
    });
    dubRef.current = dub;
    void dub.done.finally(() => {
      if (dubRef.current === dub) dubRef.current = null;
      setSpeaking(false);
      setMouth(0);
    });
  }, [lang, mindId]);

  return { listening, speaking, mouth, emotion, listen, speak, stop };
}