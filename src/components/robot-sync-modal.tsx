import { useEffect, useState } from "react";
import { Bot, Download, X } from "lucide-react";

import { deploymentUrl, rosClientScript } from "@/lib/robot-deploy";
import type { FeedItem } from "@/lib/feed";
import { MindSpecs } from "@/components/mind-specs";
import type { Lang } from "@/lib/i18n";


const TOPIC = "/evermind/mind_action";

/** Robot Sync: QR code + ROS 2 / VLA package download for a feed video. */
export function RobotSyncModal({
  open,
  onClose,
  item,
  lang = "en",
}: {
  open: boolean;
  onClose: () => void;
  item: FeedItem | null;
  lang?: Lang;
}) {
  const [qr, setQr] = useState("");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = item?.deployToken ? deploymentUrl(origin, item.deployToken) : "";

  useEffect(() => {
    if (!url) {
      setQr("");
      return;
    }
    void import("qrcode").then((m) => (m.default ?? m).toDataURL(url, { margin: 1, width: 220, color: { dark: "#111111", light: "#ffffff" } }))
      .then(setQr)
      .catch(() => setQr(""));
  }, [url]);

  if (!open || !item) return null;

  const download = (name: string, body: string, type: string) => {
    const blob = new Blob([body], { type });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    URL.revokeObjectURL(href);
  };

  const stubPackage = {
    schema: "evermind.robot_mind/v1",
    mind_id: item.mindId ?? item.id,
    title: item.title,
    generated_at: new Date().toISOString(),
    runtime: { ros_distro: "jazzy", topic: TOPIC, message_type: "evermind_msgs/msg/MindAction" },
    source: url || null,
    knowledge_graph: [],
    vla_trajectories: [],
  };

  return (
    <div className="dark fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl">

        <div className="mb-4 flex items-center gap-3">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {lang === "mn" ? "Робот синк" : lang === "ko" ? "로봇 동기화" : "Robot Sync"} — {item.title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {url ? (
          <>
            <div className="mx-auto mb-4 w-fit rounded-xl border border-border bg-white p-3">
              {qr ? <img src={qr} alt="Robot deployment QR code" className="h-40 w-40" /> : null}
            </div>
            <code className="mb-4 block truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[11px] text-primary">
              {url}
            </code>
          </>
        ) : (
          <p className="mb-4 text-xs text-muted-foreground">
            {lang === "mn"
              ? "Энэ мэдлэгийн Оюуны OTA багц хараахан нийтлэгдээгүй байна. Доорх ROS 2 ачаалагчийг татаж туршиж болно."
              : lang === "ko"
              ? "이 마인드는 아직 OTA 패키지가 게시되지 않았습니다. 아래 ROS 2 로더를 다운로드해 연동을 테스트해 볼 수 있습니다."
              : "No OTA package has been published for this mind yet. You can still download the ROS 2 loader to test the integration."}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => download("mind-package.json", JSON.stringify(stubPackage, null, 2), "application/json")}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" /> package.json
          </button>
          <button
            type="button"
            onClick={() =>
              download("evermind_mind_loader.py", rosClientScript(url || "<publish-first>", TOPIC), "text/x-python")
            }
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Download className="h-3.5 w-3.5" /> ROS 2 / Python
          </button>
        </div>

        <div className="mt-4">
          <MindSpecs mindId={item.mindId ?? item.id} lang={lang} />
        </div>

      </div>
    </div>
  );
}
