import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ModeSwitch } from "@/components/mode-switch";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { BrainStudio, BRAIN_STUDIO_TAB_LABEL } from "@/components/brain-studio";
import { CloudStorageHub, CLOUD_HUB_TAB_LABEL } from "@/components/cloud-storage-hub";
import { recordGrowth } from "@/lib/analytics";
import { useState, useRef, useCallback, useEffect } from "react";
import { splitIntoChunks, formatDuration, type Chunk } from "@/lib/chunking";
import {
  loadApiKeys,
  saveApiKeys,
  makeKeyEntry,
  maskKey,
  type ApiKeyEntry,
} from "@/lib/keystore";
import { saveResume, loadResume, clearResume, type ResumeState } from "@/lib/resume";

import { idbGet, idbSet, STORES } from "@/lib/store";
import {
  buildMineFile,
  parseMineFile,
  downloadMineFile,
  buildAgentBrain,
  downloadAgentBrain,
  type MineResult,
} from "@/lib/mine-file";
import {
  createOwnership,
  normalizeOwnership,
  newMindId,
  isValidEmail,
  DEFAULT_LICENSE,
  type Ownership,
} from "@/lib/ownership";
import {
  extractVoiceSample,
  downloadVoiceSample,
  parseTimestamp,
  type VoiceSample,
} from "@/lib/voice-sample";
import {
  validateApiKey,
  uploadVideo,
  mineChunk,
  deleteFile,
  describeError,
  GeminiError,
  isQuotaError,
  isKeyRejected,
  type UploadedFile,
} from "@/lib/gemini";

import {
  Brain,
  KeyRound,
  Video,
  FileText,
  ScrollText,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload,
  X,
  Globe,
  Menu,
  ChevronRight,
  Save,
  Square,
  Layers,
  Download,
  FolderOpen,
  BadgeDollarSign,
  Fingerprint,
  BookOpen,
  ScanFace,
  AudioLines,
  Cloud,
  Sparkles,
  Search,
  Copy,
  Check,
  CircleSlash,
  Film,
  Play,
  Music,
  Quote,
  Plus,
  Trash2,
  RotateCw,
  PauseCircle,
  PlayCircle,

} from "lucide-react";

/** Inline looping preview of a short action window inside the source video. */
function ActionClip({ src, start, end, label }: { src: string; start: string; end: string; label: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const from = parseTimestamp(start) ?? 0;
  const rawTo = parseTimestamp(end) ?? from + 4;
  const to = rawTo > from ? Math.min(rawTo, from + 10) : from + 4;
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => {
      if (el.currentTime >= to || el.currentTime < from - 0.5) {
        el.currentTime = from;
      }
    };
    el.addEventListener("timeupdate", onTime);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [from, to]);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      el.currentTime = from;
      void el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[12px] border border-border bg-background">
      <video
        ref={ref}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = from;
        }}
        className="aspect-video w-full bg-black object-contain"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100"
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <Play className="h-3.5 w-3.5" />
          {label}
        </span>
      </button>
      <p className="border-t border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        {formatDuration(from)} – {formatDuration(to)}
        {playing ? " · ▶" : ""}
      </p>
    </div>
  );
}

