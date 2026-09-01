import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, Send, Star, Video } from "lucide-react";
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

const copy = {
  en: {
    title: "Reviews & ratings",
    none: "No reviews yet. Be the first to test this mind and report back.",
    placeholder: "Tested on my robot — works great!",
    proof: "Video proof URL (optional)",
    submit: "Post review",
    signIn: "Sign in to leave a review.",
    verified: "Verified Robot Deployment",
    owner: "Paid Owner",
    tester: "Verified Tester",
    trust: "Project Trust Score",
    posted: "Thanks — your review is live.",
    failed: "Could not save your review",
    open: "Tried the free demo, a voice call or a preview? Leave your honest review.",
    of: (n: number) => `${n} review${n === 1 ? "" : "s"}`,
  },
  mn: {
    title: "Үнэлгээ ба сэтгэгдэл",
    none: "Сэтгэгдэл алга. Эхлээд туршиж үзээд бичээрэй.",
    placeholder: "Роботдоо туршлаа — маш сайн ажиллаж байна!",
    proof: "Видео нотолгооны холбоос (заавал биш)",
    submit: "Сэтгэгдэл нийтлэх",
    signIn: "Сэтгэгдэл бичихийн тулд нэвтэрнэ үү.",
    verified: "Баталгаажсан робот байршуулалт",
    owner: "Худалдан авсан эзэмшигч",
    tester: "Баталгаажсан туршигч",
    trust: "Итгэлцлийн оноо",
    posted: "Баярлалаа — сэтгэгдэл нийтлэгдлээ.",
    failed: "Сэтгэгдлийг хадгалж чадсангүй",
    open: "Үнэгүй туршилт, дуут дуудлага эсвэл урьдчилсан үзлэг хийсэн үү? Сэтгэгдлээ үлдээгээрэй.",
    of: (n: number) => `${n} сэтгэгдэл`,
  },
  ko: {
    title: "리뷰 및 평점",
    none: "아직 리뷰가 없습니다. 이 마인드를 가장 먼저 테스트하고 후기를 남겨보세요.",
    placeholder: "제 로봇에서 테스트해봤어요 — 정말 잘 작동합니다!",
    proof: "영상 증빙 URL (선택 사항)",
    submit: "리뷰 등록",
    signIn: "리뷰를 남기려면 로그인하세요.",
    verified: "검증된 로봇 배포",
    owner: "구매한 소유자",
    tester: "검증된 테스터",
    trust: "프로젝트 신뢰 점수",
    posted: "감사합니다 — 리뷰가 게시되었습니다.",
    failed: "리뷰를 저장하지 못했습니다",
    open: "무료 데모, 음성 통화 또는 미리보기를 사용해 보셨나요? 솔직한 리뷰를 남겨주세요.",
    of: (n: number) => `리뷰 ${n}개`,
  },
} as const;

/**
 * Try-before-you-buy review section: any signed-in user who tried the free demo,
 * a voice call or a visual preview can rate the project. Reviews are badged as
 * "Paid Owner" or "Verified Tester" and aggregate into a public Trust Score.
 */
export function MindReviews({ mindId, lang = "en" }: { mindId: string; lang?: Lang }) {
  const t = pickCopy(copy, lang);
  const { user, profile } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("mind_reviews")
      .select("id,user_id,rating,body,video_proof_url,author_name,verified_deployment,paid_owner,created_at")
      .eq("mind_id", mindId)
      .order("created_at", { ascending: false })
      .limit(50);
    setReviews((data as Review[] | null) ?? []);
  }, [mindId]);

  useEffect(() => {
    void load();
  }, [load]);

  const trustScore = reviews.length
    ? Math.round(
        (reviews.reduce((sum, r) => sum + r.rating, 0) / (reviews.length * 5)) * 100 * 0.85 +
          (reviews.filter((r) => r.paid_owner || r.verified_deployment).length / reviews.length) * 100 * 0.15,
      )
    : 0;

  const average = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const submit = async () => {
    if (!user) {
      toast.error(t.signIn);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("mind_reviews").upsert(
      {
        user_id: user.id,
        mind_id: mindId,
        rating,
        body: body.trim(),
        video_proof_url: proof.trim() || null,
        author_name: profile?.displayName || user.email?.split("@")[0] || "Evermind user",
      },
      { onConflict: "user_id,mind_id" },
    );
    setBusy(false);
    if (error) {
      toast.error(`${t.failed}: ${error.message}`);
      return;
    }
    setBody("");
    setProof("");
    toast.success(t.posted);
    void load();
  };

  return (
    <section className="rounded-[12px] border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
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

      <p className="mb-3 text-[11px] text-muted-foreground">{t.open}</p>
      <div className="mb-5 rounded-xl border border-border bg-muted/40 p-3">
        <div className="mb-2 flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} stars`}>
              <Star className={`h-5 w-5 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={t.placeholder}
          className="mb-2 w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder={t.proof}
            className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {t.submit}
          </button>
        </div>
        {!user && <p className="mt-2 text-[11px] text-muted-foreground">{t.signIn}</p>}
      </div>

      {reviews.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t.none}</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-border p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{r.author_name}</span>
                <Stars value={r.rating} />
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    r.paid_owner || r.verified_deployment
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <BadgeCheck className="h-3 w-3" />
                  {r.verified_deployment ? t.verified : r.paid_owner ? t.owner : t.tester}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.body && <p className="text-xs leading-relaxed text-muted-foreground">{r.body}</p>}
              {r.video_proof_url && (
                <a
                  href={r.video_proof_url}
                  target="_blank"
                  rel="noreferrer"
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
