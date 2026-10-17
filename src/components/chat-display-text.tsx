import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Languages, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import type { Lang } from '@/lib/i18n';
import { translateChatDisplay } from '@/lib/chat-display-translation';

const COPY = {
  en: { original: 'Show original', translated: 'Show translation', waiting: 'Translating…', retry: 'Translation unavailable — retry' },
  mn: { original: 'Эхийг харах', translated: 'Орчуулгыг харах', waiting: 'Орчуулж байна…', retry: 'Орчуулга түр ажиллахгүй байна — дахин оролдох' },
  ko: { original: '원문 보기', translated: '번역 보기', waiting: '번역 중…', retry: '번역할 수 없습니다 — 다시 시도' },
};

/** Only intersecting text in the open chat is translated; the source stays untouched. */
export function ChatDisplayText({ text, lang, pending = false, controls = true, children }: {
  text: string; lang: Lang; pending?: boolean; controls?: boolean; children?: (shown: string) => ReactNode;
}) {
  const { userId } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<{ key: string; text: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [original, setOriginal] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([userId, lang, text]);
  const copy = COPY[lang as keyof typeof COPY] ?? COPY.en;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Once seen, stay translated — toggling on scroll made text flicker.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || pending || !text.trim()) return;
    let live = true;
    setFailed(null);
    setOriginal(false);
    void translateChatDisplay(text, lang, userId ?? 'visitor').then((out) => {
      if (live) setResult({ key, text: out });
    }).catch(() => { if (live) setFailed(key); });
    return () => { live = false; };
  }, [key, visible, pending, retry, text, lang, userId]);
  const translated = result?.key === key ? result.text : null;
  const shown = !original && translated !== null ? translated : text;
  return <div ref={ref} className="min-w-0 max-w-full break-words">
    {children ? children(shown) : shown}
    {controls && translated && translated !== text && <Button type="button" variant="ghost" size="icon" className="ml-1 h-6 w-6 align-middle text-muted-foreground" title={original ? copy.translated : copy.original} aria-label={original ? copy.translated : copy.original} onClick={() => setOriginal((value) => !value)}><Languages className="h-3 w-3" /></Button>}
    {failed === key && (controls ? <Button type="button" variant="ghost" size="icon" className="ml-1 h-6 w-6 align-middle text-muted-foreground" title={copy.retry} aria-label={copy.retry} onClick={() => setRetry((value) => value + 1)}><RotateCcw className="h-3 w-3" /></Button> : <span className="ml-1 text-xs text-muted-foreground" title={copy.retry}>!</span>)}
    {!pending && visible && !translated && failed !== key && <span className="ml-1 text-xs text-muted-foreground" role="status">{copy.waiting}</span>}
  </div>;
}