function TabSkeleton({ rows = 3, groups = 2 }: { rows?: number; groups?: number }) {
  return (
    <div className="space-y-5" aria-hidden="true">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} className="space-y-2">
          <div className="skeleton-line h-3 w-28" />
          {Array.from({ length: rows }).map((_, r) => (
            <div
              key={r}
              className="skeleton-line h-3.5"
              style={{ width: `${92 - ((r * 13 + g * 7) % 38)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

type CulturalLabels = {
  culturalVocabulary: string;
  culturalLiteral: string;
  culturalMeaning: string;
  culturalUsage: string;
};

const INTENT_STYLE: Record<string, string> = {
  blessing: "border-primary/40 bg-primary/10 text-primary",
  "genuine-praise": "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  "friendly-teasing": "border-amber-500/40 bg-amber-500/10 text-amber-400",
  sarcasm: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400",
  criticism: "border-red-500/40 bg-red-500/10 text-red-400",
  neutral: "border-border bg-muted text-muted-foreground",
};

/** Idioms, proverbs, blessings and sarcasm decoded to their true cultural intent. */
function CulturalVocabulary({ results, t }: { results: MineResult[]; t: CulturalLabels }) {
  const map = new Map<string, (typeof results)[number]["data"]["subconsciousness"]["culturalVocabulary"][number]>();
  for (const r of results)
    for (const c of r.data.subconsciousness?.culturalVocabulary ?? [])
      if (c.phrase?.trim() && !map.has(c.phrase.trim())) map.set(c.phrase.trim(), c);
  const items = [...map.values()];
  if (items.length === 0) return null;

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
        <Quote className="h-3.5 w-3.5" />
        {t.culturalVocabulary}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((c, i) => (
          <div key={i} className="rounded-xl border border-border bg-card/60 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${INTENT_STYLE[c.intent] ?? INTENT_STYLE['neutral']}`}
              >
                {c.intent}
              </span>
              <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {c.kind}
              </span>
              {c.timestamp && <span className="text-[11px] text-muted-foreground">{c.timestamp}</span>}
            </div>
            <p className="text-sm font-medium leading-relaxed text-foreground">“{c.phrase}”</p>
            {c.literal && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                <span className="uppercase tracking-wider">{t.culturalLiteral}:</span> {c.literal}
              </p>
            )}
            {c.meaning && (
              <p className="mt-1 text-xs leading-relaxed text-foreground">
                <span className="uppercase tracking-wider text-primary">{t.culturalMeaning}:</span> {c.meaning}
              </p>
            )}
            {c.usage && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                <span className="uppercase tracking-wider">{t.culturalUsage}:</span> {c.usage}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type AudioLabels = {
  audioAtmosphere: string;
  audioGenres: string;
  audioMoods: string;
  audioTempo: string;
  audioSegments: string;
  audioSkillAssets: string;
  audioSkillHint: string;
  noAudio: string;
  ownComposition: string;
};

/** Music & audio atmosphere profile plus original audio skill assets. */
function AudioAtmosphere({ results, t }: { results: MineResult[]; t: AudioLabels }) {
  const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean)));
  const genres = uniq(results.flatMap((r) => r.data.audio?.genres ?? []));
  const moods = uniq(results.flatMap((r) => r.data.audio?.moods ?? []));
  const tempos = uniq(results.map((r) => r.data.audio?.tempo ?? ""));
  const atmospheres = uniq(results.map((r) => r.data.audio?.atmosphere ?? ""));
  const assets = uniq(results.flatMap((r) => r.data.audio?.audioSkillAssets ?? []));
  const segments = results.flatMap((r) => r.data.audio?.segments ?? []);
  const empty =
    genres.length + moods.length + tempos.length + atmospheres.length + assets.length + segments.length === 0;

  const chips = (label: string, items: string[]) =>
    items.length === 0 ? null : (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        {items.map((x, i) => (
          <span
            key={i}
            className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {x}
          </span>
        ))}
      </div>
    );

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
          <Music className="h-3.5 w-3.5" />
          {t.audioAtmosphere}
        </p>
        {empty ? (
          <p className="text-sm text-muted-foreground">{t.noAudio}</p>
        ) : (
          <div className="space-y-3 rounded-[12px] border border-border bg-card p-4">
            {atmospheres.map((a, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground">
                {a}
              </p>
            ))}
            {chips(t.audioGenres, genres)}
            {chips(t.audioMoods, moods)}
            {chips(t.audioTempo, tempos)}
            {segments.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs text-muted-foreground">{t.audioSegments}</p>
                {segments.map((m, i) => (
                  <p key={i} className="text-sm leading-relaxed text-foreground">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      [{m.start}–{m.end}]
                    </span>
                    {[m.genre, m.mood, m.tempo, m.instrumentation].filter(Boolean).join(" · ")}
                    {m.isOriginalByOwner && (
                      <span className="ml-2 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {t.ownComposition}
                      </span>
                    )}
                    {m.note && <span className="ml-2 text-muted-foreground">— {m.note}</span>}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {assets.length > 0 && (
        <div className="rounded-[12px] border border-primary/40 bg-primary/5 p-4">
          <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
            <Music className="h-3.5 w-3.5" />
            {t.audioSkillAssets}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">{t.audioSkillHint}</p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
            {assets.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/creator")({
  head: () => ({
    meta: [
      { title: "Evermine — Creator Dashboard" },
      { name: "description", content: "Evermine dashboard: configure your API key, upload a video, and mine structured knowledge." },
      { property: "og:title", content: "Evermine — Dashboard" },
      { property: "og:description", content: "Configure your API key, upload a video, and mine structured knowledge." },
    ],
  }),
  component: Index,
});

type Status = "ready" | "processing" | "complete" | "error" | "paused";
type Language = "en" | "mn";
type Tab = "subtitle" | "story" | "face" | "voice" | "brain" | "studio" | "cloud" | "log";

const translations = {
  en: {
    appName: "Evermine",
    tagline: "A life becomes a mind.",
    analytics: "Analytics & Earnings",
    language: "Language",
    quickLinks: "Quick Links",
    apiKey: "API Key",
    provider: "Provider",
    apiKeyPlaceholder: "Paste your API key here",
    saveKey: "Add Key",
    keyPool: "API Keys (rotation pool)",
    keyPoolHint: "Keys are tried in order. When one hits its quota, mining automatically switches to the next.",
    keyEmpty: "No keys yet — add at least one Gemini key.",
    keyActive: "Active",
    keyExhausted: "Quota exhausted",
    keyRejected: "Rejected",
    keyReset: "Mark as available again",
    keyRemove: "Remove key",
    keyDuplicate: "That key is already in the pool.",
    keyAdded: "Key added to the rotation pool.",
    resetAllKeys: "Reset all keys",
    paused: "Paused",
    pausedQuota: "Mining Paused (Quota Limit)",
    pausedQuotaBody:
      "Every API key in the pool hit its quota. Add a new key or wait for the quota to reset, then resume — your finished pieces are saved.",
    resumeMining: "Resume Mining",
    discardResume: "Discard saved progress",
    resumeReady: "Saved progress found",
    resumeBody: "Mining stopped at piece",
    resumeNeedVideo: "Re-add the same video file to resume.",
    notePausedQuota: "All API keys are out of quota. Mining paused — progress saved.",
    noteResuming: "Resuming mining from the saved checkpoint...",
    noteNeedVideo: "Load the video file again before resuming.",

    uploadVideo: "Upload Video",
    dragDrop: "Drag and drop a video file here",
    orClick: "or click to browse",
    supported: "MP4, MOV, WebM up to 2GB",
    dropHere: "Drop the video to load it",
    tooLarge: "File is too large — the limit is 2GB.",
    badType: "Unsupported format. Use MP4, MOV or WebM.",
    preview: "Preview",
    resolution: "Resolution",
    fileSize: "File size",
    reading: "Reading…",
    mineVideo: "Mine Video",
    status: "Status",
    ready: "Ready",
    processing: "Processing",
    complete: "Complete",
    error: "Error",
    structuredKnowledge: "Structured Knowledge",
    transcript: "Transcript",
    appLog: "App Log",
    noResults: "Results will appear here after mining begins.",
    noTranscript: "Transcript will appear here after processing.",
    searchTranscript: "Search transcript…",
    noMatches: "No transcript lines match your search.",
    copyAll: "Copy All Transcript",
    copied: "Transcript copied to clipboard",
    copyFailed: "Could not copy transcript",
    jumpTo: "Jump to this moment in the video",
    noLog: "Application logs will appear here.",
    dashboard: "Dashboard",
    settings: "Settings",
    history: "History",
    help: "Help",
    removeFile: "Remove file",
    progress: "Mining Progress",
    chunkTimeline: "Chunk Timeline",
    chunkPending: "Pending",
    chunkProcessing: "Processing",
    chunkDone: "Completed",
    chunkFailed: "Failed",
    showingPiece: "Showing piece",
    showAllPieces: "Show all pieces",
    openChunkData: "Open this chunk's extracted data",
    piece: "Piece",
    of: "of",
    elapsed: "Elapsed",
    remaining: "Est. remaining",
    stop: "Stop",
    stopped: "Job cancelled by user.",
    pieces: "pieces",
    duration: "Duration",
    results: "Results",
    model: "Model",
    keyValid: "Key validated and stored locally.",
    keyInvalid: "Key rejected — see the App Log.",
    keyChecking: "Validating key...",
    saveMine: "Save Mine (.json)",
    openMine: "Open Saved Mine",
    localOnly: "Everything stays on this device — keys, videos and results never leave your browser.",
    restored: "Restored your last mining session from this device.",
    noteReady: "System ready to process video.",
    noteKeyRejected: "API key rejected — check your Google Gemini key.",
    noteQuota: "Quota or rate limit reached. Try again later.",
    noteGeneric: "Something went wrong. Check the app log.",
    noteNoKey: "Add and save your Google Gemini API key first.",
    noteProviderOnly: "Only Google Gemini is wired up right now.",
    noteUploading: "Uploading video to Gemini...",
    noteMining: "Mining knowledge from your video...",
    noteComplete: "Knowledge extraction complete.",
    noteKeySaved: "API key saved and validated.",
    noteExported: "Mine saved to your device.",
    noteImported: "Saved mine loaded.",
    noteImportFailed: "That file is not a valid Evermine mine.",
    tabSubtitle: "Subtitle & Transcript",
    tabStory: "Narrative Story",
    tabFace: "Face & Visual Data",
    tabVoice: "Voice Sample Data",
    tabBrain: "Subconsciousness / Core Brain",
    skills: "Skills",
    beliefs: "Beliefs & Opinions",
    decisionLogic: "Decision Logic",
    aestheticProfile: "Aesthetic Profile & Mood Preference",
    expressiveStyle: "Expressive Style",
    culturalVocabulary: "Cultural Vocabulary & Expressive Style",
    culturalLiteral: "Literal",
    culturalMeaning: "True intent",
    culturalUsage: "Used when",
    audioAtmosphere: "Music & Audio Atmosphere",
    audioGenres: "Genres",
    audioMoods: "Mood / tone",
    audioTempo: "Tempo",
    audioSegments: "Music segments",
    audioSkillAssets: "Audio Skill Assets",
    audioSkillHint: "Original music performed or composed by the Primary Owner.",
    noAudio: "No music or audio atmosphere detected yet.",
    musicPresent: "music in window",
    cleanSpeech: "clean speech",
    speechFiltered: "Background music filtered out",
    ownComposition: "Owner's own composition",
    tone: "Emotional tone",
    timeline: "Timeline",
    gestures: "Gestures",
    lighting: "Lighting",
    faceAngle: "Face angle",
    cloneQuality: "Clone quality",
    speakers: "Speakers detected",
    primaryOwner: "Primary Owner",
    secondarySpeaker: "Guest",
    unknownSpeaker: "Unknown",
    keyAction: "Key action",
    actionClip: "Action replay",
    playClip: "Play clip",
    needVideoForClip: "Load the source video to replay this action.",
    noStory: "The narrative story will appear here after processing.",
    noFace: "Visual and face framing notes will appear here after processing.",
    noVoice: "Clean-audio windows will appear here after processing.",
    noBrain: "Skills, beliefs and decision logic will appear here after processing.",
    voiceWindows: "Cleanest audio windows",
    extractSample: "Extract 60s voice sample",
    extracting: "Extracting sample...",
    downloadSample: "Download",
    deleteSample: "Delete",
    voiceHint: "Recorded in real time from your local file — nothing is uploaded.",
    noSample: "No voice sample extracted yet.",
    sampleReady: "Voice sample ready.",
    exportBrain: "Export Agent-Ready Brain",
    noteBrainExported: "Agent-ready brain exported.",
    noteSampleReady: "60-second voice sample extracted.",
    noteSampleFailed: "Could not extract a voice sample from this file.",
    needVideoForSample: "Load the original video file to extract a voice sample.",
    commercial: "Commercial / Marketplace Settings",
    creatorName: "Mind Creator name",
    creatorEmail: "Contact email",
    accessLevel: "Access level",
    accessPrivate: "Private",
    accessMarketplace: "Public Marketplace",
    rate: "Rate",
    perHour: "Per hour",
    rateUnit: "Billing unit",
    perQuery: "Per query",
    currency: "Token / currency",
    licenseTerms: "Licensing terms",
    mindId: "Mind unique ID",
    regenerateId: "New ID",
    invalidEmail: "Enter a valid contact email.",
    commercialHint: "Stored only in this browser and bundled into your agent-ready export.",
    noteOwnershipSaved: "Marketplace settings saved on this device.",
  },
  mn: {
    appName: "Evermine",
    tagline: "Амьдрал оюун болдог.",
    analytics: "Аналитик ба орлого",
    language: "Хэл",
    quickLinks: "Түлхүүр холбоос",
    apiKey: "API түлхүүр",
    provider: "Нийлүүлэгч",
    apiKeyPlaceholder: "API түлхүүрээ энд наана уу",
    saveKey: "Түлхүүр нэмэх",
    keyPool: "API түлхүүрүүд (эргэлтийн сан)",
    keyPoolHint:
      "Түлхүүрүүд дараалан ашиглагдана. Нэг нь хязгаартаа хүрвэл дараагийн нөөц түлхүүр рүү автоматаар шилжинэ.",
    keyEmpty: "Түлхүүр алга — дор хаяж нэг Gemini түлхүүр нэмнэ үү.",
    keyActive: "Идэвхтэй",
    keyExhausted: "Хязгаар дууссан",
    keyRejected: "Татгалзсан",
    keyReset: "Дахин ашиглах боломжтой болгох",
    keyRemove: "Түлхүүр устгах",
    keyDuplicate: "Энэ түлхүүр сан дотор аль хэдийн байна.",
    keyAdded: "Түлхүүр эргэлтийн санд нэмэгдлээ.",
    resetAllKeys: "Бүх түлхүүрийг сэргээх",
    paused: "Түр зогссон",
    pausedQuota: "Боловсруулалт зогссон (Хязгаар дууссан)",
    pausedQuotaBody:
      "Бүх API түлхүүрийн хязгаар дууслаа. Шинэ түлхүүр нэмэх эсвэл хязгаар сэргэхийг хүлээгээд үргэлжлүүлнэ үү — дууссан хэсгүүд хадгалагдсан.",
    resumeMining: "Үргэлжлүүлэх",
    discardResume: "Хадгалсан явцыг устгах",
    resumeReady: "Хадгалсан явц олдлоо",
    resumeBody: "Боловсруулалт зогссон хэсэг",
    resumeNeedVideo: "Үргэлжлүүлэхийн тулд ижил видеог дахин оруулна уу.",
    notePausedQuota: "Бүх түлхүүрийн хязгаар дууслаа. Боловсруулалт зогслоо — явц хадгалагдсан.",
    noteResuming: "Хадгалсан цэгээс үргэлжлүүлж байна...",
    noteNeedVideo: "Үргэлжлүүлэхийн өмнө видео файлаа дахин ачаална уу.",

    uploadVideo: "Видео оруулах",
    dragDrop: "Видео файлыг энд чирнэ үү",
    orClick: "эсвэл хайхаар дарна уу",
    supported: "MP4, MOV, WebM 2GB хүртэл",
    dropHere: "Видеог энд тавьж ачаална уу",
    tooLarge: "Файл хэт том байна — дээд хэмжээ 2GB.",
    badType: "Дэмжигдэхгүй формат. MP4, MOV, WebM ашиглана уу.",
    preview: "Урьдчилан үзэх",
    resolution: "Нягтрал",
    fileSize: "Файлын хэмжээ",
    reading: "Уншиж байна…",
    mineVideo: "Видео боловсруулах",
    status: "Төлөв",
    ready: "Бэлэн",
    processing: "Боловсруулж байна",
    complete: "Дууссан",
    error: "Алдаа",
    structuredKnowledge: "Бүтцэд оруулсан мэдлэг",
    transcript: "Ярианы бичлэг",
    appLog: "Аппликэйшн бүртгэл",
    noResults: "Боловсруулалт эхэлсний дараа энд харуулна.",
    noTranscript: "Боловсруулалт дууссаны дараа ярианы бичлэг энд харуулна.",
    searchTranscript: "Ярианы бичлэгээс хайх…",
    noMatches: "Хайлтад тохирох мөр олдсонгүй.",
    copyAll: "Бүх бичлэгийг хуулах",
    copied: "Ярианы бичлэгийг хууллаа",
    copyFailed: "Хуулж чадсангүй",
    jumpTo: "Видеоны энэ хэсэг рүү очих",
    noLog: "Аппликэйшн бүртгэл энд харуулна.",
    dashboard: "Хяналтын самбар",
    settings: "Тохиргоо",
    history: "Түүх",
    help: "Тусламж",
    removeFile: "Файл устгах",
    progress: "Боловсруулалтын явц",
    chunkTimeline: "Хэсгүүдийн цагийн зурвас",
    chunkPending: "Хүлээгдэж буй",
    chunkProcessing: "Боловсруулж байна",
    chunkDone: "Дууссан",
    chunkFailed: "Амжилтгүй",
    showingPiece: "Харуулж буй хэсэг",
    showAllPieces: "Бүх хэсгийг харуулах",
    openChunkData: "Энэ хэсгийн өгөгдлийг нээх",
    piece: "Хэсэг",
    of: "/",
    elapsed: "Өнгөрсөн",
    remaining: "Үлдсэн хугацаа",
    stop: "Зогсоох",
    stopped: "Хэрэглэгч ажлыг цуцаллаа.",
    pieces: "хэсэг",
    duration: "Үргэлжлэх хугацаа",
    results: "Үр дүн",
    model: "Загвар",
    keyValid: "Түлхүүр баталгаажиж, төхөөрөмж дээр хадгалагдлаа.",
    keyInvalid: "Түлхүүр татгалзагдлаа — Бүртгэлийг шалгана уу.",
    keyChecking: "Түлхүүрийг шалгаж байна...",
    saveMine: "Мэдээллийг хадгалах (.json)",
    openMine: "Хадгалсан файл нээх",
    localOnly: "Бүх зүйл таны төхөөрөмж дээр үлддэг — түлхүүр, видео, үр дүн хэзээ ч хөтчөөс гардаггүй.",
    restored: "Өмнөх ажлыг энэ төхөөрөмжөөс сэргээлээ.",
    noteReady: "Систем видео боловсруулахад бэлэн.",
    noteKeyRejected: "API түлхүүр татгалзагдлаа — Gemini түлхүүрээ шалгана уу.",
    noteQuota: "Хязгаарт хүрлээ. Дараа дахин оролдоно уу.",
    noteGeneric: "Алдаа гарлаа. Бүртгэлийг шалгана уу.",
    noteNoKey: "Эхлээд Gemini API түлхүүрээ хадгална уу.",
    noteProviderOnly: "Одоогоор зөвхөн Google Gemini дэмжигдэнэ.",
    noteUploading: "Видеог Gemini рүү илгээж байна...",
    noteMining: "Видеонээс мэдлэг гаргаж байна...",
    noteComplete: "Мэдлэг гаргах ажил дууслаа.",
    noteKeySaved: "API түлхүүр хадгалагдаж баталгаажлаа.",
    noteExported: "Мэдээлэл төхөөрөмж дээр хадгалагдлаа.",
    noteImported: "Хадгалсан мэдээлэл ачаалагдлаа.",
    noteImportFailed: "Энэ файл зөв Evermine файл биш байна.",
    tabSubtitle: "Хадмал ба ярианы бичлэг",
    tabStory: "Түүхэн өгүүлэмж",
    tabFace: "Царай ба дүрсний мэдээлэл",
    tabVoice: "Дуу хоолойны дээж",
    tabBrain: "Далд ухамсар / Гол тархи",
    skills: "Ур чадвар",
    beliefs: "Итгэл үнэмшил ба үзэл бодол",
    decisionLogic: "Шийдвэрийн логик",
    aestheticProfile: "Гоо зүйн профайл ба сэтгэл санааны сонголт",
    expressiveStyle: "Ярианы хэв маяг",
    culturalVocabulary: "Соёлын хэллэг ба илэрхийллийн хэв маяг",
    culturalLiteral: "Үгчилсэн утга",
    culturalMeaning: "Жинхэнэ санаа",
    culturalUsage: "Хэрэглэх үе",
    audioAtmosphere: "Хөгжим ба дууны уур амьсгал",
    audioGenres: "Төрөл жанр",
    audioMoods: "Сэтгэл хөдлөл / өнгө аяс",
    audioTempo: "Хэмнэл",
    audioSegments: "Хөгжмийн хэсгүүд",
    audioSkillAssets: "Дууны ур чадварын хөрөнгө",
    audioSkillHint: "Үндсэн эзэмшигчийн өөрийн тоглосон эсвэл зохиосон хөгжим.",
    noAudio: "Хөгжим болон дууны уур амьсгал илрээгүй байна.",
    musicPresent: "хөгжимтэй",
    cleanSpeech: "цэвэр яриа",
    speechFiltered: "Дэвсгэр хөгжмийг шүүсэн",
    ownComposition: "Эзэмшигчийн өөрийн бүтээл",
    tone: "Сэтгэл хөдлөлийн өнгө",
    timeline: "Цаг хугацааны дараалал",
    gestures: "Дохио зангаа",
    lighting: "Гэрэлтүүлэг",
    faceAngle: "Царайны өнцөг",
    cloneQuality: "Хуулбарлах чанар",
    speakers: "Илэрсэн ярьж буй хүмүүс",
    primaryOwner: "Үндсэн эзэн",
    secondarySpeaker: "Зочин",
    unknownSpeaker: "Тодорхойгүй",
    keyAction: "Гол хөдөлгөөн",
    actionClip: "Хөдөлгөөний давтан үзүүлэлт",
    playClip: "Клип тоглуулах",
    needVideoForClip: "Хөдөлгөөнийг үзэхийн тулд эх бичлэгээ ачаална уу.",
    noStory: "Боловсруулалтын дараа түүхэн өгүүлэмж энд харагдана.",
    noFace: "Боловсруулалтын дараа дүрс, царайны тэмдэглэл энд харагдана.",
    noVoice: "Боловсруулалтын дараа цэвэр дуутай хэсгүүд энд харагдана.",
    noBrain: "Боловсруулалтын дараа ур чадвар, итгэл үнэмшил, шийдвэрийн логик энд харагдана.",
    voiceWindows: "Хамгийн цэвэр дуутай хэсгүүд",
    extractSample: "60 секундын дуу хоолойны дээж авах",
    extracting: "Дээж бэлтгэж байна...",
    downloadSample: "Татаж авах",
    deleteSample: "Устгах",
    voiceHint: "Таны төхөөрөмж дээрх файлаас шууд бичигдэнэ — хаашаа ч илгээгдэхгүй.",
    noSample: "Дуу хоолойны дээж хараахан аваагүй байна.",
    sampleReady: "Дуу хоолойны дээж бэлэн.",
    exportBrain: "Агент-бэлэн тархи гаргах",
    noteBrainExported: "Агент-бэлэн тархи хадгалагдлаа.",
    noteSampleReady: "60 секундын дуу хоолойны дээж бэлэн боллоо.",
    noteSampleFailed: "Энэ файлаас дуу хоолойны дээж авч чадсангүй.",
    needVideoForSample: "Дээж авахын тулд эх видео файлаа ачаална уу.",
    commercial: "Арилжаа / Маркетплейс тохиргоо",
    creatorName: "Оюуны эзэмшигчийн нэр",
    creatorEmail: "Холбоо барих и-мэйл",
    accessLevel: "Хандах түвшин",
    accessPrivate: "Хувийн",
    accessMarketplace: "Нээлттэй маркетплейс",
    rate: "Үнэ",
    perHour: "Цагаар",
    rateUnit: "Тооцооны нэгж",
    perQuery: "Асуулт тус бүрээр",
    currency: "Токен / валют",
    licenseTerms: "Лицензийн нөхцөл",
    mindId: "Оюуны давтагдашгүй ID",
    regenerateId: "Шинэ ID",
    invalidEmail: "Зөв и-мэйл хаяг оруулна уу.",
    commercialHint: "Зөвхөн энэ хөтөч дээр хадгалагдаж, агент-бэлэн экспортод багтана.",
    noteOwnershipSaved: "Маркетплейс тохиргоо төхөөрөмж дээр хадгалагдлаа.",
  },
};

const navLinks = [
  { key: "dashboard", icon: Brain, href: "#" },
  { key: "analytics", icon: ScrollText, href: "#analytics" },
  { key: "history", icon: ScrollText, href: "#" },
  { key: "settings", icon: KeyRound, href: "#" },
  { key: "help", icon: Globe, href: "#" },
];

const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const ALLOWED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
const ALLOWED_EXT = [".mp4", ".mov", ".webm", ".m4v"];

function isAllowedVideo(f: File) {
  const name = f.name.toLowerCase();
  if (f.type) return ALLOWED_TYPES.includes(f.type.toLowerCase());
  return ALLOWED_EXT.some((ext) => name.endsWith(ext));
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

const MODELS = [
  { value: "gemini-2.5-flash", label: "gemini-2.5-flash (recommended)" },
  { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
  { value: "gemini-1.5-flash", label: "gemini-1.5-flash" },
  { value: "gemini-1.5-pro", label: "gemini-1.5-pro" },
];

/** Thrown when every API key in the rotation pool is out of quota. */
class QuotaPaused extends Error {
  constructor() {
    super("All API keys are exhausted");
    this.name = "QuotaPaused";
  }
}


function Index() {
  const [lang, setLang] = useState<Language>("en");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [provider, setProvider] = useState("gemini");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [apiKey, setApiKey] = useState("");
  const [keyState, setKeyState] = useState<"none" | "checking" | "valid" | "invalid">("none");
  const [status, setStatus] = useState<Status>("ready");
  const [statusNote, setStatusNote] = useState<string>("noteReady");
  const [activeTab, setActiveTab] = useState<Tab>("subtitle");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [resolution, setResolution] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentPiece, setCurrentPiece] = useState(0);
  const [donePieces, setDonePieces] = useState(0);
  const [failedPieces, setFailedPieces] = useState<number[]>([]);
  const [focusedPiece, setFocusedPiece] = useState<number | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [results, setResults] = useState<MineResult[]>([]);
  const [source, setSource] = useState<{ name: string; size: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const [voiceSample, setVoiceSample] = useState<VoiceSample | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [ownership, setOwnership] = useState<Ownership>(() => ({ ...createOwnership(), mindId: "" }));
  const [keys, setKeys] = useState<ApiKeyEntry[]>([]);
  const keysRef = useRef<ApiKeyEntry[]>([]);
  const [resumeState, setResumeState] = useState<ResumeState | null>(null);
  const fileRefRef = useRef<UploadedFile | null>(null);

  const addLog = useCallback((level: "info" | "warn" | "error", message: string) => {
    const ts = new Date().toLocaleTimeString([], { hour12: false });
    setLog((l) => [...l, `[${ts}] [${level}] ${message}`]);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

  const commitKeys = useCallback((next: ApiKeyEntry[]) => {
    keysRef.current = next;
    setKeys(next);
    void saveApiKeys(next);
  }, []);

  useEffect(() => {
    void (async () => {
      const pool = await loadApiKeys();
      keysRef.current = pool;
      setKeys(pool);
      if (pool.length > 0) setKeyState("valid");
      const saved = await loadResume();
      if (saved) {
        setResumeState(saved);
        fileRefRef.current = saved.fileRef;
      }
    })();
  }, []);


  // Restore the last session from IndexedDB ('evermind' v2) — strictly client side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await idbGet<Record<string, unknown>>(STORES.SESSION, "last");
      const prefs = await idbGet<{ lang?: Language; provider?: string; model?: string }>(STORES.SETTINGS, "prefs");
      const savedOwnership = await idbGet<unknown>(STORES.SETTINGS, "ownership");
      if (cancelled) return;
      if (savedOwnership) setOwnership(normalizeOwnership(savedOwnership));
      if (prefs) {
        if (prefs.lang) setLang(prefs.lang);
        if (prefs.provider) setProvider(prefs.provider);
        if (prefs.model) setModel(prefs.model);
      }
      if (saved) {
        try {
          const mine = parseMineFile(saved);
          setResults(mine.results);
          setChunks(mine.chunks);
          setDuration(mine.source.duration);
          setSource({ name: mine.source.name, size: mine.source.size });
          if (!savedOwnership) setOwnership(mine.ownership);
          setDonePieces(mine.results.length);
          setLog(mine.log);
          if (mine.results.length > 0) {
            setStatus("complete");
            setStatusNote("restored");
            setCurrentPiece(mine.results.length);
          }
        } catch {
          /* ignore malformed cache */
        }
      }
      setOwnership((o) => (o.mindId ? o : { ...o, mindId: newMindId() }));
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void idbSet(STORES.SETTINGS, "prefs", { lang, provider, model });
  }, [hydrated, lang, provider, model]);

  // Monetization / ownership metadata lives in IndexedDB next to the mind data.
  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => void idbSet(STORES.SETTINGS, "ownership", ownership), 400);
    return () => clearTimeout(id);
  }, [hydrated, ownership]);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      void idbSet(
        STORES.SESSION,
        "last",
        buildMineFile({
          source: { name: source?.name ?? "", size: source?.size ?? 0, duration },
          model,
          ownership,
          chunks,
          results,
          log,
        }),
      );
    }, 400);
    return () => clearTimeout(id);
  }, [hydrated, source, duration, model, ownership, chunks, results, log]);

  const t = translations[lang];

  const statusConfig: Record<Status, { label: string; icon: React.ElementType; color: string }> = {
    ready: { label: t.ready, icon: CheckCircle2, color: "text-status-green" },
    processing: { label: t.processing, icon: Loader2, color: "text-status-amber" },
    complete: { label: t.complete, icon: CheckCircle2, color: "text-status-green" },
    error: { label: t.error, icon: AlertCircle, color: "text-status-red" },
    paused: { label: t.paused, icon: PauseCircle, color: "text-status-amber" },

  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setIsDragging(false);
  }, []);

  const acceptFile = useCallback(
    (f: File) => {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(t.tooLarge, { description: `${f.name} · ${formatBytes(f.size)}` });
        addLog("error", `Rejected ${f.name}: ${formatBytes(f.size)} exceeds the 2GB limit`);
        return;
      }
      if (!isAllowedVideo(f)) {
        toast.error(t.badType, { description: `${f.name} · ${f.type || "unknown type"}` });
        addLog("error", `Rejected ${f.name}: unsupported format (${f.type || "unknown"})`);
        return;
      }

      setFile(f);
      setSource({ name: f.name, size: f.size });
      setStatus("ready");
      setStatusNote("noteReady");
      setChunks([]);
      setDuration(null);
      setResolution(null);
      setCurrentPiece(0);
      setDonePieces(0);
      setElapsed(0);
      setResults([]);
      addLog("info", `Loaded ${f.name} (${formatBytes(f.size)})`);

      const url = URL.createObjectURL(f);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const d = video.duration;
        if (video.videoWidth && video.videoHeight) {
          setResolution({ width: video.videoWidth, height: video.videoHeight });
        }
        if (!Number.isFinite(d) || d <= 0) {
          addLog("warn", "Could not read duration from file");
          return;
        }
        const parts = splitIntoChunks(d);
        setDuration(d);
        setChunks(parts);
        addLog("info", `Duration ${formatDuration(d)}`);
        addLog("info", `Split into ${parts.length} piece(s) of up to 5 minutes`);
      };
      video.onerror = () => {
        addLog("warn", "Unsupported or unreadable video file");
        toast.error(t.badType, { description: f.name });
      };
      video.src = url;
    },
    [addLog, t],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files?.[0];
      if (dropped) acceptFile(dropped);
    },
    [acceptFile],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) acceptFile(selected);
    },
    [acceptFile],
  );

  const handleFailure = useCallback(
    (err: unknown) => {
      const message = describeError(err);
      setStatus("error");
      if (err instanceof GeminiError && (err.status === 401 || err.status === 403)) {
        setKeyState("invalid");
        setStatusNote("noteKeyRejected");
      } else if (err instanceof GeminiError && err.status === 429) {
        setStatusNote("noteQuota");
      } else {
        setStatusNote("noteGeneric");
      }
      addLog("error", message);
    },
    [addLog],
  );

  /** Runs `fn` with the first usable key, rotating to backups on 429 / rejected keys. */
  const withRotatingKey = useCallback(
    async <T,>(label: string, fn: (key: string) => Promise<T>): Promise<T> => {
      for (;;) {
        const entry = keysRef.current.find((k) => k.state === "ok");
        if (!entry) throw new QuotaPaused();
        try {
          return await fn(entry.value);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") throw err;
          const quota = isQuotaError(err);
          if (!quota && !isKeyRejected(err)) throw err;
          const next = keysRef.current.map((k) =>
            k.id === entry.id
              ? { ...k, state: quota ? ("exhausted" as const) : ("invalid" as const), exhaustedAt: Date.now() }
              : k,
          );
          commitKeys(next);
          const left = next.filter((k) => k.state === "ok").length;
          addLog(
            "warn",
            `${label}: key ${entry.label} ${quota ? "hit its quota (429)" : "was rejected"} — ${
              left > 0 ? `switching to the next backup key (${left} left)` : "no backup keys left"
            }`,
          );
        }
      }
    },
    [addLog, commitKeys],
  );

  const startMining = useCallback(
    async (startIndex: number, initialRef: UploadedFile | null) => {
      if (chunks.length === 0 || status === "processing") return;
      if (keysRef.current.filter((k) => k.state === "ok").length === 0) {
        setStatus(keysRef.current.length > 0 ? "paused" : "error");
        setStatusNote(keysRef.current.length > 0 ? "notePausedQuota" : "noteNoKey");
        addLog("error", "No usable API key in the rotation pool");
        return;
      }
      if (provider !== "gemini") {
        setStatus("error");
        setStatusNote("noteProviderOnly");
        addLog("error", `Provider "${provider}" is not supported yet`);
        return;
      }
      if (!initialRef && !file) {
        setStatus("error");
        setStatusNote("noteNeedVideo");
        toast.error(t.resumeNeedVideo);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      stopTimer();
      setStatus("processing");
      setStatusNote(startIndex > 0 ? "noteResuming" : "noteUploading");
      if (startIndex === 0) {
        setResults([]);
        setDonePieces(0);
      }
      setFailedPieces([]);
      setFocusedPiece(null);
      setCurrentPiece(startIndex + 1);
      setElapsed(0);
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 250);
      addLog(
        "info",
        startIndex > 0
          ? `Resuming at piece ${startIndex + 1}/${chunks.length} with ${model}`
          : `Mining started — ${chunks.length} piece(s) with ${model}`,
      );

      let uploaded = initialRef;
      let pending = startIndex;
      const checkpoint = (nextIndex: number, reason: ResumeState["reason"]): ResumeState => ({
        fileName: source?.name ?? file?.name ?? "",
        fileSize: source?.size ?? file?.size ?? 0,
        duration,
        model,
        chunks,
        nextIndex,
        fileRef: uploaded,
        reason,
        savedAt: Date.now(),
      });

      try {
        if (!uploaded) {
          uploaded = await withRotatingKey("upload", (key) =>
            uploadVideo(key, file!, {
              signal: controller.signal,
              onState: (s) => addLog("info", `Gemini file state: ${s}`),
            }),
          );
          fileRefRef.current = uploaded;
          addLog("info", `Upload complete: ${uploaded.uri}`);
        } else {
          addLog("info", `Reusing the uploaded video (${uploaded.uri}) — no re-upload needed`);
        }
        setStatusNote("noteMining");

        for (const chunk of chunks) {
          if (chunk.index < startIndex) continue;
          if (controller.signal.aborted) break;
          pending = chunk.index;
          setCurrentPiece(chunk.index + 1);
          addLog(
            "info",
            `Request → piece ${chunk.index + 1}/${chunks.length} (${formatDuration(chunk.start)}–${formatDuration(chunk.end)})`,
          );
          let data;
          try {
            data = await withRotatingKey(`piece ${chunk.index + 1}`, (key) =>
              mineChunk(key, model, uploaded!, chunk.start, chunk.end, controller.signal),
            );
          } catch (chunkErr) {
            if (
              !(chunkErr instanceof DOMException && chunkErr.name === "AbortError") &&
              !(chunkErr instanceof QuotaPaused)
            ) {
              setFailedPieces((f) => (f.includes(chunk.index) ? f : [...f, chunk.index]));
            }
            throw chunkErr;
          }
          addLog(
            "info",
            `Response ← piece ${chunk.index + 1}: ${data.transcript.length} transcript line(s), ${data.scenes.length} scene note(s), ${data.knowledge.length} knowledge point(s)`,
          );
          setResults((r) =>
            [...r.filter((x) => x.index !== chunk.index), { index: chunk.index, chunk, data }].sort(
              (a, b) => a.index - b.index,
            ),
          );
          void recordGrowth({
            beliefs: data.subconsciousness.beliefs.length,
            memories: data.story.beats.length,
            skills: data.subconsciousness.skills.length,
          });
          setDonePieces(chunk.index + 1);
          // Progressive checkpoint: written after every 5-minute chunk.
          const cp = checkpoint(chunk.index + 1, "running");
          setResumeState(chunk.index + 1 < chunks.length ? cp : null);
          if (chunk.index + 1 < chunks.length) await saveResume(cp);
          else await clearResume();
        }

        if (!controller.signal.aborted) {
          stopTimer();
          setStatus("complete");
          setStatusNote("noteComplete");
          addLog("info", "All pieces processed");
          await clearResume();
          setResumeState(null);
          const active = keysRef.current.find((k) => k.state === "ok");
          if (active) void deleteFile(active.value, uploaded.name);
        }
      } catch (err) {
        stopTimer();
        if (err instanceof DOMException && err.name === "AbortError") {
          const cp = checkpoint(pending, "stopped");
          await saveResume(cp);
          setResumeState(cp);
          addLog("warn", `Job cancelled by user — progress saved at piece ${pending + 1}`);
          setStatus("ready");
          setStatusNote("noteReady");
        } else if (err instanceof QuotaPaused) {
          const cp = checkpoint(pending, "quota");
          await saveResume(cp);
          setResumeState(cp);
          setStatus("paused");
          setStatusNote("notePausedQuota");
          addLog(
            "error",
            `All API keys are out of quota — mining paused at piece ${pending + 1}/${chunks.length}. Progress saved.`,
          );
          toast.error(t.pausedQuota, { description: t.pausedQuotaBody });
        } else {
          const cp = checkpoint(pending, "error");
          await saveResume(cp);
          setResumeState(cp);
          handleFailure(err);
        }
      } finally {
        abortRef.current = null;
        stopTimer();
      }
    },
    [
      chunks,
      status,
      provider,
      file,
      model,
      source,
      duration,
      stopTimer,
      addLog,
      handleFailure,
      withRotatingKey,
      t,
    ],
  );

  const handleMine = useCallback(() => {
    void clearResume();
    setResumeState(null);
    fileRefRef.current = null;
    void startMining(0, null);
  }, [startMining]);

  const handleResume = useCallback(() => {
    const state = resumeState;
    if (!state) return;
    void startMining(state.nextIndex, state.fileRef ?? fileRefRef.current);
  }, [resumeState, startMining]);

  const handleDiscardResume = useCallback(() => {
    void clearResume();
    setResumeState(null);
    setStatus("ready");
    setStatusNote("noteReady");
    addLog("info", "Saved mining checkpoint discarded.");
  }, [addLog]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopTimer();
    setStatus("ready");
    setStatusNote("noteReady");
    setCurrentPiece(0);
    addLog("warn", "Job cancelled by user");
  }, [stopTimer, addLog]);

  /** Validates a pasted key and appends it to the rotation pool. */
  const handleSaveKey = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) return;
    if (keysRef.current.some((k) => k.value === key)) {
      toast.error(t.keyDuplicate);
      return;
    }
    setKeyState("checking");
    addLog("info", "Validating API key...");
    try {
      const models = await validateApiKey(key);
      const entry = makeKeyEntry(key, `Key ${keysRef.current.length + 1} · ${maskKey(key)}`);
      commitKeys([...keysRef.current, entry]);
      setApiKey("");
      setKeyState("valid");
      if (status !== "processing") setStatus(status === "paused" ? "ready" : status);
      setStatusNote("noteKeySaved");
      toast.success(t.keyAdded);
      addLog(
        "info",
        `API key valid — ${models.length} model(s) available. Added to the rotation pool (${keysRef.current.length} key(s)).`,
      );
    } catch (err) {
      setKeyState("invalid");
      handleFailure(err);
    }
  }, [apiKey, addLog, handleFailure, commitKeys, t, status]);

  const handleRemoveKey = useCallback(
    (id: string) => {
      commitKeys(keysRef.current.filter((k) => k.id !== id));
      addLog("info", "API key removed from the rotation pool.");
    },
    [commitKeys, addLog],
  );

  const handleResetKeys = useCallback(() => {
    commitKeys(
      keysRef.current.map(({ exhaustedAt: _drop, ...k }) => ({ ...k, state: "ok" as const })),
    );

    if (status === "paused") {
      setStatus("ready");
      setStatusNote("noteReady");
    }
    addLog("info", "All API keys marked available again.");
  }, [commitKeys, addLog, status]);


  const handleExport = useCallback(() => {
    const mine = buildMineFile({
      source: { name: source?.name ?? "mine", size: source?.size ?? 0, duration },
      model,
      ownership,
      chunks,
      results,
      log,
    });
    const filename = downloadMineFile(mine);
    setStatusNote("noteExported");
    addLog("info", `Exported ${results.length} piece(s) to ${filename}`);
  }, [source, duration, model, ownership, chunks, results, log, addLog]);

  const handleExportBrain = useCallback(async () => {
    const brain = await buildAgentBrain({
      source: { name: source?.name ?? "mine", duration },
      results,
      ownership,
    });
    const filename = downloadAgentBrain(brain, source?.name ?? "mine");
    setStatusNote("noteBrainExported");
    addLog(
      "info",
      `Exported agent-ready brain ${brain.mindId} (${brain.subconsciousness.skills.length} skills, ${brain.subconsciousness.beliefs.length} beliefs, ${brain.subconsciousness.decisionLogic.length} decision rules, ${brain.monetization.priceLabel}, signature ${brain.ownership.signature.signature.slice(0, 12)}…) to ${filename}`,
    );
  }, [source, duration, results, ownership, addLog]);

  const handleDeleteSample = useCallback(() => {
    setVoiceSample((s) => {
      if (s) URL.revokeObjectURL(s.url);
      return null;
    });
    addLog("info", "Voice sample deleted from this device.");
  }, [addLog]);

  const handleExtractSample = useCallback(async () => {
    if (!file || voiceBusy) return;
    const windows = results.flatMap((r) => r.data.voiceData);
    // Music-free windows first — the cloning sample must be clean speech.
    const clean = windows.filter((w) => !w.musicPresent);
    const pool = clean.length > 0 ? clean : windows;
    const best =
      pool.find((w) => /excellent/i.test(w.quality)) ?? pool.find((w) => /good/i.test(w.quality)) ?? pool[0];
    const start = best ? (parseTimestamp(best.start) ?? 0) : 0;
    setVoiceBusy(true);
    setVoiceProgress(0);
    addLog("info", `Extracting a 60s voice sample from ${formatDuration(start)} with background music filtered out (local, no upload)...`);
    try {
      const sample = await extractVoiceSample(file, start, 60, { onProgress: setVoiceProgress });
      setVoiceSample((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return sample;
      });
      setStatusNote("noteSampleReady");
      addLog("info", `Voice sample ready (${(sample.size / 1024).toFixed(0)} KB, ${sample.mimeType}${sample.speechFiltered ? ", music filtered" : ""}).`);
    } catch (err) {
      setStatusNote("noteSampleFailed");
      addLog("error", `Voice sample failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setVoiceBusy(false);
    }
  }, [file, voiceBusy, results, addLog]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (importInputRef.current) importInputRef.current.value = "";
      if (!f) return;
      try {
        const mine = parseMineFile(JSON.parse(await f.text()));
        abortRef.current?.abort();
        stopTimer();
        setFile(null);
        setResults(mine.results);
        setChunks(mine.chunks);
        setDuration(mine.source.duration);
        setSource({ name: mine.source.name, size: mine.source.size });
        setOwnership(mine.ownership);
        setDonePieces(mine.results.length);
        setCurrentPiece(mine.results.length);
        setElapsed(0);
        setLog([...mine.log, `[${new Date().toLocaleTimeString([], { hour12: false })}] [info] Imported ${f.name}`]);
        setStatus(mine.results.length > 0 ? "complete" : "ready");
        setStatusNote("noteImported");
        setActiveTab("subtitle");
      } catch (err) {
        setStatus("error");
        setStatusNote("noteImportFailed");
        addLog("error", `Import rejected: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [addLog, stopTimer],
  );

  const removeFile = useCallback(() => {
    abortRef.current?.abort();
    stopTimer();
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setResolution(null);
    setStatus("ready");
    setStatusNote("noteReady");
    setChunks([]);
    setDuration(null);
    setCurrentPiece(0);
    setDonePieces(0);
    setElapsed(0);
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [stopTimer]);

  const totalPieces = chunks.length;
  const progressPct = totalPieces > 0 ? Math.min(100, (donePieces / totalPieces) * 100) : 0;
  const remaining = donePieces > 0 ? (elapsed / donePieces) * (totalPieces - donePieces) : 0;

  const StatusIcon = statusConfig[status].icon;


  // ---- Chunk timeline ----
  type ChunkState = "pending" | "processing" | "done" | "failed";
  const chunkState = (index: number): ChunkState => {
    if (failedPieces.includes(index)) return "failed";
    if (results.some((r) => r.index === index)) return "done";
    if (status === "processing" && index + 1 === currentPiece) return "processing";
    return "pending";
  };
  const focusChunk = (index: number) => {
    setFocusedPiece((cur) => (cur === index ? null : index));
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const isMining = status === "processing";
  const visibleResults = focusedPiece === null ? results : results.filter((r) => r.index === focusedPiece);

  // ---- Transcript tab helpers ----
  type TLine = { timestamp: string; text: string; kind: "speech" | "scene"; speaker?: string; role?: "primary" | "secondary" | "unknown" };
  const transcriptGroups = visibleResults.map((r) => {
    const lines: TLine[] = [
      ...r.data.transcript.map((l) => ({
        timestamp: l.timestamp,
        text: l.speech,
        kind: "speech" as const,
        speaker: l.speaker,
        role: l.role,
      })),
      ...r.data.scenes.map((sc) => ({ timestamp: sc.timestamp, text: sc.description, kind: "scene" as const })),
    ].sort((a, b) => (parseTimestamp(a.timestamp) ?? 0) - (parseTimestamp(b.timestamp) ?? 0));
    return { index: r.index, chunk: r.chunk, lines };
  });
  const query = transcriptQuery.trim().toLowerCase();
  const filteredTranscript = query
    ? transcriptGroups
        .map((g) => ({
          ...g,
          lines: g.lines.filter(
            (l) =>
              l.text.toLowerCase().includes(query) ||
              l.timestamp.toLowerCase().includes(query) ||
              (l.speaker ?? "").toLowerCase().includes(query),
          ),
        }))
        .filter((g) => g.lines.length > 0)
    : transcriptGroups;

  const seekToTimestamp = (ts: string) => {
    const secs = parseTimestamp(ts);
    const el = previewVideoRef.current;
    if (secs === null || !el) return;
    el.currentTime = secs;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    void el.play().catch(() => {});
  };

  const copyAllTranscript = async () => {
    const text = transcriptGroups
      .map((g) => `# ${t.piece} ${g.index + 1} (${formatDuration(g.chunk.start)}-${formatDuration(g.chunk.end)})\n` +
        g.lines
          .map((l) =>
            l.kind === "scene"
              ? `[${l.timestamp}] (${l.text})`
              : `[${l.timestamp}] ${l.speaker ? `${l.speaker}${l.role === "primary" ? " *" : ""}: ` : ""}${l.text}`,
          )
          .join('\n'))
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTranscript(true);
      toast.success(t.copied);
      setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {
      toast.error(t.copyFailed);
    }
  };


  return (
    <div className="dark min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 h-full w-[260px] border-r border-border bg-card transition-transform duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col p-6">
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Brain className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{t.appName}</h1>
                <p className="text-xs text-muted-foreground">{t.tagline}</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t.language}
            </label>
            <div className="flex rounded-lg border border-border bg-muted p-1">
              <button
                onClick={() => setLang("en")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  lang === "en" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                English
              </button>
              <button
                onClick={() => setLang("mn")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  lang === "mn" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Монгол
              </button>
            </div>
          </div>

          <nav className="flex-1">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.quickLinks}</p>
            <ul className="space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <li key={link.key}>
                    <a
                      href={link.href}
                      className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4 transition-colors group-hover:text-primary" />
                        {(t as Record<string, string>)[link.key]}
                      </span>
                      <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-auto rounded-xl border border-border bg-muted p-4">
            <p className="text-xs font-medium text-muted-foreground">{t.appName}</p>
            <p className="mt-1 text-xs text-muted-foreground">v0.1.0</p>
          </div>
        </div>
      </aside>

      {/* Main workspace */}
      <main className="min-h-screen min-w-0 lg:pl-[260px]">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 px-4 py-4 backdrop-blur-md sm:px-6 sm:py-5 lg:px-8 xl:px-10">
          <div className="flex min-w-0 items-center justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t.dashboard}</h2>
                <p className="truncate text-sm text-muted-foreground">{t.tagline}</p>
              </div>
            </div>
            <ModeSwitch lang={lang} />
          </div>
        </header>

        <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8 xl:p-10">
          {/* Status banner */}
          <div className="flex min-w-0 items-center gap-4 rounded-[12px] border border-border bg-card px-4 py-4 sm:px-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
              <StatusIcon
                className={`h-5 w-5 ${statusConfig[status].color} ${status === "processing" ? "animate-spin" : ""}`}
              />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.status}</p>
              <p className={`text-sm font-semibold ${statusConfig[status].color}`}>{statusConfig[status].label}</p>
            </div>
            <div className="ml-auto hidden text-xs text-muted-foreground sm:block">{(t as Record<string, string>)[statusNote] ?? statusNote}</div>

          </div>

          {/* Main grid */}
          <div className="grid min-w-0 gap-6 xl:grid-cols-2">
            {/* API Key Card */}
            <section className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <KeyRound className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{t.apiKey}</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="provider" className="mb-2 block text-sm font-medium text-muted-foreground">
                    {t.provider}
                  </label>
                  <select
                    id="provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="model" className="mb-2 block text-sm font-medium text-muted-foreground">
                    {t.model}
                  </label>
                  <select
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    {MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="api-key" className="mb-2 block text-sm font-medium text-muted-foreground">
                    {t.apiKey}
                  </label>
                  <div className="flex gap-3">
                    <input
                      id="api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setKeyState("none");
                      }}
                      placeholder={t.apiKeyPlaceholder}
                      className="flex-1 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={handleSaveKey}
                      disabled={!apiKey.trim() || keyState === "checking"}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {keyState === "checking" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">{t.saveKey}</span>
                    </button>
                  </div>
                  {keyState !== "none" && (
                    <p
                      className={`mt-2 text-xs font-medium ${
                        keyState === "valid"
                          ? "text-status-green"
                          : keyState === "invalid"
                            ? "text-status-red"
                            : "text-status-amber"
                      }`}
                    >
                      {keyState === "valid"
                        ? t.keyValid
                        : keyState === "invalid"
                          ? t.keyInvalid
                          : t.keyChecking}
                    </p>
                  )}
                </div>

                {/* Rotation pool */}
                <div className="rounded-[12px] border border-border bg-muted/40 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-foreground">
                      {t.keyPool} {keys.length > 0 && <span className="text-muted-foreground">({keys.length})</span>}
                    </h4>
                    {keys.some((k) => k.state !== "ok") && (
                      <button
                        onClick={handleResetKeys}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        <RotateCw className="h-3 w-3" />
                        {t.resetAllKeys}
                      </button>
                    )}
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">{t.keyPoolHint}</p>
                  {keys.length === 0 ? (
                    <p className="text-xs text-muted-foreground/80">{t.keyEmpty}</p>
                  ) : (
                    <ul className="space-y-2">
                      {keys.map((k, i) => (
                        <li
                          key={k.id}
                          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-semibold text-primary">
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                            {maskKey(k.value)}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              k.state === "ok"
                                ? "bg-status-green/10 text-status-green"
                                : k.state === "exhausted"
                                  ? "bg-status-amber/10 text-status-amber"
                                  : "bg-status-red/10 text-status-red"
                            }`}
                          >
                            {k.state === "ok"
                              ? t.keyActive
                              : k.state === "exhausted"
                                ? t.keyExhausted
                                : t.keyRejected}
                          </span>
                          {k.state !== "ok" && (
                            <button
                              onClick={() =>
                                commitKeys(
                                  keysRef.current.map(({ exhaustedAt: _d, ...e }) =>
                                    e.id === k.id ? { ...e, state: "ok" as const } : { ...e },
                                  ),
                                )
                              }
                              aria-label={t.keyReset}
                              title={t.keyReset}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                            >
                              <RotateCw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => handleRemoveKey(k.id)}
                            aria-label={t.keyRemove}
                            title={t.keyRemove}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground/80">
                    <Plus className="h-3 w-3" /> {t.apiKeyPlaceholder}
                  </p>
                </div>


              </div>
            </section>

            {/* Video Upload Card */}
            <section className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Video className="h-4 w-4" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{t.uploadVideo}</h3>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative cursor-pointer rounded-[12px] border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ${
                  isDragging
                    ? "scale-[1.01] border-primary bg-primary/10 ring-4 ring-primary/20"
                    : "border-border bg-muted hover:border-primary/50 hover:bg-muted/80"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleFileSelect}
                  className="sr-only"
                />
                <div
                  className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
                    isDragging ? "bg-primary/20" : "bg-secondary"
                  }`}
                >
                  <Upload
                    className={`h-6 w-6 text-primary transition-transform duration-200 ${
                      isDragging ? "-translate-y-0.5 scale-110" : ""
                    }`}
                  />
                </div>
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? t.dropHere : t.dragDrop}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t.orClick}</p>
                <p className="mt-3 text-xs text-muted-foreground/70">{t.supported}</p>
              </div>

              {file && (
                <div className="mt-4 overflow-hidden rounded-[12px] border border-border bg-muted">
                  {previewUrl && (
                    <video
                      key={previewUrl}
                      ref={previewVideoRef}
                      src={previewUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="aspect-video w-full bg-black"
                    />
                  )}
                  <div className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Video className="h-4 w-4 shrink-0 text-primary" />
                        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                      </div>
                      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                        <div className="flex gap-1.5">
                          <dt>{t.duration}:</dt>
                          <dd className="text-foreground">
                            {duration !== null ? formatDuration(duration) : t.reading}
                          </dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt>{t.resolution}:</dt>
                          <dd className="text-foreground">
                            {resolution ? `${resolution.width} × ${resolution.height}` : t.reading}
                          </dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt>{t.fileSize}:</dt>
                          <dd className="text-foreground">{formatBytes(file.size)}</dd>
                        </div>
                        {chunks.length > 0 && (
                          <div className="flex gap-1.5">
                            <dt>{t.pieces}:</dt>
                            <dd className="text-foreground">{chunks.length}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                    <button
                      onClick={removeFile}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t.removeFile}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleMine}
                disabled={!file || chunks.length === 0 || status === "processing"}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "processing" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t.processing}
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4" />
                    {t.mineVideo}
                  </>
                )}
              </button>
            </section>
          </div>

          {/* Resume banner */}
          {resumeState && status !== "processing" && (
            <section
              className={`min-w-0 rounded-[12px] border p-5 sm:p-6 ${
                status === "paused" ? "border-status-amber/40 bg-status-amber/5" : "border-border bg-card"
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-amber/10 text-status-amber">
                    <PauseCircle className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">
                      {status === "paused" ? t.pausedQuota : t.resumeReady}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {status === "paused"
                        ? t.pausedQuotaBody
                        : `${t.resumeBody} ${resumeState.nextIndex + 1}/${resumeState.chunks.length} — ${resumeState.fileName}`}
                    </p>
                    {!file && <p className="mt-1 text-xs text-status-amber">{t.resumeNeedVideo}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={handleResume}
                    disabled={!file && !resumeState.fileRef}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    {t.resumeMining}
                  </button>
                  <button
                    onClick={handleDiscardResume}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">{t.discardResume}</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Live progress */}

          {(status === "processing" || status === "complete") && totalPieces > 0 && (
            <section className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{t.progress}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t.piece} {currentPiece} {t.of} {totalPieces}
                    </p>
                  </div>
                </div>
                {status === "processing" && (
                  <button
                    onClick={handleStop}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
                  >
                    <Square className="h-3.5 w-3.5" />
                    {t.stop}
                  </button>
                )}
              </div>

              <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>{progressPct.toFixed(0)}%</span>
                <span>
                  {t.elapsed} {formatDuration(elapsed)} · {t.remaining} {formatDuration(remaining)}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150 ease-linear"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="mt-6">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.chunkTimeline}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-secondary" />{t.chunkPending}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-status-blue" />{t.chunkProcessing}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-green" />{t.chunkDone}</span>
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-red" />{t.chunkFailed}</span>
                  </div>
                </div>
                <div className="flex w-full flex-wrap gap-1 overflow-hidden rounded-[12px] border border-border bg-muted p-1">
                  {chunks.map((c) => {
                    const st = chunkState(c.index);
                    const done = st === "done";
                    const styles: Record<string, string> = {
                      pending: "bg-secondary text-muted-foreground",
                      processing: "animate-pulse bg-status-blue/25 text-status-blue ring-1 ring-status-blue/50",
                      done: "bg-status-green/20 text-status-green hover:bg-status-green/30",
                      failed: "bg-status-red/20 text-status-red",
                    };
                    return (
                      <button
                        key={c.index}
                        type="button"
                        onClick={() => done && focusChunk(c.index)}
                        disabled={!done}
                        title={done ? t.openChunkData : `${formatDuration(c.start)} – ${formatDuration(c.end)}`}
                        className={`flex min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[8px] px-2 py-2 text-[11px] font-medium transition-colors ${styles[st]} ${
                          done ? "cursor-pointer" : "cursor-default"
                        } ${focusedPiece === c.index ? "ring-2 ring-primary" : ""}`}
                      >
                        <span className="flex items-center gap-1">
                          {st === "done" && <Check className="h-3 w-3" />}
                          {st === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
                          {st === "failed" && <CircleSlash className="h-3 w-3" />}
                          {t.piece} {c.index + 1}
                        </span>
                        <span className="font-mono text-[10px] opacity-70">
                          {formatDuration(c.start)}–{formatDuration(c.end)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Commercial / Marketplace Settings */}
          <section id="commercial" className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BadgeDollarSign className="h-4 w-4" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{t.commercial}</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="creatorName" className="mb-2 block text-sm text-muted-foreground">{t.creatorName}</label>
                <input
                  id="creatorName"
                  value={ownership.creatorName}
                  onChange={(e) => setOwnership((o) => ({ ...o, creatorName: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                />
              </div>
              <div>
                <label htmlFor="creatorEmail" className="mb-2 block text-sm text-muted-foreground">{t.creatorEmail}</label>
                <input
                  id="creatorEmail"
                  type="email"
                  value={ownership.creatorEmail}
                  onChange={(e) => setOwnership((o) => ({ ...o, creatorEmail: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                />
                {ownership.creatorEmail && !isValidEmail(ownership.creatorEmail) && (
                  <p className="mt-1.5 text-xs text-status-red">{t.invalidEmail}</p>
                )}
              </div>
              <div>
                <label htmlFor="accessLevel" className="mb-2 block text-sm text-muted-foreground">{t.accessLevel}</label>
                <select
                  id="accessLevel"
                  value={ownership.accessLevel}
                  onChange={(e) =>
                    setOwnership((o) => ({ ...o, accessLevel: e.target.value as Ownership["accessLevel"] }))
                  }
                  className="w-full rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                >
                  <option value="private">{t.accessPrivate}</option>
                  <option value="marketplace">{t.accessMarketplace}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3">
                <div className="col-span-1">
                  <label htmlFor="rate" className="mb-2 block text-sm text-muted-foreground">{t.rate}</label>
                  <input
                    id="rate"
                    type="number"
                    min={0}
                    step="0.01"
                    value={ownership.rate}
                    onChange={(e) => setOwnership((o) => ({ ...o, rate: Math.max(0, Number(e.target.value) || 0) }))}
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  />
                </div>
                <div className="col-span-1">
                  <label htmlFor="currency" className="mb-2 block text-sm text-muted-foreground">{t.currency}</label>
                  <input
                    id="currency"
                    value={ownership.currency}
                    onChange={(e) => setOwnership((o) => ({ ...o, currency: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="rateUnit" className="mb-2 block text-sm text-muted-foreground">{t.rateUnit}</label>
                  <select
                    id="rateUnit"
                    value={ownership.rateUnit}
                    onChange={(e) =>
                      setOwnership((o) => ({ ...o, rateUnit: e.target.value as Ownership["rateUnit"] }))
                    }
                    className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  >
                    <option value="query">{t.perQuery}</option>
                    <option value="hour">{t.perHour}</option>
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="license" className="mb-2 block text-sm text-muted-foreground">{t.licenseTerms}</label>
                <textarea
                  id="license"
                  rows={3}
                  value={ownership.licenseTerms}
                  onChange={(e) => setOwnership((o) => ({ ...o, licenseTerms: e.target.value || DEFAULT_LICENSE }))}
                  className="w-full resize-y rounded-lg border border-border bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-colors focus:border-primary"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{t.mindId}</span>
              <code className="rounded-md bg-muted px-2.5 py-1 font-mono text-xs text-primary">{ownership.mindId}</code>
              <button
                onClick={() => {
                  const mindId = newMindId();
                  setOwnership((o) => ({ ...o, mindId }));
                  addLog("info", `New mind ID generated: ${mindId}`);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Fingerprint className="h-3.5 w-3.5" />
                {t.regenerateId}
              </button>
              <p className="text-xs text-muted-foreground sm:ml-auto sm:max-w-[320px]">{t.commercialHint}</p>
            </div>
          </section>

          {/* Results Area */}
          <AnalyticsPanel lang={lang} ownership={ownership} />

          <section ref={resultsRef} id="results" className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{t.results}</h3>
            </div>

            <div className="mb-4 flex w-full min-w-0 gap-1 overflow-x-auto rounded-lg border border-border bg-muted p-1 [scrollbar-width:thin]">
              {(
                [
                  { id: "subtitle", label: t.tabSubtitle, icon: ScrollText },
                  { id: "story", label: t.tabStory, icon: BookOpen },
                  { id: "face", label: t.tabFace, icon: ScanFace },
                  { id: "voice", label: t.tabVoice, icon: AudioLines },
                  { id: "brain", label: t.tabBrain, icon: Brain },
                  { id: "studio", label: BRAIN_STUDIO_TAB_LABEL[lang], icon: Sparkles },
                  { id: "cloud", label: CLOUD_HUB_TAB_LABEL[lang], icon: Cloud },
                  { id: "log", label: t.appLog, icon: Terminal },
                ] as { id: Tab; label: string; icon: typeof Brain }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors sm:text-sm ${
                    activeTab === tab.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {focusedPiece !== null && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-[12px] border border-primary/40 bg-primary/10 px-4 py-2.5 text-xs text-foreground">
                <span>
                  {t.showingPiece} {focusedPiece + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setFocusedPiece(null)}
                  className="font-medium text-primary hover:underline"
                >
                  {t.showAllPieces}
                </button>
              </div>
            )}

            <div className="min-h-[220px] min-w-0 break-words rounded-[12px] border border-border bg-muted p-4 sm:p-5">
              {activeTab === "subtitle" && (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:max-w-xs">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="search"
                        value={transcriptQuery}
                        onChange={(e) => setTranscriptQuery(e.target.value)}
                        placeholder={t.searchTranscript}
                        aria-label={t.searchTranscript}
                        className="w-full rounded-[12px] border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={copyAllTranscript}
                      disabled={results.length === 0}
                      className="inline-flex items-center justify-center gap-2 rounded-[12px] border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {copiedTranscript ? <Check className="h-4 w-4 text-status-green" /> : <Copy className="h-4 w-4" />}
                      {t.copyAll}
                    </button>
                  </div>

                  {results.length === 0 ? (
                    isMining ? (
                    <TabSkeleton rows={4} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noTranscript}</p>
                  )
                  ) : filteredTranscript.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.noMatches}</p>
                  ) : (
                    filteredTranscript.map((r) => (
                      <div key={r.index}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">
                          {t.piece} {r.index + 1} · {formatDuration(r.chunk.start)}–{formatDuration(r.chunk.end)}
                        </p>
                        {(results.find((x) => x.index === r.index)?.data.speakers ?? []).length > 0 && (
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">{t.speakers}:</span>
                            {(results.find((x) => x.index === r.index)?.data.speakers ?? []).map((sp, i) => (
                              <span
                                key={i}
                                title={sp.description}
                                className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-xs ${
                                  sp.role === "primary"
                                    ? "border-primary/50 bg-primary/15 text-primary"
                                    : sp.role === "secondary"
                                      ? "border-status-blue/50 bg-status-blue/15 text-status-blue"
                                      : "border-border bg-background text-muted-foreground"
                                }`}
                              >
                                {sp.label}
                                <span className="opacity-70">
                                  ·{" "}
                                  {sp.role === "primary"
                                    ? t.primaryOwner
                                    : sp.role === "secondary"
                                      ? t.secondarySpeaker
                                      : t.unknownSpeaker}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="space-y-1.5">
                          {r.lines.map((line, i) => (
                            <p
                              key={`t${i}`}
                              className={`text-sm leading-relaxed ${line.kind === "scene" ? "italic text-muted-foreground" : "text-foreground"}`}
                            >
                              <button
                                type="button"
                                onClick={() => seekToTimestamp(line.timestamp)}
                                title={t.jumpTo}
                                className="mr-2 inline-flex items-center rounded-[6px] border border-border bg-background px-1.5 py-0.5 font-mono text-xs not-italic text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={!previewUrl}
                              >
                                {line.timestamp}
                              </button>
                              {line.kind === "speech" && line.speaker && (
                                <span
                                  className={`mr-2 inline-flex items-center rounded-[6px] border px-1.5 py-0.5 text-xs font-medium not-italic ${
                                    line.role === "primary"
                                      ? "border-primary/50 bg-primary/15 text-primary"
                                      : line.role === "secondary"
                                        ? "border-status-blue/50 bg-status-blue/15 text-status-blue"
                                        : "border-border bg-background text-muted-foreground"
                                  }`}
                                  title={
                                    line.role === "primary"
                                      ? t.primaryOwner
                                      : line.role === "secondary"
                                        ? t.secondarySpeaker
                                        : t.unknownSpeaker
                                  }
                                >
                                  {line.speaker}
                                </span>
                              )}
                              {line.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))
                  )}

                  {isMining && results.length > 0 && <TabSkeleton rows={4} groups={1} />}
                </div>
              )}

              {activeTab === "story" && (
                <div className="space-y-5">
                  {results.length === 0 ? (
                    isMining ? (
                    <TabSkeleton rows={3} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noStory}</p>
                  )
                  ) : (
                    visibleResults.map((r) => (
                      <div key={r.index}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">
                          {t.piece} {r.index + 1} · {formatDuration(r.chunk.start)}–{formatDuration(r.chunk.end)}
                        </p>
                        {r.data.story.summary && (
                          <p className="text-sm leading-relaxed text-foreground">{r.data.story.summary}</p>
                        )}
                        {r.data.story.tone && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {t.tone}: <span className="text-status-amber">{r.data.story.tone}</span>
                          </p>
                        )}
                        {r.data.story.beats.length > 0 && (
                          <div className="mt-3 space-y-1.5 border-l border-border pl-4">
                            {r.data.story.beats.map((b, i) => (
                              <p key={i} className="text-sm leading-relaxed text-foreground">
                                <span className="mr-2 font-mono text-xs text-muted-foreground">[{b.timestamp}]</span>
                                {b.event}
                                {b.emotion && <span className="ml-2 text-xs italic text-muted-foreground">({b.emotion})</span>}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {isMining && results.length > 0 && <TabSkeleton rows={3} groups={1} />}
                </div>
              )}

              {activeTab === "face" && (
                <div className="space-y-5">
                  {results.length === 0 ? (
                    isMining ? (
                    <TabSkeleton rows={3} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noFace}</p>
                  )
                  ) : (
                    visibleResults.map((r) => (
                      <div key={r.index}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">
                          {t.piece} {r.index + 1} · {formatDuration(r.chunk.start)}–{formatDuration(r.chunk.end)}
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {r.data.faceData.map((f, i) => (
                            <div key={i} className="rounded-[12px] border border-border bg-card p-4">
                              <p className="font-mono text-xs text-muted-foreground">[{f.timestamp}]</p>
                              <p className="mt-1 text-sm italic leading-relaxed text-foreground">{f.description}</p>
                              <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                                {f.gestures && <div>{t.gestures}: <span className="text-foreground">{f.gestures}</span></div>}
                                {f.lighting && <div>{t.lighting}: <span className="text-foreground">{f.lighting}</span></div>}
                                {f.faceAngle && <div>{t.faceAngle}: <span className="text-foreground">{f.faceAngle}</span></div>}
                                {f.cloneQuality && (
                                  <div>
                                    {t.cloneQuality}: <span className="text-status-green">{f.cloneQuality}</span>
                                  </div>
                                )}
                              </dl>
                              {f.isKeyAction && (
                                <div className="mt-3 border-t border-border pt-3">
                                  <p className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                                    <span className="inline-flex items-center gap-1 rounded-[6px] border border-status-amber/50 bg-status-amber/15 px-2 py-0.5 font-medium text-status-amber">
                                      <Film className="h-3 w-3" />
                                      {t.keyAction}
                                    </span>
                                    {f.actionType && <span className="text-foreground">{f.actionType}</span>}
                                  </p>
                                  {previewUrl ? (
                                    <ActionClip
                                      src={previewUrl}
                                      start={f.clipStart || f.timestamp}
                                      end={f.clipEnd || f.timestamp}
                                      label={t.playClip}
                                    />
                                  ) : (
                                    <p className="text-xs text-status-amber">{t.needVideoForClip}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}

                  {isMining && results.length > 0 && <TabSkeleton rows={3} groups={1} />}
                </div>
              )}

              {activeTab === "voice" && (
                <div className="space-y-5">
                  <div className="rounded-[12px] border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={handleExtractSample}
                        disabled={!file || voiceBusy}
                        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {voiceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AudioLines className="h-4 w-4" />}
                        {voiceBusy ? `${t.extracting} ${Math.round(voiceProgress)}s` : t.extractSample}
                      </button>
                      {!file && <p className="text-xs text-status-amber">{t.needVideoForSample}</p>}
                      <p className="text-xs text-muted-foreground sm:ml-auto">{t.voiceHint}</p>
                    </div>

                    <div className="mt-4">
                      {voiceSample ? (
                        <div className="space-y-3">
                          <audio controls src={voiceSample.url} className="w-full" />
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-xs text-muted-foreground">
                              {t.sampleReady} · {formatDuration(voiceSample.start)} → +{Math.round(voiceSample.duration)}s ·{" "}
                              {(voiceSample.size / 1024).toFixed(0)} KB
                            </span>
                            {voiceSample.speechFiltered && (
                              <span className="rounded-md border border-status-green/40 bg-status-green/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-green">
                                {t.speechFiltered}
                              </span>
                            )}
                            <button
                              onClick={() => downloadVoiceSample(voiceSample)}
                              className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {t.downloadSample}
                            </button>
                            <button
                              onClick={handleDeleteSample}
                              className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-status-red transition-colors hover:border-status-red/50"
                            >
                              <X className="h-3.5 w-3.5" />
                              {t.deleteSample}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">{t.noSample}</p>
                      )}
                    </div>
                  </div>

                  {results.length === 0 ? (
                    isMining ? (
                    <TabSkeleton rows={2} groups={1} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noVoice}</p>
                  )
                  ) : (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">{t.voiceWindows}</p>
                      <div className="space-y-1.5">
                        {visibleResults.flatMap((r) =>
                          r.data.voiceData.map((w, i) => (
                            <p key={`${r.index}-${i}`} className="text-sm leading-relaxed text-foreground">
                              <span className="mr-2 font-mono text-xs text-muted-foreground">
                                [{w.start}–{w.end}]
                              </span>
                              <span className="text-status-green">{w.quality}</span>
                              <span
                                className={`ml-2 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  w.musicPresent
                                    ? "border-status-amber/40 bg-status-amber/10 text-status-amber"
                                    : "border-status-green/40 bg-status-green/10 text-status-green"
                                }`}
                              >
                                {w.musicPresent ? t.musicPresent : t.cleanSpeech}
                              </span>
                              {w.note && <span className="ml-2 text-muted-foreground">— {w.note}</span>}
                            </p>
                          )),
                        )}
                      </div>
                    </div>
                  )}

                  <AudioAtmosphere results={visibleResults} t={t} />
                </div>
              )}

              {activeTab === "brain" && (
                <div className="space-y-5">
                  {results.length === 0 ? (
                    isMining ? (
                    <TabSkeleton rows={3} groups={3} />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noBrain}</p>
                  )
                  ) : (
                    (
                      [
                        { key: "skills", label: t.skills },
                        { key: "beliefs", label: t.beliefs },
                        { key: "decisionLogic", label: t.decisionLogic },
                        { key: "aestheticProfile", label: t.aestheticProfile },
                        { key: "expressiveStyle", label: t.expressiveStyle },
                      ] as const
                    ).map((group) => {
                      const items = Array.from(
                        new Set(visibleResults.flatMap((r) => r.data.subconsciousness[group.key] ?? []).filter(Boolean)),
                      );
                      return (
                        <div key={group.key}>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">{group.label}</p>
                          {items.length === 0 ? (
                            <p className="text-sm text-muted-foreground">—</p>
                          ) : (
                            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
                              {items.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })
                  )}

                  {results.length > 0 && <CulturalVocabulary results={visibleResults} t={t} />}

                  {isMining && results.length > 0 && <TabSkeleton rows={2} groups={1} />}
                </div>
              )}

              {activeTab === "studio" && (
                <BrainStudio
                  lang={lang}
                  results={results}
                  previewUrl={previewUrl}
                  onLog={(m) => addLog("info", m)}
                  onRemine={handleMine}
                  canRemine={Boolean(file) && keyState === "valid" && !isMining}
                />
              )}

              {activeTab === "cloud" && (
                <CloudStorageHub
                  lang={lang}
                  results={results}
                  sourceName={file?.name ?? null}
                  sourceSize={file?.size ?? null}
                  onLog={(m) => addLog("info", m)}
                />
              )}

              {activeTab === "log" && (
                <div className="font-mono text-xs leading-relaxed text-muted-foreground">
                  <p>[system] Evermine initialized</p>
                  {log.length === 0 && <p>[system] Waiting for video input...</p>}
                  {log.map((line, i) => (
                    <p
                      key={i}
                      className={
                        line.includes("[error]")
                          ? "text-status-red"
                          : line.includes("[warn]")
                            ? "text-status-amber"
                            : ""
                      }
                    >
                      {line}
                    </p>
                  ))}
                  {status === "processing" && (
                    <p className="text-status-amber">
                      [info] Processing piece {currentPiece} of {totalPieces}...
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                onClick={handleExport}
                disabled={results.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {t.saveMine}
              </button>
              <button
                onClick={handleExportBrain}
                disabled={results.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {t.exportBrain}
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <FolderOpen className="h-4 w-4" />
                {t.openMine}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImport}
                className="sr-only"
              />
              <p className="text-xs text-muted-foreground sm:ml-auto sm:max-w-[320px]">{t.localOnly}</p>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
