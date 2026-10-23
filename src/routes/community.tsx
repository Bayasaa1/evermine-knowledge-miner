import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { StoryBar } from "@/components/story-bar";
import { CommentSection } from "@/components/comment-section";
import { createPost, deletePost, listPosts, type UserPost } from "@/lib/community";
import { useAuth } from "@/hooks/use-auth";
import { pickCopy, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/community")({
  head: () => ({
    meta: [
      { title: "Posts & stories — Evermind" },
      {
        name: "description",
        content: "Share a post or a 24-hour story with the Evermind community. Everyone here is a creator.",
      },
      { property: "og:title", content: "Posts & stories — Evermind" },
      { property: "og:description", content: "Share a post or a 24-hour story on Evermind." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommunityPage,
});

const copy = {
  en: {
    title: "Posts & stories",
    subtitle: "Everyone here is a creator. Share a thought, a photo or a short clip.",
    placeholder: "What do you want to share?",
    photo: "Add photo or clip",
    post: "Post",
    signIn: "Sign in to post.",
    empty: "No posts yet — write the first one.",
    posted: "Posted",
    failed: "Could not post",
    deleted: "Post deleted",
  },
  mn: {
    title: "Пост ба Story",
    subtitle: "Энд хүн бүр бүтээгч. Бодол, зураг, богино бичлэгээ хуваалцаарай.",
    placeholder: "Юу хуваалцах вэ?",
    photo: "Зураг эсвэл бичлэг нэмэх",
    post: "Нийтлэх",
    signIn: "Нийтлэхийн тулд нэвтэрнэ үү.",
    empty: "Одоогоор пост алга — та эхнийхийг бичээрэй.",
    posted: "Нийтлэгдлээ",
    failed: "Нийтэлж чадсангүй",
    deleted: "Пост устгагдлаа",
  },
  ko: {
    title: "게시물과 스토리",
    subtitle: "여기서는 모두가 창작자입니다. 생각, 사진, 짧은 영상을 공유하세요.",
    placeholder: "무엇을 공유할까요?",
    photo: "사진 또는 영상 추가",
    post: "게시",
    signIn: "게시하려면 로그인하세요.",
    empty: "아직 게시물이 없습니다 — 첫 글을 남겨보세요.",
    posted: "게시되었습니다",
    failed: "게시하지 못했습니다",
    deleted: "게시물이 삭제되었습니다",
  },
} as const;

function CommunityPage() {
  const { lang } = useLang();
  const c = pickCopy(copy, lang);
  const { profile, userId } = useAuth();
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    void listPosts()
      .then(setPosts)
      .catch(() => setPosts([]));
  }, []);

  useEffect(refresh, [refresh]);

  const submit = async () => {
    if (!userId) {
      toast.error(c.signIn);
      return;
    }
    if (!body.trim() && !file) return;
    setBusy(true);
    try {
      await createPost({
        body,
        file,
        authorName: profile?.displayName ?? "Creator",
        authorAvatar: profile?.avatarUrl,
      });
      setBody("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success(c.posted);
      refresh();
    } catch {
      toast.error(c.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <div
        className="mx-auto max-w-2xl px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 1.5rem)" }}
      >
        <h1 className="text-lg font-semibold">{c.title}</h1>
        <p className="mb-4 text-xs text-muted-foreground">{c.subtitle}</p>

        <StoryBar />

        <div className="mt-4 rounded-2xl border border-border bg-card p-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={c.placeholder}
            rows={3}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <ImagePlus className="h-4 w-4" />
              <span className="truncate">{file ? file.name : c.photo}</span>
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || (!body.trim() && !file)}
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {c.post}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          {posts.length === 0 && <p className="text-xs text-muted-foreground">{c.empty}</p>}
          {posts.map((p) => (
            <article key={p.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-3">
                {p.authorAvatar ? (
                  <img src={p.authorAvatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {p.authorName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.authorName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(p.createdAt).toLocaleString()}
                  </p>
                </div>
                {p.userId === userId && (
                  <button
                    type="button"
                    aria-label={c.deleted}
                    onClick={async () => {
                      await deletePost(p.id).catch(() => undefined);
                      toast.success(c.deleted);
                      refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              {p.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.body}</p>}
              {p.mediaUrl && p.mediaKind === "video" && (
                <video src={p.mediaUrl} controls className="mt-3 w-full rounded-xl" />
              )}
              {p.mediaUrl && p.mediaKind === "image" && (
                <img src={p.mediaUrl} alt="" className="mt-3 w-full rounded-xl object-cover" />
              )}
              <CommentSection postId={p.id} userId={userId} />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
