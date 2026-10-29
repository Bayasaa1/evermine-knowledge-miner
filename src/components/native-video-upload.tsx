/**
 * Upload or record your own video and mine it. The file goes into the
 * creator's private storage folder, while the browser cuts it into 5-minute
 * parts (frames + sound) and mines them one by one on the creator's own keys.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Film, Loader2, Square, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { apiFetch } from "@/lib/api-fetch";
import { pickCopy, type Lang } from "@/lib/i18n";
import { startUploadMining } from "@/lib/native-mining.functions";
import { extractParts, readDuration, type ExtractProgress } from "@/lib/video-extract";

const BUCKET = "creator-videos";

const copy = {
  en: {
    title: "Your own video", sub: "Upload a file or record with your camera. Mining uses your own AI keys.",
    persona: "Persona", project: "Project", choose: "Choose…", name: "Video title",
    pick: "Choose video file", record: "Record with camera", stop: "Stop recording",
    start: "Upload & mine", needPick: "Choose a persona, project and video first.",
    signIn: "Sign in to upload videos.", uploading: "Uploading", sound: "Reading sound",
    frames: "Taking pictures", mining: "AI mining part", done: "Done — your video is saved in the project.",
    keep: "Keep this tab open until mining finishes.", noProjects: "This persona has no projects yet.",
  },
  mn: {
    title: "Өөрийн видео", sub: "Файл хуулах эсвэл камераараа бичнэ. Майнинг таны өөрийн AI түлхүүрийг ашиглана.",
    persona: "Персона", project: "Төсөл", choose: "Сонгох…", name: "Видеоны нэр",
    pick: "Видео файл сонгох", record: "Камераар бичих", stop: "Бичлэг зогсоох",
    start: "Хуулж, майнинг хийх", needPick: "Эхлээд персона, төсөл, видеогоо сонгоно уу.",
    signIn: "Видео хуулахын тулд нэвтэрнэ үү.", uploading: "Хуулж байна", sound: "Дуу уншиж байна",
    frames: "Кадр салгаж байна", mining: "AI майнинг — хэсэг", done: "Дууслаа — видео төсөлд хадгалагдлаа.",
    keep: "Майнинг дуустал энэ цонхыг бүү хаагаарай.", noProjects: "Энэ персонад төсөл алга.",
  },
  ko: {
    title: "내 영상", sub: "파일을 올리거나 카메라로 녹화하세요. 마이닝은 내 AI 키를 사용합니다.",
    persona: "페르소나", project: "프로젝트", choose: "선택…", name: "영상 제목",
    pick: "영상 파일 선택", record: "카메라로 녹화", stop: "녹화 중지",
    start: "업로드 및 마이닝", needPick: "먼저 페르소나, 프로젝트, 영상을 선택하세요.",
    signIn: "영상을 올리려면 로그인하세요.", uploading: "업로드 중", sound: "소리 읽는 중",
    frames: "장면 추출 중", mining: "AI 마이닝 — 파트", done: "완료 — 영상이 프로젝트에 저장되었습니다.",
    keep: "마이닝이 끝날 때까지 이 탭을 열어 두세요.", noProjects: "이 페르소나에는 프로젝트가 없습니다.",
  },
};

type Opt = { id: string; name: string };
type ProjectOpt = Opt & { personaId: string | null };

export function NativeVideoUpload({ lang }: { lang: Lang }) {
  const t = pickCopy(copy, lang);
  const [userId, setUserId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Opt[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [personaId, setPersonaId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState<"native_upload" | "camera_record">("native_upload");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);

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
    return () => streamRef.current?.getTracks().forEach((tr) => tr.stop());
  }, []);

  const personaProjects = projects.filter((p) => p.personaId === personaId);

  const chooseFile = (f: File | null) => {
    if (!f) return;
    setFile(f);
    setSourceType("native_upload");
    setFinished(false);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 200));
  };

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (previewRef.current) { previewRef.current.srcObject = stream; void previewRef.current.play(); }
      const rec = new MediaRecorder(stream);
      const parts: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) parts.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
        if (previewRef.current) previewRef.current.srcObject = null;
        const type = rec.mimeType || "video/webm";
        const ext = type.includes("mp4") ? "mp4" : "webm";
        const f = new File(parts, `recording-${Date.now()}.${ext}`, { type });
        setFile(f);
        setSourceType("camera_record");
        setFinished(false);
        if (!title) setTitle(new Date().toLocaleString());
      };
      recRef.current = rec;
      rec.start(1000);
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stopRecording = () => { recRef.current?.stop(); setRecording(false); };

  const run = async () => {
    if (!userId) { setError(t.signIn); return; }
    if (!file || !personaId || !projectId || !title.trim()) { setError(t.needPick); return; }
    setBusy(true); setError(""); setFinished(false); setPct(0);
    try {
      const ext = (file.name.split(".").pop() ?? "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      const base = `${userId}/${crypto.randomUUID()}`;
      const storagePath = `${base}.${ext}`;
      setStage(t.uploading);
      // The file uploads while the browser is already cutting it.
      const upload = supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type || "video/mp4", upsert: false });
      const durationSec = await readDuration(file);

      let thumbnailPath: string | null = null;
      const first = extractParts(file, undefined, [{ index: 0, startSec: 0, endSec: Math.min(2, durationSec) }]);
      const firstPart = (await first.next()).value;
      const thumb = firstPart?.frames?.[0]?.jpeg;
      if (thumb) {
        const bytes = Uint8Array.from(atob(thumb), (c) => c.charCodeAt(0));
        const { error: tErr } = await supabase.storage.from(BUCKET).upload(`${base}.jpg`, bytes, { contentType: "image/jpeg" });
        if (!tErr) thumbnailPath = `${base}.jpg`;
      }

      const { error: upErr } = await upload;
      if (upErr) throw new Error(upErr.message);

      const job = await startUploadMining({
        data: { personaId, projectId, storagePath, thumbnailPath, title: title.trim(), durationSec, sourceType, category: "knowledge", language: lang },
      });
      const total = job.plan.length;
      const onProgress = (p: ExtractProgress) => {
        if (p.stage === "audio") { setStage(t.sound); return; }
        setStage(t.frames);
      };
      for await (const part of extractParts(file, onProgress, job.plan)) {
        setStage(`${t.mining} ${part.index + 1}/${total}`);
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
      setFinished(true);
      setStage(t.done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const select = "mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-primary/60";

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Film className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">{t.title}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t.sub}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">{t.persona}
          <select value={personaId} onChange={(e) => { setPersonaId(e.target.value); setProjectId(""); }} className={select} disabled={busy}>
            <option value="">{t.choose}</option>
            {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">{t.project}
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={select} disabled={busy || !personaId}>
            <option value="">{personaId && !personaProjects.length ? t.noProjects : t.choose}</option>
            {personaProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted ${busy || recording ? "pointer-events-none opacity-50" : ""}`}>
          <Upload className="h-4 w-4" /> {t.pick}
          <input type="file" accept="video/*" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
        </label>
        {recording ? (
          <button type="button" onClick={stopRecording} className="inline-flex items-center gap-2 rounded-xl border border-destructive px-3 py-2 text-sm text-destructive">
            <Square className="h-4 w-4" /> {t.stop}
          </button>
        ) : (
          <button type="button" onClick={() => void startRecording()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50">
            <Camera className="h-4 w-4" /> {t.record}
          </button>
        )}
      </div>
      <video ref={previewRef} muted playsInline className={recording ? "mt-3 aspect-video w-full rounded-lg bg-muted object-cover" : "hidden"} />

      {file && !recording && (
        <label className="mt-3 block text-xs text-muted-foreground">{t.name}
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} disabled={busy} className={select} />
          <span className="mt-1 block">{file.name} · {(file.size / 1_048_576).toFixed(1)} MB</span>
        </label>
      )}

      <button type="button" onClick={() => void run()} disabled={busy || recording || !file}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t.start}
      </button>

      {(busy || finished) && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">{finished && <CheckCircle2 className="h-4 w-4 text-primary" />}{stage}</span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          {busy && <p className="mt-2 text-xs text-muted-foreground">{t.keep}</p>}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
