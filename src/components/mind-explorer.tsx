/**
 * Mind Explorer — one place to open a mined `.json.md` and travel through it.
 *
 * Every mined layer (story, subtitles, topics, voice-clone segments, face-clone
 * clips, emotions, music, persona traits, raw JSON) is shown in a single
 * inspector with a sticky player, so any timestamped record can be played back
 * against the real video and verified, then fixed with the surgical editor.
 */
import { useMemo, useState } from "react";
import {
  AudioLines,
  Brain,
  Captions,
  Code2,
  Music4,
  Play,
  Scissors,
  Search,
  Smile,
  Sparkles,
  UserSquare2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { JsonSurgicalEditor } from "@/components/json-surgical-editor";
import { buildMindView, clock, type Segment } from "@/lib/mind-explore";
import type { MindPayload } from "@/lib/mind-json";
import { pickCopy, type Lang } from "@/lib/i18n";

const C = {
  title: { en: "Mind Explorer", mn: "Оюун Судлаач", ko: "마인드 탐색기" },
  desc: {
    en: "Everything the miner extracted — play any moment back against the real video, then fix it.",
    mn: "Олборлогчийн гаргасан бүх зүйл — аль ч агшныг бодит видеон дээр тоглуулж шалгаад засна.",
    ko: "마이너가 추출한 모든 것 — 실제 영상에서 재생해 확인하고 수정하세요.",
  },
  search: { en: "Search everything in this Mind…", mn: "Энэ оюунаас хайх…", ko: "이 마인드에서 검색…" },
  story: { en: "Story", mn: "Түүх", ko: "스토리" },
  subtitles: { en: "Subtitles", mn: "Хадмал", ko: "자막" },
  topics: { en: "Topics", mn: "Сэдэв", ko: "주제" },
  voice: { en: "Voice clone", mn: "Дуу хоолой", ko: "음성 클론" },
  face: { en: "Face clone", mn: "Царай", ko: "얼굴 클론" },
  emotions: { en: "Emotions", mn: "Сэтгэл хөдлөл", ko: "감정" },
  audio: { en: "Audio", mn: "Аудио", ko: "오디오" },
  persona: { en: "Persona", mn: "Дүр", ko: "페르소나" },
  raw: { en: "Raw JSON", mn: "Түүхий JSON", ko: "원본 JSON" },
  fix: { en: "Fix & patch", mn: "Засах", ko: "수정 및 패치" },
  play: { en: "Play", mn: "Тоглуулах", ko: "재생" },
  noVideo: {
    en: "This Mind has no linked YouTube source, so clips can't be played back here.",
    mn: "Энэ оюунд холбогдсон YouTube эх сурвалж алга тул тайрч тоглуулах боломжгүй.",
    ko: "연결된 YouTube 소스가 없어 클립을 재생할 수 없습니다.",
  },
  empty: { en: "The miner returned nothing for this layer.", mn: "Энэ хэсэгт олборлогч юу ч гаргаагүй.", ko: "이 항목에서 추출된 데이터가 없습니다." },
  tone: { en: "Tone", mn: "Өнгө аяс", ko: "톤" },
  speakers: { en: "Speakers", mn: "Ярьж буй хүмүүс", ko: "화자" },
  summary: { en: "Full story", mn: "Бүрэн түүх", ko: "전체 스토리" },
  beats: { en: "Story beats", mn: "Түүхийн үе", ko: "스토리 비트" },
  lessons: { en: "Core lessons", mn: "Гол сургамж", ko: "핵심 교훈" },
  beliefs: { en: "Beliefs", mn: "Итгэл үнэмшил", ko: "신념" },
  skills: { en: "Skills", mn: "Ур чадвар", ko: "스킬" },
  logic: { en: "Decision logic", mn: "Шийдвэрийн логик", ko: "의사결정 로직" },
  style: { en: "Expressive style", mn: "Илэрхийллийн хэв маяг", ko: "표현 스타일" },
  phrases: { en: "Signature phrases", mn: "Онцлох хэллэг", ko: "특유의 표현" },
  vocalAssets: { en: "Vocal assets", mn: "Дуу хоолойн шинж", ko: "보컬 자산" },
  music: { en: "Music segments", mn: "Хөгжмийн хэсэг", ko: "음악 구간" },
  atmosphere: { en: "Atmosphere", mn: "Уур амьсгал", ko: "분위기" },
} as const;

function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{text}</p>;
}

