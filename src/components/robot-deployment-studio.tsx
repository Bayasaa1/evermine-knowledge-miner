import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Bot, Copy, Download, Link2, QrCode, Radio, RefreshCw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import type { ChunkResult } from "@/lib/gemini";
import { buildRobotPackage, deploymentUrl, rosClientScript } from "@/lib/robot-deploy";
import { getDeployment, publishDeployment, type DeployedPackage } from "@/lib/robot-deploy.functions";
import { loadEmbodiedSettings } from "@/lib/embodied";
import { publishToFeed } from "@/lib/feed";
import { getCreationCategory } from "@/lib/creation-category";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  auditChunks,
  canPublish,
  confirmOwnership,
  isOwnershipConfirmed,
  type CopyrightVerdict,
} from "@/lib/copyright";

import coverFounder from "@/assets/cover-founder.jpg";


const copy = {
  en: {
    title: "Robot Deployment Studio",
    hint: "Publish this Mind Vault over the air. A robot scans the QR code or issues a single HTTP GET to pull the compiled VLA trajectories, spatial coordinates and knowledge graph straight into its local runtime memory.",
    publish: "Publish mind package",
    republish: "Re-publish latest mind",
    link: "Direct ROS 2 / API link",
    qr: "Mind Deployment QR",
    downloadPkg: "Download package.json",
    downloadRos: "Download ROS 2 / Python package",
    copied: "Deployment link copied.",
    published: "Mind package deployed. Robots can pull it now.",
    signIn: "Sign in to publish this mind to robots.",
    empty: "Mine a video first — the deployment package is built from mined knowledge nodes and action trajectories.",
    stats: (n: number, t: number, s: number) => `${n} knowledge nodes · ${t} VLA trajectories · ${s} spatial actions`,
    updated: "Last deployed",
    failed: "Deployment failed",
    copyrightBlocked: "Copyright check flagged this footage — confirm you own it before publishing.",
    copyrightTitle: "Copyright & authenticity check",
    copyrightConfirm: "I own this footage — publish anyway",
    copyrightConfirmed: "Ownership confirmed. You can publish now.",
  },
  mn: {
    title: "Роботын байршуулалтын студи",
    hint: "Энэ Оюун санг агаараар нийтэл. Робот QR кодыг уншиж эсвэл нэг HTTP GET хүсэлтээр VLA траектор, орон зайн координат, мэдлэгийн графыг өөрийн санах ойд шууд татна.",
    publish: "Оюуны багц нийтлэх",
    republish: "Сүүлийн оюуныг дахин нийтлэх",
    link: "Шууд ROS 2 / API холбоос",
    qr: "Байршуулалтын QR код",
    downloadPkg: "package.json татах",
    downloadRos: "ROS 2 / Python багц татах",
    copied: "Холбоос хуулагдлаа.",
    published: "Оюуны багц байршлаа. Робот татах боломжтой.",
    signIn: "Нийтлэхийн тулд нэвтэрнэ үү.",
    empty: "Эхлээд видео олборлоно уу — багц нь олборлосон мэдлэг, үйлдлээс бүрдэнэ.",
    stats: (n: number, t: number, s: number) => `${n} мэдлэгийн зангилаа · ${t} VLA траектор · ${s} орон зайн үйлдэл`,
    updated: "Сүүлд байршуулсан",
    failed: "Байршуулалт амжилтгүй",
    copyrightBlocked: "Зохиогчийн эрхийн шалгалт сэрэмжлүүлэв — эзэмшлээ баталгаажуулна уу.",
    copyrightTitle: "Зохиогчийн эрх ба жинхэнэ эсэхийн шалгалт",
    copyrightConfirm: "Энэ бичлэг миний өөрийн бүтээл — нийтэл",
    copyrightConfirmed: "Эзэмшил баталгаажлаа. Одоо нийтэлж болно.",
  },
} as const;

