import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Cable, Download, Hand } from "lucide-react";
import {
  defaultEmbodiedSettings,
  loadEmbodiedSettings,
  saveEmbodiedSettings,
  toRos2Payload,
  type EmbodiedSettings,
} from "@/lib/embodied";
import type { VlaTrajectory } from "@/lib/embodied";

const copy = {
  en: {
    title: "Embodied AI & Robotics Sync",
    badge: "Roadmap",
    hint: "Beyond text: Evermine can capture Vision-Language-Action (VLA) trajectories — hand movement and object-manipulation coordinates — from your videos, so your mind can one day drive a physical robot.",
    capture: "Capture VLA trajectories while mining",
    captureHint: "Stores instruction, object, timing and normalized 3D waypoints for every key physical action.",
    ros: "ROS 2 / Robot Mind Export API",
    rosHint: "Simulated endpoint. When enabled, mined actions are published as evermine_msgs/msg/MindAction.",
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
    hint: "Зөвхөн текст биш: Evermine таны видеоноос Vision-Language-Action (VLA) траекторууд — гарын хөдөлгөөн, эд зүйл барих координат — цуглуулж, ирээдүйд бодит робот удирдах боломж бүрдүүлнэ.",
    capture: "Олборлохдоо VLA траектор цуглуулах",
    captureHint: "Гол биет үйлдэл бүрийн заавар, объект, хугацаа, 3D цэгүүдийг хадгална.",
    ros: "ROS 2 / Robot Mind Export API",
    rosHint: "Симуляц хийсэн холболт. Идэвхжүүлбэл үйлдлүүд evermine_msgs/msg/MindAction болж нийтлэгдэнэ.",
    topic: "ROS 2 сэдэв",
    export: "Жишээ экспорт татах",
    trajectories: (n: number) => `${n} үйлдлийн траектор бэлэн`,
    none: "Одоогоор биет үйлдэл бүртгэгдээгүй — гар, эд зүйлийн хөдөлгөөнтэй видео олборлоно уу.",
    saved: "Биет AI тохиргоо хадгалагдлаа.",
    exported: "Robot mind экспорт татагдлаа.",
  },
} as const;

export function EmbodiedAiCard({
  lang,
  trajectories = [],
}: {
  lang: "en" | "mn";
  trajectories?: VlaTrajectory[];
}) {
  const t = copy[lang];
  const [settings, setSettings] = useState<EmbodiedSettings>(defaultEmbodiedSettings);
  const [hydrated, setHydrated] = useState(false);

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
      </div>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{t.hint}</p>

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
