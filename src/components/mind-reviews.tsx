import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Loader2, Send, Star, Trash2, Video, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { pickCopy, type Lang } from "@/lib/i18n";

type Review = {
  id: string;
  user_id: string;
  rating: number;
  body: string;
  video_proof_url: string | null;
  author_name: string;
  verified_deployment: boolean;
  paid_owner: boolean;
  created_at: string;
};

type Comment = { id: string; user_id: string; body: string; author_name: string; created_at: string };

/** One feed item: a star review or a plain comment, both kept in their original tables. */
type Entry =
  | ({ kind: "review" } & Review)
  | ({ kind: "comment" } & Comment);

type Filter = "all" | "rated" | "comments";

/** Only plain web links are ever stored or rendered — other schemes can run code in a visitor's browser. */
function safeHttpUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

const copy = {
  en: {
    title: "Comments & reviews",
    none: "Nothing yet. Chat or call this mind, then share how it went.",
    placeholder: "Ask a question, share a reaction, or rate your chat/call…",
    proof: "Proof link (optional)",
    submit: "Post",
    signIn: "Sign in to comment or rate.",
    verified: "Verified Robot Deployment",
    owner: "Paid Owner",
    tester: "Verified Tester",
    trust: "Mind Trust Score",
    posted: "Thanks — posted.",
    failed: "Could not save",
    hint: "Stars are optional: add them to rate the chat, voice or video call experience.",
    clear: "Remove stars",
    all: "All",
    rated: "Rated",
    comments: "Comments",
    remove: "Delete",
    deleted: "Deleted",
    proofBad: "Proof link must start with http:// or https://",
    of: (n: number) => `${n} review${n === 1 ? "" : "s"}`,
  },
  mn: {
    title: "Сэтгэгдэл ба үнэлгээ",
    none: "Одоогоор алга. Майндтай чатлаж эсвэл ярьсныхаа дараа бичээрэй.",
    placeholder: "Асуулт, сэтгэгдлээ бичих эсвэл чат/дуудлагаа үнэлэх…",
    proof: "Нотолгоо холбоос (заавал биш)",
    submit: "Нийтлэх",
    signIn: "Сэтгэгдэл бичих, үнэлэхийн тулд нэвтэрнэ үү.",
    verified: "Баталгаажсан робот байршуулалт",
    owner: "Худалдан авсан эзэмшигч",
    tester: "Баталгаажсан туршигч",
    trust: "Майнд итгэлцлийн оноо",
    posted: "Баярлалаа — нийтлэгдлээ.",
    failed: "Хадгалж чадсангүй",
    hint: "Од заавал биш: чат, дуут болон видео дуудлагын туршлагаа үнэлэх бол од тавина уу.",
    clear: "Од арилгах",
    all: "Бүгд",
    rated: "Үнэлгээтэй",
    comments: "Сэтгэгдэл",
    remove: "Устгах",
    deleted: "Устгагдлаа",
    proofBad: "Холбоос http:// эсвэл https://-ээр эхлэх ёстой",
    of: (n: number) => `${n} үнэлгээ`,
  },
  ko: {
    title: "댓글 및 리뷰",
    none: "아직 없습니다. 이 마인드와 채팅하거나 통화한 뒤 남겨주세요.",
    placeholder: "질문, 소감을 남기거나 채팅/통화를 평가하세요…",
    proof: "증빙 링크 (선택 사항)",
    submit: "게시",
    signIn: "댓글이나 평가를 남기려면 로그인하세요.",
    verified: "검증된 로봇 배포",
    owner: "구매한 소유자",
    tester: "검증된 테스터",
    trust: "마인드 신뢰 점수",
    posted: "감사합니다 — 게시되었습니다.",
    failed: "저장하지 못했습니다",
    hint: "별점은 선택 사항입니다: 채팅·음성·영상 통화 경험을 평가할 때 추가하세요.",
    clear: "별점 지우기",
    all: "전체",
    rated: "별점",
    comments: "댓글",
    remove: "삭제",
    deleted: "삭제되었습니다",
    proofBad: "링크는 http:// 또는 https://로 시작해야 합니다",
    of: (n: number) => `리뷰 ${n}개`,
  },
} as const;

/**
 * Unified feedback stream for a MIND: one composer where stars are optional.
 * With stars it saves/updates the user's review (one per mind, feeds the Trust Score);
 * without stars it posts a plain comment. Both tables stay untouched in shape.
 */
