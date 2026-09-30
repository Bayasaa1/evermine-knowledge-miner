import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { createStory, deleteStory, listStories, type UserStory } from "@/lib/community";
import { useAuth } from "@/hooks/use-auth";
import { pickCopy, useLang } from "@/lib/i18n";

const copy = {
  en: {
    yourStory: "Your story",
    signIn: "Sign in to post a story",
    posted: "Story posted — it disappears in 24 hours",
    failed: "Could not post your story",
    empty: "No stories yet. Be the first.",
    remove: "Delete",
    removed: "Story deleted",
  },
  mn: {
    yourStory: "Таны story",
    signIn: "Story тавихын тулд нэвтэрнэ үү",
    posted: "Story нийтлэгдлээ — 24 цагийн дараа алга болно",
    failed: "Story нийтэлж чадсангүй",
    empty: "Одоогоор story алга. Та эхлүүлээрэй.",
    remove: "Устгах",
    removed: "Story устгагдлаа",
  },
  ko: {
    yourStory: "내 스토리",
    signIn: "스토리를 올리려면 로그인하세요",
    posted: "스토리가 올라갔습니다 — 24시간 후 사라집니다",
    failed: "스토리를 올리지 못했습니다",
    empty: "아직 스토리가 없습니다. 먼저 올려보세요.",
    remove: "삭제",
    removed: "스토리가 삭제되었습니다",
  },
} as const;

/** Round 24-hour stories, newest first, with an "add yours" button in front. */
export function StoryBar() {
  const lang = useLang();
  const c = pickCopy(copy, lang);
  const { profile, userId } = useAuth();
  const [stories, setStories] = useState<UserStory[]>([]);
  const [open, setOpen] = useState<UserStory | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    void listStories()
      .then(setStories)
      .catch(() => setStories([]));
  }, []);

  useEffect(refresh, [refresh]);

  const pick = () => {
    if (!userId) {
      toast.error(c.signIn);
      return;
    }
    fileRef.current?.click();
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await createStory({ file, authorName: profile?.displayName ?? "Creator", authorAvatar: profile?.avatarUrl });
      toast.success(c.posted);
      refresh();
    } catch {
      toast.error(c.failed);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <div className="flex gap-3 overflow-x-auto pb-2">
        <button type="button" onClick={pick} disabled={busy} className="flex w-16 shrink-0 flex-col items-center gap-1">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-foreground/40 bg-card">
            <Plus className="h-5 w-5" />
          </span>
          <span className="w-16 truncate text-center text-[10px] text-muted-foreground">{c.yourStory}</span>
        </button>

        {stories.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setOpen(s)}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
          >
            <span className="rounded-full bg-gradient-to-tr from-foreground/70 to-foreground/20 p-[2px]">
              {s.mediaKind === "video" ? (
                <video src={s.mediaUrl ?? undefined} muted className="h-16 w-16 rounded-full object-cover" />
              ) : (
                <img src={s.mediaUrl ?? undefined} alt="" className="h-16 w-16 rounded-full object-cover" />
              )}
            </span>
            <span className="w-16 truncate text-center text-[10px] text-muted-foreground">{s.authorName}</span>
          </button>
        ))}
      </div>

      {stories.length === 0 && <p className="text-xs text-muted-foreground">{c.empty}</p>}

      {open && (
        <div className="fixed inset-0 z-[95] flex flex-col bg-black">
          <div
            className="flex items-center justify-between px-4 pb-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 1rem)" }}
          >
            <p className="text-sm font-semibold text-white">{open.authorName}</p>
            <div className="flex items-center gap-3">
              {open.userId === userId && (
                <button
                  type="button"
                  className="text-xs text-white/70"
                  onClick={async () => {
                    await deleteStory(open.id).catch(() => undefined);
                    toast.success(c.removed);
                    setOpen(null);
                    refresh();
                  }}
                >
                  {c.remove}
                </button>
              )}
              <button type="button" aria-label="Close" onClick={() => setOpen(null)} className="p-2">
                <X className="h-6 w-6 text-white" />
              </button>
            </div>
          </div>
          <div className="flex flex-1 items-center justify-center px-2 pb-8">
            {open.mediaKind === "video" ? (
              <video src={open.mediaUrl ?? undefined} controls autoPlay className="max-h-full w-full rounded-xl" />
            ) : (
              <img src={open.mediaUrl ?? undefined} alt="" className="max-h-full w-full rounded-xl object-contain" />
            )}
          </div>
          {open.caption && <p className="px-4 pb-8 text-center text-sm text-white">{open.caption}</p>}
        </div>
      )}
    </div>
  );
}
