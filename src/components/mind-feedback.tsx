import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, MessageSquare, Send, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { MindReviews } from "@/components/mind-reviews";
import { MindSpecs } from "@/components/mind-specs";
import { pickCopy, type Lang } from "@/lib/i18n";


type Comment = {
  id: string;
  user_id: string;
  body: string;
  author_name: string;
  created_at: string;
};

const copy = {
  en: {
    comments: "Comments",
    reviews: "Mind Reviews",
    placeholder: "Ask a question or share a reaction…",
    post: "Post",
    signIn: "Sign in to join the conversation.",
    none: "No comments yet — start the conversation.",
    failed: "Could not post your comment",
    deleted: "Comment deleted",
  },
  mn: {
    comments: "Сэтгэгдэл",
    reviews: "Баталгаажсан үнэлгээ",
    placeholder: "Асуулт асуух эсвэл сэтгэгдлээ бичнэ үү…",
    post: "Нийтлэх",
    signIn: "Ярилцахын тулд нэвтэрнэ үү.",
    none: "Одоогоор сэтгэгдэл алга — эхлүүлээрэй.",
    failed: "Сэтгэгдлийг нийтэлж чадсангүй",
    deleted: "Сэтгэгдэл устгагдлаа",
  },
  ko: {
    comments: "댓글",
    reviews: "검증된 리뷰",
    placeholder: "질문을 하거나 소감을 남겨보세요…",
    post: "게시",
    signIn: "대화에 참여하려면 로그인하세요.",
    none: "아직 댓글이 없습니다 — 대화를 시작해보세요.",
    failed: "댓글을 게시하지 못했습니다",
    deleted: "댓글이 삭제되었습니다",
  },
} as const;

/** Dual feedback surface: comments react to the content; reviews rate the mind's chat/voice/video-call experience. */
export function MindFeedback({
  mindId,
  lang = "en",
  purchased = false,
  canEditSpecs = false,
}: {
  mindId: string;
  lang?: Lang;
  purchased?: boolean;
  /** Creator-side surfaces let the owner publish a new version + release notes. */
  canEditSpecs?: boolean;
}) {
  const t = pickCopy(copy, lang);
  const [tab, setTab] = useState<"comments" | "reviews">("comments");

  return (
    <div className="space-y-3">
      <MindSpecs mindId={mindId} lang={lang} canEdit={canEditSpecs} />
      <section className="rounded-[12px] border border-border bg-card">
      <div className="flex border-b border-border">

        {(["comments", "reviews"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors ${
              tab === key
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "comments" ? <MessageSquare className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
            {key === "comments" ? t.comments : t.reviews}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "comments" ? (
          <CommentThread mindId={mindId} t={t} />
        ) : (
          <MindReviews mindId={mindId} lang={lang} />
        )}
      </div>
      </section>
    </div>
  );

}

function CommentThread({ mindId, t }: { mindId: string; t: (typeof copy)["en"] }) {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("mind_comments")
      .select("id,user_id,body,author_name,created_at")
      .eq("mind_id", mindId)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems((data as Comment[] | null) ?? []);
  }, [mindId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!user || !body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("mind_comments").insert({
      user_id: user.id,
      mind_id: mindId,
      body: body.trim(),
      author_name: profile?.displayName || user.email?.split("@")[0] || "Evermind user",
    });
    setBusy(false);
    if (error) {
      toast.error(`${t.failed}: ${error.message}`);
      return;
    }
    setBody("");
    void load();
  };

  const remove = async (id: string) => {
    await supabase.from("mind_comments").delete().eq("id", id);
    toast.success(t.deleted);
    void load();
  };

  return (
    <div>
      {user ? (
        <div className="mb-4 flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder={t.placeholder}
            className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {t.post}
          </button>
        </div>
      ) : (
        <p className="mb-4 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" /> {t.signIn}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.none}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="rounded-xl border border-border p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{c.author_name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
                {user?.id === c.user_id && (
                  <button
                    type="button"
                    aria-label="Delete comment"
                    onClick={() => void remove(c.id)}
                    className="ml-auto text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
