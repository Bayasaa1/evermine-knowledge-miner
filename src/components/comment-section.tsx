import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Loader2, MessageCircle, Reply, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { pickCopy, useLang } from "@/lib/i18n";
import { addPostComment, commentForest, listCommentLikes, listPostComments, removePostComment, setCommentLiked, type CommentLike, type PostComment } from "@/lib/post-comments";

const copy = {
  en: { comments: "Comments", placeholder: "Write a comment…", empty: "No comments yet", reply: "Reply", replying: "Replying to", cancel: "Cancel reply", like: "Like", unlike: "Unlike", send: "Send comment", deleted: "Comment deleted", remove: "Delete comment", confirm: "Delete this comment? Replies will remain.", signIn: "Sign in to comment or like.", failed: "Could not save. Please try again.", loadFailed: "Could not load comments", retry: "Try again" },
  mn: { comments: "Сэтгэгдэл", placeholder: "Сэтгэгдэл бичих…", empty: "Одоогоор сэтгэгдэл алга", reply: "Хариулах", replying: "Хариулж буй хүн:", cancel: "Хариулт цуцлах", like: "Таалагдлаа", unlike: "Like буцаах", send: "Сэтгэгдэл илгээх", deleted: "Сэтгэгдэл устгагдсан", remove: "Сэтгэгдэл устгах", confirm: "Энэ сэтгэгдлийг устгах уу? Хариултууд нь үлдэнэ.", signIn: "Сэтгэгдэл бичих, like дарахын тулд нэвтэрнэ үү.", failed: "Хадгалж чадсангүй. Дахин оролдоно уу.", loadFailed: "Сэтгэгдэл ачаалж чадсангүй", retry: "Дахин оролдох" },
  ko: { comments: "댓글", placeholder: "댓글 작성…", empty: "아직 댓글이 없습니다", reply: "답글", replying: "답글 대상:", cancel: "답글 취소", like: "좋아요", unlike: "좋아요 취소", send: "댓글 보내기", deleted: "삭제된 댓글", remove: "댓글 삭제", confirm: "댓글을 삭제할까요? 답글은 남습니다.", signIn: "댓글과 좋아요를 남기려면 로그인하세요.", failed: "저장하지 못했습니다. 다시 시도하세요.", loadFailed: "댓글을 불러오지 못했습니다", retry: "다시 시도" },
} as const;

