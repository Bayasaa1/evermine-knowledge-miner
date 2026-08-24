import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { splitIntoChunks, formatDuration, type Chunk } from "@/lib/chunking";
import { loadApiKey, saveApiKey } from "@/lib/keystore";
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
  BookOpen,
  ScanFace,
  AudioLines,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Evermine — Dashboard" },
      { name: "description", content: "Evermine dashboard: configure your API key, upload a video, and mine structured knowledge." },
      { property: "og:title", content: "Evermine — Dashboard" },
      { property: "og:description", content: "Configure your API key, upload a video, and mine structured knowledge." },
    ],
  }),
  component: Index,
});

type Status = "ready" | "processing" | "complete" | "error";
type Language = "en" | "mn";
type Tab = "subtitle" | "story" | "face" | "voice" | "brain" | "log";

const translations = {
  en: {
    appName: "Evermine",
    tagline: "A life becomes a mind.",
    language: "Language",
    quickLinks: "Quick Links",
    apiKey: "API Key",
    provider: "Provider",
    apiKeyPlaceholder: "Paste your API key here",
    saveKey: "Save Key",
    uploadVideo: "Upload Video",
    dragDrop: "Drag and drop a video file here",
    orClick: "or click to browse",
    supported: "MP4, MOV, WebM up to 2GB",
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
    noLog: "Application logs will appear here.",
    dashboard: "Dashboard",
    settings: "Settings",
    history: "History",
    help: "Help",
    removeFile: "Remove file",
    progress: "Mining Progress",
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
    tone: "Emotional tone",
    timeline: "Timeline",
    gestures: "Gestures",
    lighting: "Lighting",
    faceAngle: "Face angle",
    cloneQuality: "Clone quality",
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
  },
  mn: {
    appName: "Evermine",
    tagline: "Амьдрал оюун болдог.",
    language: "Хэл",
    quickLinks: "Түлхүүр холбоос",
    apiKey: "API түлхүүр",
    provider: "Нийлүүлэгч",
    apiKeyPlaceholder: "API түлхүүрээ энд наана уу",
    saveKey: "Түлхүүр хадгалах",
    uploadVideo: "Видео оруулах",
    dragDrop: "Видео файлыг энд чирнэ үү",
    orClick: "эсвэл хайхаар дарна уу",
    supported: "MP4, MOV, WebM 2GB хүртэл",
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
    noLog: "Аппликэйшн бүртгэл энд харуулна.",
    dashboard: "Хяналтын самбар",
    settings: "Тохиргоо",
    history: "Түүх",
    help: "Тусламж",
    removeFile: "Файл устгах",
    progress: "Боловсруулалтын явц",
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
    tone: "Сэтгэл хөдлөлийн өнгө",
    timeline: "Цаг хугацааны дараалал",
    gestures: "Дохио зангаа",
    lighting: "Гэрэлтүүлэг",
    faceAngle: "Царайны өнцөг",
    cloneQuality: "Хуулбарлах чанар",
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
  },
};

const navLinks = [
  { key: "dashboard", icon: Brain, href: "#" },
  { key: "history", icon: ScrollText, href: "#" },
  { key: "settings", icon: KeyRound, href: "#" },
  { key: "help", icon: Globe, href: "#" },
];