export function RobotDeploymentStudio({
  lang,
  mindId,
  mindTitle,
  chunks,
  isAuthenticated,
}: {
  lang: "en" | "mn";
  mindId: string;
  mindTitle: string;
  chunks: ChunkResult[];
  isAuthenticated: boolean;
}) {
  const t = copy[lang];
  const fetchDeployment = useServerFn(getDeployment);
  const pushDeployment = useServerFn(publishDeployment);

  const [topic, setTopic] = useState("/evermind/mind_action");
  const [deployment, setDeployment] = useState<DeployedPackage | null>(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copyrightVerdict, setCopyrightVerdict] = useState<CopyrightVerdict | null>(null);

  const pkg = useMemo(
    () => buildRobotPackage({ mindId, title: mindTitle, topic, chunks }),
    [mindId, mindTitle, topic, chunks],
  );

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = deployment ? deploymentUrl(origin, deployment.token) : "";

  useEffect(() => {
    void loadEmbodiedSettings().then((s) => setTopic(s.topic));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !mindId) return;
    void fetchDeployment({ data: { mindId } })
      .then(setDeployment)
      .catch(() => setDeployment(null));
  }, [fetchDeployment, isAuthenticated, mindId]);

  useEffect(() => {
    if (!url) {
      setQr("");
      return;
    }
    void QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#111111", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  const download = (name: string, body: string, type: string) => {
    const blob = new Blob([body], { type });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    URL.revokeObjectURL(href);
  };

  /** "HH:MM:SS" / "MM:SS" → seconds. */
  const toSeconds = (stamp: string) => {
    const parts = String(stamp ?? "")
      .split(":")
      .map((p) => Number(p) || 0);
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  };

  /** Version/spec metadata is derived from the mined material itself. */
  const saveSpecs = async (previous: { version: string } | null) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const nodes = chunks.flatMap((c) => c.knowledgeNodes ?? []);
    const seconds = chunks.reduce(
      (sum, c) => sum + Math.max(0, ...(c.knowledgeNodes ?? []).map((n) => toSeconds(n.timestamp_end))),
      0,
    );
    const accuracy = nodes.length
      ? (nodes.reduce((s, n) => s + (n.confidence_score ?? 0), 0) / nodes.length) * 100
      : 0;
    const m = /v?(\d+)\.(\d+)/.exec(previous?.version ?? "");
    const version = m ? `v${m[1]}.${Number(m[2]) + 1}` : "v1.0";
    await supabase.from("mind_specs").upsert(
      {
        user_id: uid,
        mind_id: mindId,
        training_hours: Number((seconds / 3600).toFixed(2)),
        version,
        accuracy_score: Number(accuracy.toFixed(1)),
        compatibility: ["ROS 2", "Web Voice", "Video Call"],
        changelog_notes: releaseNotes.trim(),
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: "mind_id" },
    );
  };

  const onPublish = async () => {
    if (!isAuthenticated) {
      toast.error(t.signIn);
      return;
    }
    // Copyright gate: flagged footage cannot go public until the creator confirms ownership.
    const verdict = auditChunks(chunks, await isOwnershipConfirmed(mindId));
    if (!canPublish(verdict)) {
      setCopyrightVerdict(verdict);
      toast.error(t.copyrightBlocked);
      return;
    }

    setBusy(true);
    try {
      const next = await pushDeployment({ data: { mindId, title: mindTitle, pkg } });
      setDeployment(next);
      const { data: prior } = await supabase
        .from("mind_specs")
        .select("version")
        .eq("mind_id", mindId)
        .maybeSingle();
      await saveSpecs(prior ?? null).catch(() => undefined);
      // Publishing a mind renders it straight onto the global Home Feed.
      await publishToFeed({
        id: `local:${mindId}`,
        mindId: null,
        creator: mindTitle || "My Mind",
        handle: "@you",
        title: mindTitle || "My Mind",
        description: t.stats(pkg.stats.nodes, pkg.stats.trajectories, pkg.stats.spatial_actions),
        category: getCreationCategory(),
        src: null,
        poster: coverFounder,
        tags: ["Robot Brain", "VLA", "ROS 2"],
        price: 0,
        currency: "USD",
        deployToken: next.token,
      }).catch(() => undefined);
      toast.success(t.published);
    } catch (e) {
      toast.error(`${t.failed}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };


  return (
    <section id="robot-deploy" className="min-w-0 rounded-[12px] border border-border bg-card p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
        <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          OTA
        </span>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{t.hint}</p>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="deployTopic" className="mb-1.5 block text-xs text-muted-foreground">
            ROS 2 topic
          </label>
          <input
            id="deployTopic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => void onPublish()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-terracotta-dark disabled:opacity-50"
        >
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
          {deployment ? t.republish : t.publish}
        </button>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        {pkg.stats.nodes + pkg.stats.trajectories > 0
          ? t.stats(pkg.stats.nodes, pkg.stats.trajectories, pkg.stats.spatial_actions)
          : t.empty}
      </p>

      {copyrightVerdict?.state === "FLAGGED_COPYRIGHT" && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
            {t.copyrightTitle} · FLAGGED_COPYRIGHT
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {copyrightVerdict.signals.slice(0, 6).map((s, i) => (
              <li key={`${s.timestamp}-${i}`}>
                <span className="font-mono text-primary">{s.timestamp}</span> · {s.kind} — {s.detail} (
                {Math.round(s.confidence * 100)}%)
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            onClick={async () => {
              await confirmOwnership(mindId);
              setCopyrightVerdict(auditChunks(chunks, true));
              toast.success(t.copyrightConfirmed);
            }}
          >
            {t.copyrightConfirm}
          </button>
        </div>
      )}



      {deployment && (
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="rounded-xl border border-border bg-white p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              <QrCode className="h-3.5 w-3.5" /> {t.qr}
            </div>
            {qr ? <img src={qr} alt={t.qr} className="h-auto w-full rounded-md" /> : null}
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" /> {t.link}
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-primary">{url}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(url);
                  toast.success(t.copied);
                }}
                className="text-muted-foreground transition-colors hover:text-primary"
                aria-label={t.copied}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => download("mind-package.json", JSON.stringify(pkg, null, 2), "application/json")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Download className="h-3.5 w-3.5" /> {t.downloadPkg}
              </button>
              <button
                type="button"
                onClick={() => download("evermind_mind_loader.py", rosClientScript(url, topic), "text/x-python")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Download className="h-3.5 w-3.5" /> {t.downloadRos}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t.updated}: {new Date(deployment.updatedAt).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