export function CommentSection({ postId, userId }: { postId: string; userId: string | null }) {
  const { lang } = useLang();
  const c = pickCopy(copy, lang);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [likes, setLikes] = useState<CommentLike[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  const pendingLikeIds = useRef<Set<string>>(new Set());
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    const ticket = ++generation.current;
    try {
      const [rows, reactions] = await Promise.all([listPostComments(postId), open ? listCommentLikes(postId) : Promise.resolve([])]);
      if (!mounted.current || ticket !== generation.current) return;
      setComments(rows); setLikes(reactions); setLoadError(false);
    } catch {
      if (mounted.current && ticket === generation.current) setLoadError(true);
    } finally {
      if (mounted.current && ticket === generation.current) setLoading(false);
    }
  }, [postId, open, userId]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 120); };
    const channel = supabase.channel(`post-comments:${postId}:${open}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "post_comments", filter: `post_id=eq.${postId}` }, changed);
    if (open) {
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "comment_likes", filter: `post_id=eq.${postId}` }, changed)
        // Deleted rows do not carry filter columns in Realtime's default identity.
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "comment_likes" }, changed);
    }
    channel.subscribe();
    return () => { mounted.current = false; generation.current++; clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [refresh, postId, open]);

  useEffect(() => { setDraft(""); setReplyTo(null); setPending(new Set()); pendingLikeIds.current.clear(); }, [userId]);
  // A new target never shows the previous post's thread; its channel is removed by the effect above.
  useEffect(() => { setComments([]); setLikes([]); setReplyTo(null); setLoadError(false); setLoading(true); pendingLikeIds.current.clear(); setPending(new Set()); }, [postId]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userId) { toast.error(c.signIn); return; }
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      await addPostComment(postId, draft, replyTo?.id ?? null);
      setDraft(""); setReplyTo(null); await refresh();
    } catch { toast.error(c.failed); }
    finally { setSending(false); }
  };

  const react = async (comment: PostComment) => {
    if (!userId) { toast.error(c.signIn); return; }
    // Synchronous guard: state updates lag behind rapid double-taps.
    if (pendingLikeIds.current.has(comment.id)) return;
    pendingLikeIds.current.add(comment.id);
    const liked = likes.some((like) => like.comment_id === comment.id && like.user_id === userId);
    setPending((prev) => new Set(prev).add(comment.id));
    setLikes((prev) => liked ? prev.filter((like) => !(like.comment_id === comment.id && like.user_id === userId)) : [...prev, { comment_id: comment.id, user_id: userId }]);
    try { await setCommentLiked(postId, comment.id, !liked); }
    catch { toast.error(c.failed); }
    finally { pendingLikeIds.current.delete(comment.id); await refresh(); setPending((prev) => { const next = new Set(prev); next.delete(comment.id); return next; }); }
  };

  const { roots, children } = commentForest(comments);
  const renderComment = (comment: PostComment, depth = 0): React.ReactNode => {
    const liked = likes.some((like) => like.comment_id === comment.id && like.user_id === userId);
    const count = likes.filter((like) => like.comment_id === comment.id).length;
    return <li key={comment.id} className="min-w-0">
      <div className="flex items-start gap-2 py-3">
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold">{comment.deleted_at ? "—" : comment.author_name.slice(0, 2).toUpperCase()}{comment.author_avatar && !comment.deleted_at && <img src={comment.author_avatar} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.hidden = true; }} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="break-words text-xs font-semibold">{comment.author_name}</span><time dateTime={comment.created_at} className="text-[10px] text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</time></div>
          <p className={`mt-1 whitespace-pre-wrap break-words text-sm ${comment.deleted_at ? "italic text-muted-foreground" : "text-foreground"}`}>{comment.deleted_at ? c.deleted : comment.content}</p>
          {!comment.deleted_at && <div className="mt-1 flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" title={liked ? c.unlike : c.like} aria-label={liked ? c.unlike : c.like} aria-pressed={liked} disabled={pending.has(comment.id)} onClick={() => void react(comment)}><Heart className={liked ? "fill-current text-primary" : ""} /><span>{count}</span></Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={() => { if (!userId) { toast.error(c.signIn); return; } setReplyTo(comment); inputRef.current?.focus(); }}><Reply />{c.reply}</Button>
            {comment.user_id === userId && <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-muted-foreground" title={c.remove} aria-label={c.remove} onClick={async () => { if (!window.confirm(c.confirm)) return; try { await removePostComment(comment.id); if (replyTo?.id === comment.id) setReplyTo(null); await refresh(); } catch { toast.error(c.failed); } }}><Trash2 /></Button>}
          </div>}
        </div>
      </div>
      {children.has(comment.id) && <ul className={depth < 3 ? "ml-4 border-l border-border pl-3" : "border-l border-border pl-2"}>{children.get(comment.id)?.map((child) => renderComment(child, depth + 1))}</ul>}
    </li>;
  };

  return <section className="mt-3 border-t border-border pt-2">
    <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((prev) => !prev)} className="px-1 text-muted-foreground"><MessageCircle />{c.comments}<span className="tabular-nums">{comments.filter((comment) => !comment.deleted_at).length}</span></Button>
    {open && <div className="mt-2">
      {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /> : loadError ? <div className="text-xs text-muted-foreground">{c.loadFailed}<Button variant="link" size="sm" onClick={() => void refresh()}>{c.retry}</Button></div> : roots.length ? <ul className="max-h-96 overflow-y-auto">{roots.map((comment) => renderComment(comment))}</ul> : <p className="py-3 text-xs text-muted-foreground">{c.empty}</p>}
      {userId ? <form onSubmit={(event) => void send(event)} className="mt-3">
        {replyTo && <div className="mb-2 flex items-center justify-between gap-2 border-l-2 border-primary pl-2 text-xs text-muted-foreground"><span className="truncate">{c.replying} {replyTo.author_name}</span><Button variant="ghost" size="icon-sm" title={c.cancel} aria-label={c.cancel} onClick={() => setReplyTo(null)}><X /></Button></div>}
        <div className="flex items-end gap-2"><Textarea ref={inputRef} value={draft} disabled={sending} onChange={(event) => setDraft(event.target.value)} placeholder={c.placeholder} aria-label={c.placeholder} rows={2} className="min-h-16 resize-none text-sm" /><Button type="submit" size="icon" title={c.send} aria-label={c.send} disabled={sending || !draft.trim()}>{sending ? <Loader2 className="animate-spin" /> : <Send />}</Button></div>
      </form> : <p className="mt-3 text-xs text-muted-foreground">{c.signIn}</p>}
    </div>}
  </section>;
}