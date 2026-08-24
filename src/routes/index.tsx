import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { splitIntoChunks, formatDuration, type Chunk } from "@/lib/chunking";
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
type Tab = "knowledge" | "transcript" | "log";

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
    transcript: "Гарчиг",
    appLog: "Аппликэйшн бүртгэл",
    noResults: "Боловсруулалт эхэлсний дараа энд харуулна.",
    noTranscript: "Боловсруулалт дууссаны дараа гарчиг энд харуулна.",
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
  },
};

const navLinks = [
  { key: "dashboard", icon: Brain, href: "#" },
  { key: "history", icon: ScrollText, href: "#" },
  { key: "settings", icon: KeyRound, href: "#" },
  { key: "help", icon: Globe, href: "#" },
];

function Index() {
  const [lang, setLang] = useState<Language>("en");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [provider, setProvider] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<Status>("ready");
  const [activeTab, setActiveTab] = useState<Tab>("knowledge");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [currentPiece, setCurrentPiece] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  const SIM_SECONDS_PER_PIECE = 2;

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stopTimer, [stopTimer]);

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

  const acceptFile = useCallback((f: File) => {
    setFile(f);
    setStatus("ready");
    setChunks([]);
    setDuration(null);
    setCurrentPiece(0);
    setElapsed(0);
    setLog([`[info] Loaded ${f.name}`]);

    const url = URL.createObjectURL(f);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(url);
      if (!Number.isFinite(d) || d <= 0) {
        setLog((l) => [...l, "[warn] Could not read duration from file"]);
        return;
      }
      const parts = splitIntoChunks(d);
      setDuration(d);
      setChunks(parts);
      setLog((l) => [
        ...l,
        `[info] Duration ${formatDuration(d)}`,
        `[info] Split into ${parts.length} piece(s) of up to 5 minutes`,
      ]);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      setLog((l) => [...l, "[warn] Unsupported or unreadable video file"]);
    };
    video.src = url;
  }, []);

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

  const handleMine = useCallback(() => {
    if (!file || chunks.length === 0) return;
    stopTimer();
    setStatus("processing");
    setCurrentPiece(1);
    setElapsed(0);
    startedAtRef.current = Date.now();
    setLog((l) => [...l, `[info] Mining started — ${chunks.length} piece(s)`]);

    const totalMs = chunks.length * SIM_SECONDS_PER_PIECE * 1000;
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startedAtRef.current;
      setElapsed(ms / 1000);
      const piece = Math.min(chunks.length, Math.floor(ms / (SIM_SECONDS_PER_PIECE * 1000)) + 1);
      setCurrentPiece(piece);
      if (ms >= totalMs) {
        stopTimer();
        setCurrentPiece(chunks.length);
        setElapsed(totalMs / 1000);
        setStatus("complete");
        setLog((l) => [...l, "[info] All pieces processed", "[info] Knowledge extraction complete"]);
      }
    }, 100);
  }, [file, chunks, stopTimer]);

  const handleStop = useCallback(() => {
    stopTimer();
    setStatus("ready");
    setCurrentPiece(0);
    setElapsed(0);
    setLog((l) => [...l, "[warn] Job cancelled by user"]);
  }, [stopTimer]);

  const handleSaveKey = useCallback(() => {
    if (!apiKey.trim()) return;
    setStatus("ready");
  }, [apiKey]);

  const removeFile = useCallback(() => {
    stopTimer();
    setFile(null);
    setStatus("ready");
    setChunks([]);
    setDuration(null);
    setCurrentPiece(0);
    setElapsed(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [stopTimer]);

  const totalPieces = chunks.length;
  const progressPct =
    totalPieces > 0 && status !== "ready"
      ? Math.min(100, (elapsed / (totalPieces * SIM_SECONDS_PER_PIECE)) * 100)
      : 0;
  const remaining = Math.max(0, totalPieces * SIM_SECONDS_PER_PIECE - elapsed);

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
            <div className="ml-auto hidden text-xs text-muted-foreground sm:block">
              {status === "ready" && "System ready to process video."}
              {status === "processing" && "Mining knowledge from your video..."}
              {status === "complete" && "Knowledge extraction complete."}
              {status === "error" && "Something went wrong. Check the app log."}
            </div>
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
                  <label htmlFor="api-key" className="mb-2 block text-sm font-medium text-muted-foreground">
                    {t.apiKey}
                  </label>
                  <div className="flex gap-3">
                    <input
                      id="api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={t.apiKeyPlaceholder}
                      className="flex-1 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={handleSaveKey}
                      disabled={!apiKey.trim()}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      <span className="hidden sm:inline">{t.saveKey}</span>
                    </button>
                  </div>
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
              <h3 className="text-lg font-semibold text-foreground">Results</h3>
            </div>

            <div className="mb-4 inline-flex rounded-lg border border-border bg-muted p-1">
              <button
                onClick={() => setActiveTab("knowledge")}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "knowledge"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Brain className="h-4 w-4" />
                {t.structuredKnowledge}
              </button>
              <button
                onClick={() => setActiveTab("transcript")}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "transcript"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ScrollText className="h-4 w-4" />
                {t.transcript}
              </button>
              <button
                onClick={() => setActiveTab("log")}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "log"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Terminal className="h-4 w-4" />
                {t.appLog}
              </button>
            </div>

            <div className="min-h-[220px] rounded-[12px] border border-border bg-muted p-5">
              {activeTab === "knowledge" && (
                <div className="space-y-3">
                  {status === "complete" ? (
                    <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
                      <li>Extracted the core narrative arc from the uploaded video.</li>
                      <li>Identified three recurring themes and linked them to prior entries.</li>
                      <li>Generated memory anchors ready for review and recall.</li>
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noResults}</p>
                  )}
                </div>
              )}

              {activeTab === "transcript" && (
                <div>
                  {status === "complete" ? (
                    <p className="text-sm leading-relaxed text-foreground">
                      Transcript text will be shown here. [00:00] Introduction begins. [00:42] Main topic introduced.
                      [02:15] Key insight discussed. [05:30] Conclusion and next steps.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t.noTranscript}</p>
                  )}
                </div>
              )}

              {activeTab === "log" && (
                <div className="font-mono text-xs leading-relaxed text-muted-foreground">
                  <p>[system] Evermine initialized</p>
                  {log.length === 0 && <p>[system] Waiting for video input...</p>}
                  {log.map((line, i) => (
                    <p key={i} className={line.startsWith("[warn]") ? "text-status-amber" : ""}>
                      {line}
                    </p>
                  ))}
                  {status === "processing" && (
                    <p className="text-status-amber">
                      [info] Processing piece {currentPiece} of {totalPieces}...
                    </p>
                  )}
                  {status === "error" && <p className="text-status-red">[error] Processing failed</p>}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
