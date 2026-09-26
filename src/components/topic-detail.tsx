/**
 * Detailed part of one topic inside one video: the explanation, the exact
 * clip with subtitles, the persona's voice clone and face clone, and chat.
 * Read-only: it never changes the mind.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Square, Video, Volume2 } from "lucide-react";
import { toast } from "sonner";

import { TalkToMindModal } from "@/components/talk-to-mind-modal";
import { findClone, isLive, listClones } from "@/lib/persona-clones";
import { startDub, type DubHandle } from "@/lib/voice-dub";
import { pickCopy, useDisplayTexts, type Lang } from "@/lib/i18n";
import type { LangCode } from "@/lib/languages";
import type { VideoPart, VideoPartsResult } from "@/lib/knowledge-graph.functions";

const fmt = (s: number | null) =>
  s == null ? "" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function TopicDetail({
  lang,
  part,
  info,
  videoTitle,
  alsoIn,
}: {
  lang: Lang;
  part: VideoPart;
  info: VideoPartsResult;
  videoTitle: string;
  alsoIn: string[];
}) {
  const c = {
    explain: pickCopy({ en: "What he explains", mn: "Юу тайлбарласан", ko: "설명 내용" }, lang),
    noExplain: pickCopy({ en: "No written explanation was mined for this topic.", mn: "Энэ сэдэвт бичсэн тайлбар олборлогдоогүй.", ko: "이 주제에 대한 설명이 마이닝되지 않았습니다." }, lang),
    clip: pickCopy({ en: "The moment in the video", mn: "Видеоны тэр хэсэг", ko: "영상 속 장면" }, lang),
    wholeVideo: pickCopy({ en: "No exact time was saved, so the whole video plays.", mn: "Яг цаг хадгалагдаагүй тул бүх видео тоглоно.", ko: "정확한 시간이 없어 전체 영상을 재생합니다." }, lang),
    subtitles: pickCopy({ en: "Subtitles", mn: "Хадмал", ko: "자막" }, lang),
    voice: pickCopy({ en: "Hear it in his voice", mn: "Түүний дуугаар сонсох", ko: "그의 목소리로 듣기" }, lang),
    stop: pickCopy({ en: "Stop", mn: "Зогсоох", ko: "정지" }, lang),
    face: pickCopy({ en: "See him explain it", mn: "Түүнийг тайлбарлахыг харах", ko: "그가 설명하는 모습 보기" }, lang),
    ask: pickCopy({ en: "Ask about this", mn: "Энэ талаар асуух", ko: "이것에 대해 묻기" }, lang),
    setupVoice: pickCopy({ en: "Set up voice clone in Clone studio to hear his voice.", mn: "Дуу хоолойг сонсохын тулд Clone studio-д дуу хуулбар тохируулна уу.", ko: "목소리를 들으려면 Clone studio에서 음성 복제를 설정하세요." }, lang),
    setupFace: pickCopy({ en: "Set up face clone in Clone studio to see him explain it.", mn: "Нүүрийг харахын тулд Clone studio-д нүүр хуулбар тохируулна уу.", ko: "얼굴을 보려면 Clone studio에서 얼굴 복제를 설정하세요." }, lang),
    alsoIn: pickCopy({ en: "Also in", mn: "Мөн эдгээрт", ko: "다른 영상" }, lang),
  };

  const { data: clones = [] } = useQuery({
    queryKey: ["persona-clones", info.personaId],
    queryFn: () => listClones(info.personaId!),
    enabled: Boolean(info.personaId),
  });
  const voice = findClone(clones, "voice");
  const face = findClone(clones, "face");
  const voiceLive = isLive(voice);
  const faceLive = isLive(face);

  const lines = useMemo(() => {
    if (part.start == null) return info.lines.slice(0, 40);
    const end = part.end ?? part.start + 60;
    return info.lines.filter((l) => l.end >= part.start! && l.start <= end).slice(0, 80);
  }, [info.lines, part]);

  const [explanation, ...shown] = useDisplayTexts([part.explanation, ...lines.map((l) => l.speech)]);

  const [dub, setDub] = useState<DubHandle | null>(null);
  const dubRef = useRef<DubHandle | null>(null);
  dubRef.current = dub;
  useEffect(() => () => dubRef.current?.stop(), []);

  const [chat, setChat] = useState(false);

  const speak = () => {
    if (dub) { dub.stop(); setDub(null); return; }
    if (!info.mindId) return;
    const text = explanation || part.title;
    const h = startDub({
      mindId: info.mindId,
      text,
      lang: lang as LangCode,
      voiceId: voice?.remote_id ?? undefined,
      onError: (m) => toast.error(m),
    });
    setDub(h);
    void h.done.finally(() => setDub((cur) => (cur === h ? null : cur)));
  };

  const src = info.youtubeId
    ? `https://www.youtube-nocookie.com/embed/${info.youtubeId}?rel=0&modestbranding=1&cc_load_policy=1&cc_lang_pref=${lang}&hl=${lang}` +
      (part.start != null ? `&start=${Math.floor(part.start)}` : "") +
      (part.end != null ? `&end=${Math.ceil(part.end)}` : "")
    : "";

  const btn = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-foreground disabled:opacity-50";

  return (
    <div className="mt-4 space-y-4 text-sm">
      <div>
        <p className="font-semibold text-foreground">{part.title}</p>
        <p className="text-xs text-muted-foreground">
          {videoTitle}
          {part.start != null ? ` · ${fmt(part.start)}–${fmt(part.end)}` : ""}
        </p>
      </div>

      <section>
        <p className="text-xs font-semibold text-muted-foreground">{c.explain}</p>
        <p className="mt-1 text-sm text-foreground">{explanation || c.noExplain}</p>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">{c.clip}</p>
        {src ? (
          <div className="aspect-video overflow-hidden rounded-lg border border-border bg-muted">
            <iframe
              key={src}
              src={src}
              title={part.title}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : null}
        {part.start == null ? <p className="text-xs text-muted-foreground">{c.wholeVideo}</p> : null}
        {lines.length > 0 ? (
          <details className="rounded-lg border border-border p-2" open>
            <summary className="cursor-pointer text-xs text-muted-foreground">{c.subtitles}</summary>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
              {lines.map((l, i) => (
                <li key={`${l.start}-${i}`} className="text-foreground">
                  <span className="mr-2 text-muted-foreground">{fmt(l.start)}</span>
                  {shown[i] || l.speech}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={speak} disabled={!voiceLive || !info.mindId}>
          {dub ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {dub ? c.stop : c.voice}
        </button>
        <button type="button" className={btn} onClick={() => setChat(true)} disabled={!faceLive || !info.mindId}>
          <Video className="h-3.5 w-3.5" /> {c.face}
        </button>
        <button type="button" className={btn} onClick={() => setChat(true)} disabled={!info.mindId}>
          <MessageCircle className="h-3.5 w-3.5" /> {c.ask}
        </button>
      </section>
      {!voiceLive ? <p className="text-xs text-muted-foreground">{c.setupVoice}</p> : null}
      {!faceLive ? <p className="text-xs text-muted-foreground">{c.setupFace}</p> : null}

      {alsoIn.length > 0 ? (
        <section>
          <p className="text-xs font-semibold text-muted-foreground">{c.alsoIn}</p>
          <ul className="mt-1 space-y-0.5 text-xs text-foreground">
            {alsoIn.slice(0, 8).map((t) => <li key={t} className="truncate">• {t}</li>)}
          </ul>
        </section>
      ) : null}

      <TalkToMindModal open={chat} onClose={() => setChat(false)} mindId={info.mindId} mindName={part.title} lang={lang} />
    </div>
  );
}