function Row({
  onPlay,
  playable,
  stamp,
  children,
}: {
  onPlay?: (() => void) | undefined;
  playable: boolean;
  stamp?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      {stamp ? (
        <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
          {stamp}
        </Badge>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1 text-sm text-foreground">{children}</div>
      {onPlay ? (
        <Button size="icon" variant="ghost" disabled={!playable} onClick={onPlay} aria-label="Play">
          <Play className="h-4 w-4" />
        </Button>
      ) : null}
    </li>
  );
}

export function MindExplorer({
  lang,
  open,
  onOpenChange,
  title,
  payload,
  onSave,
}: {
  lang: Lang;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  payload: MindPayload;
  onSave: (next: MindPayload, releaseNotes: string) => Promise<void>;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const view = useMemo(() => buildMindView(payload), [payload]);
  const [clip, setClip] = useState<Segment | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);

  const playable = !!view.youtubeId;
  const play = (seg: Segment) => setClip({ start: Math.max(0, Math.floor(seg.start)), end: seg.end ? Math.ceil(seg.end) : null });

  const needle = q.trim().toLowerCase();
  const match = (...parts: (string | undefined | null)[]) =>
    !needle || parts.some((p) => (p ?? "").toLowerCase().includes(needle));

  const cues = view.cues.filter((c) => match(c.text, c.speaker));
  const topics = view.topics.filter((x) => match(x.title, x.detail, x.action));
  const voice = view.voice.filter((v) => match(v.quality, v.note));
  const face = view.face.filter((f) => match(f.description, f.actionType, f.gestures, f.faceAngle));
  const emotions = view.emotions.filter((e) => match(e.emotion, e.note, e.intensity));
  const beats = view.story.beats.filter((b) => match(b.event, b.emotion));

  const embed = view.youtubeId
    ? `https://www.youtube-nocookie.com/embed/${view.youtubeId}?autoplay=1&rel=0${clip ? `&start=${clip.start}${clip.end ? `&end=${clip.end}` : ""}` : ""}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-5xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4 pb-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> {t("title")}
          </DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-background/95 p-4 backdrop-blur">
            {embed ? (
              <div className="overflow-hidden rounded-xl border border-border bg-black">
                <iframe
                  key={`${clip?.start ?? "full"}-${clip?.end ?? ""}`}
                  src={embed}
                  title={title}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  className="aspect-video w-full"
                />
              </div>
            ) : (
              <Empty text={t("noVideo")} />
            )}
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="pl-8" />
              </div>
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                <Scissors className="mr-1.5 h-3.5 w-3.5" /> {t("fix")}
              </Button>
            </div>
          </div>

          <Tabs defaultValue="story" className="p-4">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="story"><Brain className="mr-1.5 h-3.5 w-3.5" />{t("story")}</TabsTrigger>
              <TabsTrigger value="subtitles"><Captions className="mr-1.5 h-3.5 w-3.5" />{t("subtitles")} {view.counts['subtitles']}</TabsTrigger>
              <TabsTrigger value="topics">{t("topics")} {view.counts['topics']}</TabsTrigger>
              <TabsTrigger value="voice"><AudioLines className="mr-1.5 h-3.5 w-3.5" />{t("voice")} {view.counts['voice']}</TabsTrigger>
              <TabsTrigger value="face"><UserSquare2 className="mr-1.5 h-3.5 w-3.5" />{t("face")} {view.counts['face']}</TabsTrigger>
              <TabsTrigger value="emotions"><Smile className="mr-1.5 h-3.5 w-3.5" />{t("emotions")} {view.counts['emotions']}</TabsTrigger>
              <TabsTrigger value="audio"><Music4 className="mr-1.5 h-3.5 w-3.5" />{t("audio")}</TabsTrigger>
              <TabsTrigger value="persona">{t("persona")}</TabsTrigger>
              <TabsTrigger value="raw"><Code2 className="mr-1.5 h-3.5 w-3.5" />{t("raw")}</TabsTrigger>
            </TabsList>

            <TabsContent value="story" className="space-y-4 pt-4">
              {view.story.summary ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("summary")}</p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground">{view.story.summary}</p>
                  {view.story.tone ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("tone")}: {view.story.tone}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {view.speakers.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("speakers")}</p>
                  {view.speakers.map((s) => (
                    <div key={s.label} className="rounded-lg border border-border bg-card p-3 text-sm">
                      <p className="font-medium text-foreground">
                        {s.label} <span className="text-xs text-muted-foreground">{s.role}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("beats")}</p>
              {beats.length === 0 ? (
                <Empty text={t("empty")} />
              ) : (
                <ul className="space-y-2">
                  {beats.map((b, i) => (
                    <Row
                      key={i}
                      stamp={clock(b.at)}
                      playable={playable}
                      onPlay={b.at !== null ? () => play({ start: b.at!, end: b.at! + 45 }) : undefined}
                    >
                      <p>{b.event}</p>
                      {b.emotion ? <p className="text-xs text-primary">{b.emotion}</p> : null}
                    </Row>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="subtitles" className="pt-4">
              {cues.length === 0 ? (
                <Empty text={t("empty")} />
              ) : (
                <ul className="space-y-2">
                  {cues.map((c, i) => (
                    <Row key={i} stamp={clock(c.start)} playable={playable} onPlay={() => play(c)}>
                      {c.speaker ? <p className="text-xs font-semibold text-primary">{c.speaker}</p> : null}
                      <p>{c.text}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {clock(c.start)} → {clock(c.end)}
                      </p>
                    </Row>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="topics" className="pt-4">
              {topics.length === 0 ? (
                <Empty text={t("empty")} />
              ) : (
                <ul className="space-y-2">
                  {topics.map((x, i) => (
                    <Row
                      key={i}
                      stamp={clock(x.start)}
                      playable={playable}
                      onPlay={x.start !== null ? () => play({ start: x.start!, end: x.end }) : undefined}
                    >
                      <p className="font-medium">{x.title}</p>
                      {x.detail ? <p className="text-xs text-muted-foreground">{x.detail}</p> : null}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {x.confidence !== null ? (
                          <Badge variant="outline">{Math.round(x.confidence * 100)}%</Badge>
                        ) : null}
                        {x.action ? <Badge variant="secondary">{x.action}</Badge> : null}
                      </div>
                    </Row>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="voice" className="space-y-3 pt-4">
              {view.voiceSkills.length > 0 ? (
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("vocalAssets")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {view.voiceSkills.map((s) => (
                      <Badge key={s} variant="secondary">{s}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {voice.length === 0 ? (
                <Empty text={t("empty")} />
              ) : (
                <ul className="space-y-2">
                  {voice.map((v, i) => (
                    <Row key={i} stamp={clock(v.start)} playable={playable} onPlay={() => play(v)}>
                      <p className="font-medium">
                        {clock(v.start)} → {clock(v.end)}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {v.quality ? <Badge variant="outline">{v.quality}</Badge> : null}
                        <Badge variant={v.musicPresent ? "destructive" : "secondary"}>
                          {v.musicPresent ? "music" : "clean speech"}
                        </Badge>
                      </div>
                      {v.note ? <p className="text-xs text-muted-foreground">{v.note}</p> : null}
                    </Row>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="face" className="pt-4">
              {face.length === 0 ? (
                <Empty text={t("empty")} />
              ) : (
                <ul className="space-y-2">
                  {face.map((f, i) => (
                    <Row key={i} stamp={clock(f.start)} playable={playable} onPlay={() => play(f)}>
                      <div className="flex gap-3">
                        {view.youtubeId ? (
                          <img
                            src={`https://i.ytimg.com/vi/${view.youtubeId}/mqdefault.jpg`}
                            alt={f.description || "Mined face clip"}
                            loading="lazy"
                            className="h-14 w-24 shrink-0 rounded-md object-cover"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <p>{f.description}</p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {f.actionType ? <Badge variant="secondary">{f.actionType}</Badge> : null}
                            {f.faceAngle ? <Badge variant="outline">{f.faceAngle}</Badge> : null}
                            {f.quality ? <Badge variant="outline">{f.quality}</Badge> : null}
                            {f.key ? <Badge>key</Badge> : null}
                          </div>
                          {f.gestures ? <p className="mt-1 text-xs text-muted-foreground">{f.gestures}</p> : null}
                          {f.lighting ? <p className="text-xs text-muted-foreground">{f.lighting}</p> : null}
                        </div>
                      </div>
                    </Row>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="emotions" className="pt-4">
              {emotions.length === 0 ? (
                <Empty text={t("empty")} />
              ) : (
                <ul className="space-y-2">
                  {emotions.map((e, i) => (
                    <Row
                      key={i}
                      stamp={clock(e.at)}
                      playable={playable}
                      onPlay={e.at !== null ? () => play({ start: e.at!, end: e.at! + 20 }) : undefined}
                    >
                      <p className="font-medium text-primary">{e.emotion}</p>
                      {e.intensity ? <p className="text-xs text-muted-foreground">{e.intensity}</p> : null}
                      {e.note ? <p className="text-xs text-muted-foreground">{e.note}</p> : null}
                    </Row>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="audio" className="space-y-3 pt-4">
              {view.atmosphere ? (
                <p className="text-sm text-muted-foreground">
                  {t("atmosphere")}: <span className="text-foreground">{view.atmosphere}</span>
                </p>
              ) : null}
              {view.musicTracks.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {view.musicTracks.map((m) => (
                    <Badge key={m} variant="secondary">{m}</Badge>
                  ))}
                </div>
              ) : null}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("music")}</p>
              {view.music.length === 0 ? (
                <Empty text={t("empty")} />
              ) : (
                <ul className="space-y-2">
                  {view.music.map((m, i) => (
                    <Row key={i} stamp={clock(m.start)} playable={playable} onPlay={() => play(m)}>
                      <p>
                        {clock(m.start)} → {clock(m.end)}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[m.mood, m.genre, m.tempo, m.instrumentation].filter(Boolean).map((x) => (
                          <Badge key={x} variant="outline">{x}</Badge>
                        ))}
                        {m.original ? <Badge>original</Badge> : null}
                      </div>
                    </Row>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="persona" className="space-y-4 pt-4">
              {([
                ["lessons", view.knowledge],
                ["beliefs", view.beliefs],
                ["skills", view.skills],
                ["logic", view.decisionLogic],
                ["style", view.expressiveStyle],
              ] as const).map(([key, items]) =>
                items.length === 0 ? null : (
                  <div key={key}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(key)}</p>
                    <ul className="mt-2 space-y-1.5">
                      {items
                        .filter((x) => match(x))
                        .map((x) => (
                          <li key={x} className="rounded-lg border border-border bg-card p-2.5 text-sm">
                            {x}
                          </li>
                        ))}
                    </ul>
                  </div>
                ),
              )}

              {view.phrases.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("phrases")}</p>
                  <ul className="mt-2 space-y-2">
                    {view.phrases
                      .filter((p) => match(p.phrase, p.meaning, p.literal))
                      .map((p, i) => (
                        <Row
                          key={i}
                          stamp={clock(p.at)}
                          playable={playable}
                          onPlay={p.at !== null ? () => play({ start: p.at!, end: p.at! + 20 }) : undefined}
                        >
                          <p className="font-medium">{p.phrase}</p>
                          <p className="text-xs text-muted-foreground">{p.literal}</p>
                          <p className="text-xs text-muted-foreground">{p.meaning}</p>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {p.kind ? <Badge variant="secondary">{p.kind}</Badge> : null}
                            {p.sentiment ? <Badge variant="outline">{p.sentiment}</Badge> : null}
                          </div>
                        </Row>
                      ))}
                  </ul>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="raw" className="pt-4">
              <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        </div>

        {editing ? (
          <JsonSurgicalEditor
            lang={lang}
            open={editing}
            onOpenChange={setEditing}
            title={title}
            payload={payload}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
