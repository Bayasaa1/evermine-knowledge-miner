import { MindDownloadButtons } from "@/components/mind-download-buttons";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, Cable, Camera, Download, Hand, ScanLine, X } from "lucide-react";
import {
  defaultEmbodiedSettings,
  loadEmbodiedSettings,
  saveEmbodiedSettings,
  toRos2Payload,
  compileSkillDrillChecklist,
  type EmbodiedSettings,
} from "@/lib/embodied";
import type { VlaTrajectory } from "@/lib/embodied";
import { pickCopy, type Lang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";

const movementCopy = {
  en: { title: "Movement Skill Drills", phase: "Phase", phases: { prep: "Preparation", execution: "Execution", follow_through: "Follow-through" }, mechanics: "Body & hand mechanics", tempo: "Tempo & rhythm", sensory: "Sensory cue", mistake: "Common mistake to avoid", empty: "No movement drills extracted yet.", camera: "Live Camera Form Check", check: "Check form", close: "Stop camera", busy: "Checking…", score: "Visual form match", unknown: "Not assessable", correction: "Posture correction", cue: "Next cue", error: "Form check failed. Check your sign-in and AI key, then try again.", denied: "Camera unavailable. Allow camera access and try again.", ready: "Wait for the camera image.", note: "Approximate visual feedback—not a biomechanical measurement. A still image cannot assess tempo or force." },
  mn: { title: "Хөдөлгөөний ур чадварын дасгал", phase: "Үе шат", phases: { prep: "Бэлтгэл", execution: "Гүйцэтгэл", follow_through: "Төгсгөлийн хөдөлгөөн" }, mechanics: "Бие, гарын байрлал", tempo: "Хэмнэл ба хурд", sensory: "Харах, мэдрэх дохио", mistake: "Зайлсхийх нийтлэг алдаа", empty: "Хөдөлгөөний дасгал хараахан олборлоогүй байна.", camera: "Камераар хөдөлгөөн шалгах", check: "Байрлал шалгах", close: "Камер зогсоох", busy: "Шалгаж байна…", score: "Харагдах байрлалын нийцэл", unknown: "Үнэлэх боломжгүй", correction: "Байрлалын засвар", cue: "Дараагийн дохио", error: "Шалгалт амжилтгүй. Нэвтрэлт, AI түлхүүрээ шалгаад дахин оролдоно уу.", denied: "Камер ашиглах боломжгүй. Камерын зөвшөөрлөө шалгана уу.", ready: "Камерын дүрсийг хүлээнэ үү.", note: "Ойролцоо харааны үнэлгээ; биомеханикийн хэмжилт биш. Нэг зураг хэмнэл, хүчийг үнэлэхгүй." },
  ko: { title: "동작 기술 훈련", phase: "단계", phases: { prep: "준비", execution: "실행", follow_through: "마무리 동작" }, mechanics: "몸과 손의 자세", tempo: "속도와 리듬", sensory: "감각 단서", mistake: "피해야 할 흔한 실수", empty: "아직 추출된 동작 훈련이 없습니다.", camera: "실시간 카메라 자세 확인", check: "자세 확인", close: "카메라 끄기", busy: "확인 중…", score: "시각적 자세 일치도", unknown: "평가 불가", correction: "자세 교정", cue: "다음 단서", error: "확인 실패. 로그인과 AI 키를 확인하고 다시 시도하세요.", denied: "카메라를 사용할 수 없습니다. 카메라 접근을 허용해 주세요.", ready: "카메라 영상을 기다려 주세요.", note: "대략적인 시각적 피드백이며 생체역학 측정이 아닙니다. 한 장의 사진으로 리듬이나 힘을 평가할 수 없습니다." },
} as const;
type FormCheck = { form_score: number | null; posture_correction: string; next_cue: string; speech: string };

const copy = {
  en: {
    title: "Embodied AI & Robotics Sync",
    badge: "Roadmap",
    hint: "Beyond text: Evermind can capture Vision-Language-Action (VLA) trajectories — hand movement and object-manipulation coordinates — from your videos, so your mind can one day drive a physical robot.",
    capture: "Capture VLA trajectories while mining",
    captureHint: "Stores instruction, object, timing and normalized 3D waypoints for every key physical action.",
    ros: "ROS 2 / Robot Mind Export API",
    rosHint: "Simulated endpoint. When enabled, mined actions are published as evermind_msgs/msg/MindAction.",
    topic: "ROS 2 topic",
    export: "Download sample export",
    trajectories: (n: number) => `${n} action trajectories ready`,
    none: "No physical actions captured yet — mine a video with hand or object movement.",
    saved: "Embodied AI settings saved.",
    exported: "Robot mind export downloaded.",
  },
  mn: {
    title: "Биет AI ба Робот синк",
    badge: "Замын зураглал",
    hint: "Зөвхөн текст биш: Evermind таны видеоноос Vision-Language-Action (VLA) траекторууд — гарын хөдөлгөөн, эд зүйл барих координат — цуглуулж, ирээдүйд бодит робот удирдах боломж бүрдүүлнэ.",
    capture: "Олборлохдоо VLA траектор цуглуулах",
    captureHint: "Гол биет үйлдэл бүрийн заавар, объект, хугацаа, 3D цэгүүдийг хадгална.",
    ros: "ROS 2 / Robot Mind Export API",
    rosHint: "Симуляц хийсэн холболт. Идэвхжүүлбэл үйлдлүүд evermind_msgs/msg/MindAction болж нийтлэгдэнэ.",
    topic: "ROS 2 сэдэв",
    export: "Жишээ экспорт татах",
    trajectories: (n: number) => `${n} үйлдлийн траектор бэлэн`,
    none: "Одоогоор биет үйлдэл бүртгэгдээгүй — гар, эд зүйлийн хөдөлгөөнтэй видео олборлоно уу.",
    saved: "Биет AI тохиргоо хадгалагдлаа.",
    exported: "Robot mind экспорт татагдлаа.",
  },
  ko: {
    title: "체화 AI 및 로봇 연동",
    badge: "로드맵",
    hint: "텍스트를 넘어서: Evermind는 영상에서 Vision-Language-Action(VLA) 궤적 — 손 움직임과 물체 조작 좌표 — 을 캡처하여, 언젠가 당신의 마인드가 실제 로봇을 구동할 수 있도록 합니다.",
    capture: "채굴 중 VLA 궤적 캡처",
    captureHint: "주요 물리적 동작마다 지시문, 대상 물체, 타이밍, 정규화된 3D 경유점을 저장합니다.",
    ros: "ROS 2 / Robot Mind Export API",
    rosHint: "시뮬레이션된 엔드포인트입니다. 활성화하면 채굴된 동작이 evermind_msgs/msg/MindAction으로 게시됩니다.",
    topic: "ROS 2 토픽",
    export: "샘플 내보내기 다운로드",
    trajectories: (n: number) => `${n}개의 동작 궤적 준비됨`,
    none: "아직 캡처된 물리적 동작이 없습니다 — 손이나 물체 움직임이 있는 영상을 채굴해 보세요.",
    saved: "체화 AI 설정이 저장되었습니다.",
    exported: "Robot mind 내보내기가 다운로드되었습니다.",
  },
} as const;

export function EmbodiedAiCard({
  lang,
  trajectories = [],
}: {
  lang: Lang;
  trajectories?: VlaTrajectory[];
}) {
  const t = pickCopy(copy, lang);
  const [settings, setSettings] = useState<EmbodiedSettings>(defaultEmbodiedSettings);
  const [hydrated, setHydrated] = useState(false);
  const m = pickCopy(movementCopy, lang);
  const drills = useMemo(() => compileSkillDrillChecklist(trajectories), [trajectories]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeDrill = drills[activeIndex];
  const drillKey = activeDrill ? JSON.stringify(activeDrill) : "";
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [formCheck, setFormCheck] = useState<FormCheck | null>(null);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const generation = useRef(0);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const token = ++generation.current;
    setFormCheck(null);
    setCameraError("");
    setChecking(false);
    setCameraReady(false);
    let stream: MediaStream | undefined;
    const video = videoRef.current;
    if (cameraOpen && drillKey) void (async () => {
      try {
        const granted = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (generation.current !== token) { granted.getTracks().forEach((track) => track.stop()); return; }
        stream = granted;
        if (!video) { granted.getTracks().forEach((track) => track.stop()); return; }
        video.srcObject = granted;
        await video.play();
        if (generation.current === token) setCameraReady(true);
      } catch {
        stream?.getTracks().forEach((track) => track.stop());
        if (generation.current === token) setCameraError(m.denied);
      }
    })();
    return () => {
      generation.current += 1;
      requestRef.current?.abort();
      requestRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [cameraOpen, drillKey, m.denied]);

  const checkForm = async () => {
    const video = videoRef.current;
    if (!activeDrill || !video || requestRef.current) return;
    if (!video.videoWidth || video.readyState < 2) { setCameraError(m.ready); return; }
    const token = generation.current;
    const controller = new AbortController();
    requestRef.current = controller;
    setChecking(true);
    setCameraError("");
    setFormCheck(null);
    const timeout = window.setTimeout(() => controller.abort(), 45000);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const response = await apiFetch("/api/mind-vision", {
        method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: canvas.toDataURL("image/jpeg", 0.75), lang, mode: "movement_coach", drill: activeDrill }),
      });
      const result = await response.json() as FormCheck;
      if (!response.ok || !result.speech || !result.next_cue || !(result.form_score === null || (typeof result.form_score === "number" && Number.isFinite(result.form_score)))) throw new Error("Invalid form check");
      if (generation.current === token && !controller.signal.aborted) setFormCheck(result);
    } catch {
      if (generation.current === token) setCameraError(m.error);
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      if (generation.current === token) setChecking(false);
    }
  };

  useEffect(() => {
    void (async () => {
      setSettings(await loadEmbodiedSettings());
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const id = setTimeout(() => void saveEmbodiedSettings(settings), 400);
    return () => clearTimeout(id);
  }, [hydrated, settings]);

  const downloadExport = () => {
    const payload = toRos2Payload(settings.topic, trajectories);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "robot-mind.ros2.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.exported);
  };

  const toggle = (key: "captureVla" | "rosExport") => () =>
    setSettings((s) => ({ ...s, [key]: !s[key] }));

  return (
    <section id="embodied" className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t.badge}
        </span>
        <MindDownloadButtons lang={lang} name="robot-mind" data={{ settings, trajectories, drills }} />
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t.hint}</p>

      <div className="mb-5 border-b border-border pb-5">
        <h4 className="mb-3 font-semibold text-foreground">{m.title}</h4>
        {!drills.length ? <p className="text-sm text-muted-foreground">{m.empty}</p> : <>
          <div className="mb-3 flex flex-wrap gap-2">
            {drills.map((drill, index) => <Button key={`${index}_${drill.timestamp}`} size="sm" variant={index === activeIndex ? "secondary" : "outline"} aria-pressed={index === activeIndex} className="h-auto max-w-full whitespace-normal break-words text-left" onClick={() => setActiveIndex(index)}>
              {drill.skill_name} · {m.phases[drill.phase]} · {drill.timestamp}
            </Button>)}
          </div>
          {activeDrill && <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {([[m.phase, m.phases[activeDrill.phase]], [m.mechanics, activeDrill.body_or_hand_mechanics], [m.tempo, activeDrill.tempo_and_rhythm], [m.sensory, activeDrill.sensory_cue], [m.mistake, activeDrill.common_mistake_to_avoid]] as const).map(([label, value]) => <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-foreground">{value || "—"}</dd>
              </div>)}
            </dl>
            <Button variant="outline" className="mt-4 h-auto max-w-full whitespace-normal" onClick={() => setCameraOpen((open) => !open)}>
              {cameraOpen ? <X /> : <Camera />}{cameraOpen ? m.close : m.camera}
            </Button>
            {cameraOpen && <div className="mt-3 space-y-3">
              <video ref={videoRef} muted playsInline className="aspect-video w-full max-w-xl rounded-lg bg-muted object-contain" />
              <Button onClick={() => void checkForm()} disabled={checking || !cameraReady} className="h-auto max-w-full whitespace-normal"><ScanLine />{checking ? m.busy : m.check}</Button>
              <p className="text-xs text-muted-foreground">{m.note}</p>
              {formCheck && <div role="status" className="space-y-2 text-sm text-foreground">
                <p className="font-semibold">{m.score}: {formCheck.form_score === null ? m.unknown : `${formCheck.form_score}/100`}</p>
                <p>{formCheck.speech}</p>
                {formCheck.posture_correction && <p><strong>{m.correction}: </strong>{formCheck.posture_correction}</p>}
                <p><strong>{m.cue}: </strong>{formCheck.next_cue}</p>
              </div>}
            </div>}
            {cameraError && <p role="alert" className="mt-2 text-sm text-destructive">{cameraError}</p>}
          </>}
        </>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          role="switch"
          aria-checked={settings.captureVla}
          onClick={toggle("captureVla")}
          className={`rounded-xl border p-4 text-left transition-colors ${
            settings.captureVla ? "border-primary bg-primary/5" : "border-border bg-muted/40 hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Hand className="h-4 w-4 text-primary" /> {t.capture}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t.captureHint}</p>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={settings.rosExport}
          onClick={toggle("rosExport")}
          className={`rounded-xl border p-4 text-left transition-colors ${
            settings.rosExport ? "border-primary bg-primary/5" : "border-border bg-muted/40 hover:border-primary/40"
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Cable className="h-4 w-4 text-primary" /> {t.ros}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t.rosHint}</p>
        </button>
      </div>

      {settings.rosExport && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <div className="min-w-0 flex-1">
            <label htmlFor="rosTopic" className="mb-1.5 block text-xs text-muted-foreground">{t.topic}</label>
            <input
              id="rosTopic"
              value={settings.topic}
              onChange={(e) => setSettings((s) => ({ ...s, topic: e.target.value }))}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
            />
          </div>
          <button
            type="button"
            onClick={downloadExport}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" /> {t.export}
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {trajectories.length > 0 ? t.trajectories(trajectories.length) : t.none}
      </p>
    </section>
  );
}