const MODELS = [
  { value: "gemini-2.5-flash", label: "gemini-2.5-flash (recommended)" },
  { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
  { value: "gemini-1.5-flash", label: "gemini-1.5-flash" },
  { value: "gemini-1.5-pro", label: "gemini-1.5-pro" },
];

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentPiece, setCurrentPiece] = useState(0);
  const [donePieces, setDonePieces] = useState(0);
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

  useEffect(() => {
    loadApiKey().then((k) => {
      if (k) {
        setApiKey(k);
        setKeyState("valid");
      }
    });
  }, []);

  // Restore the last session from IndexedDB ('evermind' v2) — strictly client side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await idbGet<Record<string, unknown>>(STORES.SESSION, "last");
      const prefs = await idbGet<{ lang?: Language; provider?: string; model?: string }>(STORES.SETTINGS, "prefs");
      if (cancelled) return;
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

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => {
      void idbSet(
        STORES.SESSION,
        "last",
        buildMineFile({
          source: { name: source?.name ?? "", size: source?.size ?? 0, duration },
          model,
          chunks,
          results,
          log,
        }),
      );
    }, 400);
    return () => clearTimeout(id);
  }, [hydrated, source, duration, model, chunks, results, log]);

  const t = translations[lang];

  const statusConfig: Record<Status, { label: string; icon: React.ElementType; color: string }> = {
    ready: { label: t.ready, icon: CheckCircle2, color: "text-status-green" },
    processing: { label: t.processing, icon: Loader2, color: "text-status-amber" },
    complete: { label: t.complete, icon: CheckCircle2, color: "text-status-green" },
    error: { label: t.error, icon: AlertCircle, color: "text-status-red" },
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const acceptFile = useCallback(
    (f: File) => {
      setFile(f);
      setSource({ name: f.name, size: f.size });
      setStatus("ready");
      setStatusNote("noteReady");
      setChunks([]);
      setDuration(null);
      setCurrentPiece(0);
      setDonePieces(0);
      setElapsed(0);
      setResults([]);
      addLog("info", `Loaded ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)`);

      const url = URL.createObjectURL(f);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const d = video.duration;
        URL.revokeObjectURL(url);
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
        URL.revokeObjectURL(url);
        addLog("warn", "Unsupported or unreadable video file");
      };
      video.src = url;
    },
    [addLog],
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

  const handleMine = useCallback(async () => {
    if (!file || chunks.length === 0 || status === "processing") return;
    if (!apiKey.trim()) {
      setStatus("error");
      setStatusNote("noteNoKey");
      addLog("error", "No API key configured");
      return;
    }
    if (provider !== "gemini") {
      setStatus("error");
      setStatusNote("noteProviderOnly");
      addLog("error", `Provider "${provider}" is not supported yet`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    stopTimer();
    setStatus("processing");
    setStatusNote("noteUploading");
    setResults([]);
    setCurrentPiece(1);
    setDonePieces(0);
    setElapsed(0);
    startedAtRef.current = Date.now();
    timerRef.current = setInterval(() => setElapsed((Date.now() - startedAtRef.current) / 1000), 250);
    addLog("info", `Mining started — ${chunks.length} piece(s) with ${model}`);

    try {
      const uploaded = await uploadVideo(apiKey, file, {
        signal: controller.signal,
        onState: (s) => addLog("info", `Gemini file state: ${s}`),
      });
      addLog("info", `Upload complete: ${uploaded.uri}`);
      setStatusNote("noteMining");

      for (const chunk of chunks) {
        if (controller.signal.aborted) break;
        setCurrentPiece(chunk.index + 1);
        addLog(
          "info",
          `Request → piece ${chunk.index + 1}/${chunks.length} (${formatDuration(chunk.start)}–${formatDuration(chunk.end)})`,
        );
        const data = await mineChunk(apiKey, model, uploaded, chunk.start, chunk.end, controller.signal);
        addLog(
          "info",
          `Response ← piece ${chunk.index + 1}: ${data.transcript.length} transcript line(s), ${data.scenes.length} scene note(s), ${data.knowledge.length} knowledge point(s)`,
        );
        setResults((r) => [...r, { index: chunk.index, chunk, data }]);
        setDonePieces(chunk.index + 1);
      }

      if (!controller.signal.aborted) {
        stopTimer();
        setStatus("complete");
        setStatusNote("noteComplete");
        addLog("info", "All pieces processed");
        void deleteFile(apiKey, uploaded.name);
      }
    } catch (err) {
      stopTimer();
      if (err instanceof DOMException && err.name === "AbortError") {
        addLog("warn", "Job cancelled by user");
        setStatus("ready");
        setStatusNote("noteReady");
      } else {
        handleFailure(err);
      }
    } finally {
      abortRef.current = null;
      stopTimer();
    }
  }, [file, chunks, status, apiKey, provider, model, stopTimer, addLog, handleFailure]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopTimer();
    setStatus("ready");
    setStatusNote("noteReady");
    setCurrentPiece(0);
    addLog("warn", "Job cancelled by user");
  }, [stopTimer, addLog]);

  const handleSaveKey = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) return;
    setKeyState("checking");
    addLog("info", "Validating API key...");
    try {
      const models = await validateApiKey(key);
      await saveApiKey(key);
      setKeyState("valid");
      setStatus("ready");
      setStatusNote("noteKeySaved");
      addLog("info", `API key valid — ${models.length} model(s) available. Key saved to IndexedDB.`);
    } catch (err) {
      setKeyState("invalid");
      handleFailure(err);
    }
  }, [apiKey, addLog, handleFailure]);

  const handleExport = useCallback(() => {
    const mine = buildMineFile({
      source: { name: source?.name ?? "mine", size: source?.size ?? 0, duration },
      model,
      chunks,
      results,
      log,
    });
    const filename = downloadMineFile(mine);
    setStatusNote("noteExported");
    addLog("info", `Exported ${results.length} piece(s) to ${filename}`);
  }, [source, duration, model, chunks, results, log, addLog]);

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
    const best =
      windows.find((w) => /excellent/i.test(w.quality)) ?? windows.find((w) => /good/i.test(w.quality)) ?? windows[0];
    const start = best ? (parseTimestamp(best.start) ?? 0) : 0;
    setVoiceBusy(true);
    setVoiceProgress(0);
    addLog("info", `Extracting a 60s voice sample from ${formatDuration(start)} (local, no upload)...`);
    try {
      const sample = await extractVoiceSample(file, start, 60, { onProgress: setVoiceProgress });
      setVoiceSample((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return sample;
      });
      setStatusNote("noteSampleReady");
      addLog("info", `Voice sample ready (${(sample.size / 1024).toFixed(0)} KB, ${sample.mimeType}).`);
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


  return (
    <div className="dark min-h-screen bg-background text-foreground">
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
      <main className="min-h-screen lg:pl-[260px]">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b border-border bg-background/80 px-6 py-5 backdrop-blur-md lg:px-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t.dashboard}</h2>
                <p className="text-sm text-muted-foreground">{t.tagline}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-6 p-6 lg:p-10">
          {/* Status banner */}
          <div className="flex items-center gap-4 rounded-[12px] border border-border bg-card px-5 py-4">
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
          <div className="grid gap-6 xl:grid-cols-2">
            {/* API Key Card */}
            <section className="rounded-[12px] border border-border bg-card p-6">
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

              </div>
            </section>

            {/* Video Upload Card */}
            <section className="rounded-[12px] border border-border bg-card p-6">
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
                className={`relative cursor-pointer rounded-[12px] border-2 border-dashed border-border bg-muted px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/80 ${
                  isDragging ? "border-primary bg-primary/5" : ""
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleFileSelect}
                  className="sr-only"
                />
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground">{t.dragDrop}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.orClick}</p>
                <p className="mt-3 text-xs text-muted-foreground/70">{t.supported}</p>
              </div>

              {file && (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-muted px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Video className="h-4 w-4 shrink-0 text-primary" />
                    <p className="truncate text-sm text-foreground">{file.name}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    {duration !== null && (
                      <span className="hidden text-xs text-muted-foreground whitespace-nowrap sm:inline">
                        · {formatDuration(duration)} · {chunks.length} {t.pieces}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={removeFile}
                    className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t.removeFile}
                  >
                    <X className="h-4 w-4" />
                  </button>
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

          {/* Live progress */}
          {(status === "processing" || status === "complete") && totalPieces > 0 && (
            <section className="rounded-[12px] border border-border bg-card p-6">
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

              <div className="mt-5 flex flex-wrap gap-1.5">
                {chunks.map((c) => (
                  <span
                    key={c.index}
                    title={`${formatDuration(c.start)} – ${formatDuration(c.end)}`}
                    className={`h-1.5 flex-1 min-w-[10px] rounded-full ${
                      c.index + 1 < currentPiece || status === "complete"
                        ? "bg-status-green"
                        : c.index + 1 === currentPiece
                          ? "bg-status-amber"
                          : "bg-secondary"
                    }`}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Results Area */}
          <section className="rounded-[12px] border border-border bg-card p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">{t.results}</h3>
            </div>

            <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-border bg-muted p-1">
              {(
                [
                  { id: "subtitle", label: t.tabSubtitle, icon: ScrollText },
                  { id: "story", label: t.tabStory, icon: BookOpen },
                  { id: "face", label: t.tabFace, icon: ScanFace },
                  { id: "voice", label: t.tabVoice, icon: AudioLines },
                  { id: "brain", label: t.tabBrain, icon: Brain },
                  { id: "log", label: t.appLog, icon: Terminal },
                ] as { id: Tab; label: string; icon: typeof Brain }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
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

            <div className="min-h-[220px] rounded-[12px] border border-border bg-muted p-5">
              {activeTab === "subtitle" && (
                <div className="space-y-5">
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.noTranscript}</p>
                  ) : (
                    results.map((r) => (
                      <div key={r.index}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">
                          {t.piece} {r.index + 1} · {formatDuration(r.chunk.start)}–{formatDuration(r.chunk.end)}
                        </p>
                        <div className="space-y-1.5">
                          {r.data.transcript.map((line, i) => (
                            <p key={`t${i}`} className="text-sm leading-relaxed text-foreground">
                              <span className="mr-2 font-mono text-xs text-muted-foreground">[{line.timestamp}]</span>
                              {line.speech}
                            </p>
                          ))}
                          {r.data.scenes.map((s, i) => (
                            <p key={`s${i}`} className="text-sm italic leading-relaxed text-muted-foreground">
                              <span className="mr-2 font-mono text-xs not-italic">[{s.timestamp}]</span>
                              {s.description}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "story" && (
                <div className="space-y-5">
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.noStory}</p>
                  ) : (
                    results.map((r) => (
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
                </div>
              )}

              {activeTab === "face" && (
                <div className="space-y-5">
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.noFace}</p>
                  ) : (
                    results.map((r) => (
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
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
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
                    <p className="text-sm text-muted-foreground">{t.noVoice}</p>
                  ) : (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-primary">{t.voiceWindows}</p>
                      <div className="space-y-1.5">
                        {results.flatMap((r) =>
                          r.data.voiceData.map((w, i) => (
                            <p key={`${r.index}-${i}`} className="text-sm leading-relaxed text-foreground">
                              <span className="mr-2 font-mono text-xs text-muted-foreground">
                                [{w.start}–{w.end}]
                              </span>
                              <span className="text-status-green">{w.quality}</span>
                              {w.note && <span className="ml-2 text-muted-foreground">— {w.note}</span>}
                            </p>
                          )),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "brain" && (
                <div className="space-y-5">
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t.noBrain}</p>
                  ) : (
                    (
                      [
                        { key: "skills", label: t.skills },
                        { key: "beliefs", label: t.beliefs },
                        { key: "decisionLogic", label: t.decisionLogic },
                      ] as const
                    ).map((group) => {
                      const items = Array.from(
                        new Set(results.flatMap((r) => r.data.subconsciousness[group.key]).filter(Boolean)),
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
                </div>
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
