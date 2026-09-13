import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Share2, Lock, Trash2, MessageSquare, Trophy, Clock } from "lucide-react";
import { listViewerBrains, setBrainSharing, eraseBrain } from "@/lib/viewer-brain.functions";
import { useDisplayTexts } from "@/lib/i18n";
import { stageLabel } from "@/lib/viewer-brain";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export function ViewerBrainHub() {
  const [
    viewerBrainsTitle,
    refreshLabel,
    viewerBrainsEmpty,
    signedOutText,
    sharedText,
    privateText,
    erasedText,
    confirmText,
  ] = useDisplayTexts([
    "Your Core Brains",
    "Refresh",
    "Talk, call, or watch any Mind to build your private relationship memory here.",
    "Sign in to see the private memory you build with each creator.",
    "Shared with creator",
    "Private again",
    "Core Brain erased",
    "Erase this Core Brain? This cannot be undone.",
  ]);
  const { isAuthenticated } = useAuth();
  const load = useServerFn(listViewerBrains);
  const share = useServerFn(setBrainSharing);
  const erase = useServerFn(eraseBrain);
  const [brains, setBrains] = useState<Awaited<ReturnType<typeof load>>>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);


  const refresh = async () => {
    // Signed-out visitors have no Core Brains — asking the server would only
    // return an "unauthorized" error at them.
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await load({ data: undefined });
      setBrains(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleShare = async (mindId: string, next: boolean) => {
    try {
      await share({ data: { mindId, shared: next } });
      toast.success(next ? sharedText : privateText);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const handleErase = async (mindId: string) => {
    if (!confirm(confirmText)) return;
    try {
      await erase({ data: { mindId } });
      toast.success(erasedText);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">{viewerBrainsTitle}</h2>
        </div>
        {isAuthenticated && (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "…" : refreshLabel}
          </button>
        )}
      </div>

      {!isAuthenticated && <p className="text-sm text-muted-foreground">{signedOutText}</p>}

      {isAuthenticated && brains.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">{viewerBrainsEmpty}</p>
      )}

      <div className="space-y-3">
        {brains.map((brain) => {
          const p = brain.payload;
          const isOpen = expanded === brain.id;
          return (
            <div key={brain.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">{brain.mindId}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{stageLabel(brain.stats.stage)}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {brain.stats.sessions}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {Math.round(brain.stats.talkSeconds / 60)}m</span>
                    <span className="flex items-center gap-1"><Trophy className="h-3 w-3" /> {p.achievements.length}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void toggleShare(brain.mindId, !brain.sharedWithCreator)}
                    className={`rounded-full p-2 ${brain.sharedWithCreator ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted"}`}
                    aria-label={brain.sharedWithCreator ? "Shared with creator" : "Private"}
                    title={brain.sharedWithCreator ? "Shared with creator" : "Private"}
                  >
                    {brain.sharedWithCreator ? <Share2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleErase(brain.mindId)}
                    className="rounded-full p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Erase"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
                  {p.aboutMe.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">About you</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {p.aboutMe.slice(-10).map((f) => (
                          <li key={f.id}><span className="font-medium">{f.key}:</span> {f.value}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {p.topics.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Topics</p>
                      <p className="mt-1">{p.topics.join(", ")}</p>
                    </div>
                  )}
                  {p.moments.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Recent moments</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {p.moments.slice(-5).map((m) => (
                          <li key={m.id}>{m.date}: {m.title}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {p.achievements.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Achievements</p>
                      <p className="mt-1">{p.achievements.map((a) => a.title).join(", ")}</p>
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : brain.id)}
                className="mt-2 text-xs text-primary hover:underline"
              >
                {isOpen ? "Show less" : "Show more"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
