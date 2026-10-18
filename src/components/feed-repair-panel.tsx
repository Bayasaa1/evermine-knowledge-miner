/**
 * Scan & Repair Broken Feed Items. Nothing changes until the creator confirms;
 * a snapshot of every old value is kept on this device for Undo.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { pickCopy, type Lang } from "@/lib/i18n";
import { cleanHandle, isBrokenHandle, looksLikeSummaryTitle } from "@/lib/handle";

type Fix = {
  contentId: string;
  projectId: string;
  youtubeId: string;
  oldTitle: string;
  newTitle: string;
  oldCreator: string;
  newCreator: string;
};
type Snapshot = { contents: { id: string; title: string }[]; projects: { id: string; creator_name: string }[] };

const SNAP_KEY = (uid: string) => `evermind:feed-repair-undo:${uid}`;

const T = {
  title: { en: "Scan & Repair Broken Feed Items", mn: "Фийдийн эвдэрхий бичлэгийг шалгаж засах", ko: "피드 오류 항목 검사 및 복구" },
  scan: { en: "Scan", mn: "Шалгах", ko: "검사" },
  none: { en: "Nothing broken found.", mn: "Алдаатай зүйл олдсонгүй.", ko: "문제가 없습니다." },
  apply: { en: "Confirm & Apply Fixes", mn: "Батлаад засах", ko: "확인 후 적용" },
  undo: { en: "Revert / Undo", mn: "Буцаах", ko: "되돌리기" },
  done: { en: "Fixed", mn: "Засагдлаа", ko: "수정됨" },
  reverted: { en: "Reverted", mn: "Буцаагдлаа", ko: "되돌림" },
};

async function oembed(id: string): Promise<{ title: string; author: string } | null> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: string; author_name?: string };
    return { title: (j.title || "").trim(), author: (j.author_name || "").trim() };
  } catch {
    return null;
  }
}

export function FeedRepairPanel({ lang, userId }: { lang: Lang; userId: string }) {
  const t = (k: keyof typeof T) => pickCopy(T[k], lang);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [fixes, setFixes] = useState<Fix[] | null>(null);
  const [hasUndo, setHasUndo] = useState(() => typeof window !== "undefined" && !!localStorage.getItem(SNAP_KEY(userId)));

  const scan = async () => {
    setBusy(true);
    const [{ data: projects }, { data: rows }] = await Promise.all([
      supabase.from("projects").select("id,creator_name,persona_id").eq("user_id", userId),
      supabase.from("project_content").select("id,project_id,youtube_id,title").eq("user_id", userId),
    ]);
    const byId = new Map((projects ?? []).map((p) => [p.id, p]));
    const out: Fix[] = [];
    for (const row of rows ?? []) {
      const p = byId.get(row.project_id);
      const creator = (p?.creator_name || "").trim();
      const badCreator = !creator || creator === "Evermind creator" || isBrokenHandle(cleanHandle(creator)) || creator.length > 24;
      const badTitle = looksLikeSummaryTitle(row.title);
      if (!badCreator && !badTitle) continue;
      if (!row.youtube_id) continue;
      const meta = await oembed(row.youtube_id);
      if (!meta) continue;
      const newTitle = badTitle && meta.title ? meta.title : row.title;
      const newCreator = badCreator && meta.author ? meta.author : creator;
      if (newTitle === row.title && newCreator === creator) continue;
      out.push({ contentId: row.id, projectId: row.project_id, youtubeId: row.youtube_id, oldTitle: row.title, newTitle, oldCreator: creator, newCreator });
    }
    setFixes(out);
    setBusy(false);
  };

  const apply = async () => {
    if (!fixes?.length) return;
    setBusy(true);
    const snap: Snapshot = { contents: [], projects: [] };
    const doneProjects = new Set<string>();
    for (const f of fixes) {
      if (f.newTitle !== f.oldTitle) {
        snap.contents.push({ id: f.contentId, title: f.oldTitle });
        await supabase.from("project_content").update({ title: f.newTitle }).eq("id", f.contentId).eq("user_id", userId);
      }
      if (f.newCreator !== f.oldCreator && !doneProjects.has(f.projectId)) {
        doneProjects.add(f.projectId);
        snap.projects.push({ id: f.projectId, creator_name: f.oldCreator });
        await supabase.from("projects").update({ creator_name: f.newCreator }).eq("id", f.projectId).eq("user_id", userId);
      }
    }
    localStorage.setItem(SNAP_KEY(userId), JSON.stringify(snap));
    setHasUndo(true);
    setFixes(null);
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["home-feed"] });
    toast.success(t("done"));
  };

  const undo = async () => {
    const raw = localStorage.getItem(SNAP_KEY(userId));
    if (!raw) return;
    setBusy(true);
    const snap = JSON.parse(raw) as Snapshot;
    for (const c of snap.contents) await supabase.from("project_content").update({ title: c.title }).eq("id", c.id).eq("user_id", userId);
    for (const p of snap.projects) await supabase.from("projects").update({ creator_name: p.creator_name }).eq("id", p.id).eq("user_id", userId);
    localStorage.removeItem(SNAP_KEY(userId));
    setHasUndo(false);
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["home-feed"] });
    toast.success(t("reverted"));
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <h3 className="flex-1 text-sm font-semibold text-foreground">{t("title")}</h3>
        <Button size="sm" variant="secondary" onClick={scan} disabled={busy}>
          {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {t("scan")}
        </Button>
        {hasUndo && (
          <Button size="sm" variant="outline" onClick={undo} disabled={busy}>
            {t("undo")}
          </Button>
        )}
      </div>
      {fixes && fixes.length === 0 && <p className="text-xs text-muted-foreground">{t("none")}</p>}
      {fixes && fixes.length > 0 && (
        <>
          <ul className="max-h-72 space-y-2 overflow-y-auto text-xs">
            {fixes.map((f) => (
              <li key={f.contentId} className="rounded-lg bg-muted p-2">
                {f.oldTitle !== f.newTitle && (
                  <p><span className="text-muted-foreground line-through">{f.oldTitle}</span> → <span className="text-foreground">{f.newTitle}</span></p>
                )}
                {f.oldCreator !== f.newCreator && (
                  <p><span className="text-muted-foreground line-through">{f.oldCreator || "—"}</span> → <span className="text-foreground">{f.newCreator} ({cleanHandle(f.newCreator)})</span></p>
                )}
              </li>
            ))}
          </ul>
          <Button size="sm" onClick={apply} disabled={busy}>{t("apply")}</Button>
        </>
      )}
    </div>
  );
}