export function MindReviews({ mindId, lang = "en" }: { mindId: string; lang?: Lang }) {
  const t = pickCopy(copy, lang);
  const { user, profile } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      supabase
        .from("mind_reviews")
        .select("id,user_id,rating,body,video_proof_url,author_name,verified_deployment,paid_owner,created_at")
        .eq("mind_id", mindId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("mind_comments")
        .select("id,user_id,body,author_name,created_at")
        .eq("mind_id", mindId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setReviews((r.data as Review[] | null) ?? []);
    setComments((c.data as Comment[] | null) ?? []);
  }, [mindId]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = [
      ...reviews.map((r) => ({ kind: "review" as const, ...r })),
      ...comments.map((c) => ({ kind: "comment" as const, ...c })),
    ];
    return all
      .filter((e) => filter === "all" || (filter === "rated" ? e.kind === "review" : e.kind === "comment"))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [reviews, comments, filter]);

  const average = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const trustScore = reviews.length
    ? Math.round(
        (average / 5) * 100 * 0.85 +
          (reviews.filter((r) => r.paid_owner || r.verified_deployment).length / reviews.length) * 100 * 0.15,
      )
    : 0;

  const submit = async () => {
    if (!user) {
      toast.error(t.signIn);
      return;
    }
    const text = body.trim();
    if (!rating && !text) return;
    const cleanProof = safeHttpUrl(proof);
    if (proof.trim() && !cleanProof) {
      toast.error(t.proofBad);
      return;
    }
    const author_name = profile?.displayName || user.email?.split("@")[0] || "Evermind user";
    setBusy(true);
    const { error } = rating
      ? await supabase.from("mind_reviews").upsert(
          { user_id: user.id, mind_id: mindId, rating, body: text, video_proof_url: cleanProof, author_name },
          { onConflict: "user_id,mind_id" },
        )
      : await supabase.from("mind_comments").insert({ user_id: user.id, mind_id: mindId, body: text, author_name });
    setBusy(false);
    if (error) {
      toast.error(`${t.failed}: ${error.message}`);
      return;
    }
    setBody("");
    setProof("");
    setRating(0);
    toast.success(t.posted);
    void load();
  };

  const remove = async (e: Entry) => {
    const { error } = await supabase
      .from(e.kind === "review" ? "mind_reviews" : "mind_comments")
      .delete()
      .eq("id", e.id);
    if (error) {
      toast.error(`${t.failed}: ${error.message}`);
      return;
    }
    toast.success(t.deleted);
    void load();
  };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
        <Stars value={Math.round(average)} />
        <span className="text-xs text-muted-foreground">
          {average ? average.toFixed(1) : "—"} · {t.of(reviews.length)}
        </span>
        {reviews.length > 0 && (
          <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold text-primary">
            {t.trust}: {trustScore}%
          </span>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3">
        <div className="mb-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)} aria-label={`${n} stars`}>
              <Star className={`h-5 w-5 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            </button>
          ))}
          {rating > 0 && (
            <button
              type="button"
              onClick={() => setRating(0)}
              aria-label={t.clear}
              className="ml-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">{t.hint}</p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={t.placeholder}
          className="mb-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-2">
          {rating > 0 && (
            <input
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder={t.proof}
              className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            />
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || (!rating && !body.trim())}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {t.submit}
          </button>
        </div>
        {!user && <p className="mt-2 text-[11px] text-muted-foreground">{t.signIn}</p>}
      </div>

      <div className="mb-3 flex gap-1.5">
        {(["all", "rated", "comments"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t[f]}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.none}</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={`${e.kind}:${e.id}`} className="rounded-xl border border-border p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{e.author_name}</span>
                {e.kind === "review" && (
                  <>
                    <Stars value={e.rating} />
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        e.paid_owner || e.verified_deployment ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <BadgeCheck className="h-3 w-3" />
                      {e.verified_deployment ? t.verified : e.paid_owner ? t.owner : t.tester}
                    </span>
                  </>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString()}
                </span>
                {user?.id === e.user_id && (
                  <button
                    type="button"
                    aria-label={t.remove}
                    onClick={() => void remove(e)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {e.body && <p className="text-xs leading-relaxed text-muted-foreground">{e.body}</p>}
              {e.kind === "review" && safeHttpUrl(e.video_proof_url) && (
                <a
                  href={safeHttpUrl(e.video_proof_url) as string}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                >
                  <Video className="h-3 w-3" /> video proof
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? "fill-primary text-primary" : "text-muted-foreground"}`} />
      ))}
    </span>
  );
}
