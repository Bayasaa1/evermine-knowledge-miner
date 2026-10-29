import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, Link2, Loader2, Monitor, Square, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import { startUploadMining } from "@/lib/native-mining.functions";
import { inspectVideoFile, uploadNativeVideoToStorage } from "@/lib/mine-file";
import { extractParts } from "@/lib/video-extract";
import { NativeMiningPills, type NativeStage } from "@/components/mining-wizard";

import { Bot, Brain, PhoneCall, Megaphone, Gamepad2, ChevronRight, Dumbbell } from "lucide-react";

import {
  ACTIVE_CATEGORIES,
  CATEGORY_LABELS,
  type CreationCategory,
} from "@/lib/creation-category";
import { pickCopy, type Lang } from "@/lib/i18n";

const ICONS: Record<CreationCategory, typeof Brain> = {
  knowledge: Brain,
  robot: Bot,
  voice: PhoneCall,
  sales: Megaphone,
  gaming: Gamepad2,
  movement: Dumbbell,
};

const ORDER: CreationCategory[] = ACTIVE_CATEGORIES;

/**
 * The category list used in step 1 of the creator setup wizard.
 * `selected` highlights a current choice; without it every row is a plain pick.
 */
export function CategoryList({
  lang,
  onPick,
  selected,
}: {
  lang: Lang;
  onPick: (category: CreationCategory) => void;
  selected?: CreationCategory;
}) {
  return (
    <div className="grid gap-3">
      {ORDER.map((category) => {
        const Icon = ICONS[category];
        const copy = pickCopy(CATEGORY_LABELS[category], lang);
        const isSelected = selected === category;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onPick(category)}
            className={`group flex items-center gap-4 rounded-xl border p-4 text-left transition-colors ${
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/40 hover:border-primary/60 hover:bg-muted"
            }`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{copy.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{copy.sub}</span>
            </span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                isSelected ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

/* ================= Content wizard: Upload / Record / YouTube ================= */
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 6 * 3600;
const ACCEPT = ["video/mp4", "video/quicktime", "video/webm"];

/** Returns an error key or null. Pure, so it is unit-tested. */
export function validateVideo(type: string, name: string, size: number, durationSec?: number) {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (!ACCEPT.includes(type) && !["mp4", "mov", "webm"].includes(ext)) return "badType" as const;
  if (size > MAX_VIDEO_BYTES) return "tooBig" as const;
  if (durationSec !== undefined && (!Number.isFinite(durationSec) || durationSec <= 0)) return "noLength" as const;
  if (durationSec !== undefined && durationSec > MAX_VIDEO_SECONDS) return "tooLong" as const;
  return null;
}

const wz = {
  en: {
    upload: "📱 Upload File", record: "🎥 Record Live", youtube: "🔗 YouTube Link",
    drop: "Drop a .mp4, .mov or .webm here, or tap to choose", limits: "Up to 1 GB and 6 hours",
    camera: "Camera", screen: "Screen", start: "Start recording", stop: "Stop", again: "Record again",
    persona: "Persona", project: "Project", choose: "Choose…", title: "Video title",
    go: "Upload & mine", keep: "Keep this tab open until mining finishes.",
    signIn: "Sign in to add videos.", need: "Choose a persona, project and video first.",
    badType: "Only .mp4, .mov or .webm files.", tooBig: "This file is over 1 GB.", tooLong: "This video is over 6 hours.", noLength: "Could not read this video's length.",
    ytSub: "Paste a YouTube link in the Creator Studio importer.", ytGo: "Open YouTube importer",
  },
  mn: {
    upload: "📱 Файл хуулах", record: "🎥 Шууд бичих", youtube: "🔗 YouTube холбоос",
    drop: ".mp4, .mov, .webm файлаа энд чирж оруулах эсвэл дарж сонгох", limits: "1 GB, 6 цаг хүртэл",
    camera: "Камер", screen: "Дэлгэц", start: "Бичлэг эхлүүлэх", stop: "Зогсоох", again: "Дахин бичих",
    persona: "Персона", project: "Төсөл", choose: "Сонгох…", title: "Видеоны нэр",
    go: "Хуулж, майнинг хийх", keep: "Майнинг дуустал энэ цонхыг бүү хаагаарай.",
    signIn: "Видео нэмэхийн тулд нэвтэрнэ үү.", need: "Эхлээд персона, төсөл, видеогоо сонгоно уу.",
    badType: "Зөвхөн .mp4, .mov, .webm файл.", tooBig: "Файл 1 GB-аас их байна.", tooLong: "Видео 6 цагаас урт байна.", noLength: "Видеоны уртыг уншиж чадсангүй.",
    ytSub: "YouTube холбоосоо Creator Studio-д оруулна уу.", ytGo: "YouTube оруулагч нээх",
  },
  ko: {
    upload: "📱 파일 업로드", record: "🎥 실시간 녹화", youtube: "🔗 YouTube 링크",
    drop: ".mp4, .mov, .webm 파일을 끌어다 놓거나 눌러서 선택", limits: "최대 1GB, 6시간",
    camera: "카메라", screen: "화면", start: "녹화 시작", stop: "중지", again: "다시 녹화",
    persona: "페르소나", project: "프로젝트", choose: "선택…", title: "영상 제목",
    go: "업로드 및 마이닝", keep: "마이닝이 끝날 때까지 이 탭을 열어 두세요.",
    signIn: "영상을 추가하려면 로그인하세요.", need: "먼저 페르소나, 프로젝트, 영상을 선택하세요.",
    badType: ".mp4, .mov, .webm 파일만 가능합니다.", tooBig: "파일이 1GB를 넘습니다.", tooLong: "영상이 6시간을 넘습니다.", noLength: "영상 길이를 읽을 수 없습니다.",
    ytSub: "Creator Studio 가져오기에 YouTube 링크를 붙여넣으세요.", ytGo: "YouTube 가져오기 열기",
  },
};

type WizTab = "upload" | "record" | "youtube";
type Opt = { id: string; name: string; personaId?: string | null };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ContentCreateWizard({ lang }: { lang: Lang }) {
  const t = pickCopy(wz, lang);
  const [tab, setTab] = useState<WizTab>("upload");
  const [userId, setUserId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Opt[]>([]);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [personaId, setPersonaId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<{ duration: number; poster: string } | null>(null);
  const [sourceType, setSourceType] = useState<"native_upload" | "camera_record">("native_upload");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [stage, setStage] = useState<NativeStage>("idle");
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [recSrc, setRecSrc] = useState<"camera" | "screen">("camera");
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [replay, setReplay] = useState<string | null>(null);
  const live = useRef<HTMLVideoElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const [p, pr] = await Promise.all([
        supabase.from("creator_personas").select("id,name").eq("user_id", uid).order("created_at"),
        supabase.from("projects").select("id,title,persona_id").eq("user_id", uid).order("created_at"),
      ]);
      setPersonas((p.data ?? []).map((r) => ({ id: r.id, name: r.name })));
      setProjects((pr.data ?? []).map((r) => ({ id: r.id, name: r.title, personaId: r.persona_id })));
    })();
    return () => streamRef.current?.getTracks().forEach((x) => x.stop());
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => () => { if (replay) URL.revokeObjectURL(replay); }, [replay]);

  const accept = async (f: File, kind: "native_upload" | "camera_record") => {
    setError(""); setStage("idle"); setInfo(null);
    const pre = validateVideo(f.type, f.name, f.size);
    if (pre) { setError(t[pre]); return; }
    try {
      const meta = await inspectVideoFile(f);
      const bad = validateVideo(f.type, f.name, f.size, meta.durationSeconds);
      if (bad) { setError(t[bad]); return; }
      setInfo({ duration: meta.durationSeconds, poster: meta.thumbnailDataUrl });
    } catch (e) {
      // MediaRecorder webm often has no length until fully read; mining reads it again.
      if (kind === "native_upload") { setError(e instanceof Error ? e.message : String(e)); return; }
    }
    setFile(f); setSourceType(kind);
    if (!title) setTitle(kind === "camera_record" ? new Date().toLocaleString() : f.name.replace(/\.[^.]+$/, "").slice(0, 200));
  };

  const startRec = async () => {
    setError(""); setReplay(null); setFile(null);
    try {
      const stream = recSrc === "screen"
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (live.current) { live.current.srcObject = stream; void live.current.play(); }
      for (let i = 3; i > 0; i--) { setCountdown(i); await new Promise((r) => setTimeout(r, 1000)); }
      setCountdown(0);
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((x) => x.stop());
        streamRef.current = null;
        if (live.current) live.current.srcObject = null;
        const type = rec.mimeType || "video/webm";
        const f = new File(chunks, `recording-${Date.now()}.${type.includes("mp4") ? "mp4" : "webm"}`, { type: type.split(";")[0] ?? type });
        setReplay(URL.createObjectURL(f));
        void accept(f, "camera_record");
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", () => { if (rec.state === "recording") rec.stop(); setRecording(false); });
      recRef.current = rec;
      rec.start(1000);
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      setCountdown(0);
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const stopRec = () => { recRef.current?.stop(); setRecording(false); };

  const run = async () => {
    if (!userId) { setError(t.signIn); return; }
    if (!file || !personaId || !projectId || !title.trim()) { setError(t.need); return; }
    setBusy(true); setError(""); setPct(0);
    try {
      setStage("upload");
      const meta = await inspectVideoFile(file).catch(() => null);
      const { storagePath, thumbnailPath } = await uploadNativeVideoToStorage(file, meta?.thumbnailBlob ?? null, userId, projectId, setPct);
      const durationSec = meta?.durationSeconds ?? info?.duration ?? 0;
      const job = await startUploadMining({
        data: { personaId, projectId, storagePath, thumbnailPath, title: title.trim(), durationSec, sourceType, category: "knowledge", language: lang },
      });
      const total = job.plan.length;
      setStage("extract"); setPct(0);
      for await (const part of extractParts(file, () => setStage((s) => (s === "mine" ? s : "extract")), job.plan)) {
        setStage("mine");
        let attempt = 0;
        for (;;) {
          const res = await apiFetch("/api/native-mine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: job.jobId, index: part.index, frames: part.frames, audioWav: part.audioWav, thumbnailPath, durationSec, sourceType }),
          });
          const out = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.ok) break;
          attempt += 1;
          if (attempt >= 3 || res.status === 404 || res.status === 409) throw new Error(out.error ?? `HTTP ${res.status}`);
          await new Promise((r) => setTimeout(r, 15_000 * attempt));
        }
        setPct(Math.round(((part.index + 1) / total) * 100));
      }
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("idle");
    } finally {
      setBusy(false);
    }
  };

  const field = "mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary/60";
  const tabs: [WizTab, string][] = [["upload", t.upload], ["record", t.record], ["youtube", t.youtube]];
  const personaProjects = projects.filter((p) => p.personaId === personaId);

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" disabled={busy || recording} onClick={() => { setTab(id); setError(""); }}
            className={`flex-1 rounded-lg px-2 py-2 text-xs sm:text-sm ${tab === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "youtube" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">{t.ytSub}</p>
          <Link to="/creator" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
            <Link2 className="h-4 w-4" /> {t.ytGo}
          </Link>
        </div>
      ) : (
        <>
          {tab === "upload" && (
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void accept(f, "native_upload"); }}
              className={`mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center ${drag ? "border-primary bg-primary/5" : "border-border"} ${busy ? "pointer-events-none opacity-50" : ""}`}>
              <Upload className="h-6 w-6 text-primary" />
              <span className="text-sm text-foreground">{t.drop}</span>
              <span className="text-xs text-muted-foreground">{t.limits}</span>
              <input type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void accept(f, "native_upload"); }} />
            </label>
          )}

          {tab === "record" && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                {(["camera", "screen"] as const).map((s) => (
                  <button key={s} type="button" disabled={recording || busy} onClick={() => setRecSrc(s)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${recSrc === s ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                    {s === "camera" ? <Camera className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />} {s === "camera" ? t.camera : t.screen}
                  </button>
                ))}
              </div>
              <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                {replay && !recording && countdown === 0
                  ? <video src={replay} controls playsInline className="h-full w-full object-contain" />
                  : <video ref={live} muted playsInline className="h-full w-full object-cover" />}
                {countdown > 0 && <span className="absolute inset-0 flex items-center justify-center text-5xl font-bold text-foreground">{countdown}</span>}
                {recording && <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">● {fmt(elapsed)}</span>}
              </div>
              {recording ? (
                <button type="button" onClick={stopRec} className="inline-flex items-center gap-2 rounded-xl border border-destructive px-3 py-2 text-sm text-destructive">
                  <Square className="h-4 w-4" /> {t.stop}
                </button>
              ) : (
                <button type="button" disabled={busy || countdown > 0} onClick={() => void startRec()} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50">
                  <Camera className="h-4 w-4" /> {replay ? t.again : t.start}
                </button>
              )}
            </div>
          )}

          {file && !recording && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                {info?.poster && <img src={info.poster} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" />}
                <div className="text-xs text-muted-foreground">
                  <p className="text-sm text-foreground">{file.name}</p>
                  <p>{(file.size / 1_048_576).toFixed(1)} MB{info ? ` · ${fmt(info.duration)}` : ""}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-muted-foreground">{t.persona}
                  <select value={personaId} disabled={busy} onChange={(e) => { setPersonaId(e.target.value); setProjectId(""); }} className={field}>
                    <option value="">{t.choose}</option>
                    {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs text-muted-foreground">{t.project}
                  <select value={projectId} disabled={busy || !personaId} onChange={(e) => setProjectId(e.target.value)} className={field}>
                    <option value="">{t.choose}</option>
                    {personaProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-xs text-muted-foreground">{t.title}
                <input value={title} disabled={busy} onChange={(e) => setTitle(e.target.value.slice(0, 200))} className={field} />
              </label>
              <button type="button" disabled={busy} onClick={() => void run()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t.go}
              </button>
            </div>
          )}

          {stage !== "idle" && (
            <div className="mt-4 space-y-2">
              <NativeMiningPills lang={lang} stage={stage} />
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${stage === "done" ? 100 : pct}%` }} />
              </div>
              {busy && <p className="text-xs text-muted-foreground">{t.keep}</p>}
            </div>
          )}
        </>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
