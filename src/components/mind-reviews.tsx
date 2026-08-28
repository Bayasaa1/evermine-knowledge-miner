import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, Lock, Send, Star, Video } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Lang } from "@/lib/i18n";

type Review = {
  id: string;
  user_id: string;
  rating: number;
  body: string;
  video_proof_url: string | null;
  author_name: string;
  verified_deployment: boolean;
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
    buyer: "Verified user",
    posted: "Thanks — your review is live.",
    failed: "Could not save your review",
    locked: "Only verified buyers can leave a review. Purchase this mind to review it.",
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
    buyer: "Баталгаажсан хэрэглэгч",
    posted: "Баярлалаа — сэтгэгдэл нийтлэгдлээ.",
    failed: "Сэтгэгдлийг хадгалж чадсангүй",
    locked: "Зөвхөн худалдан авсан хэрэглэгч үнэлгээ өгнө. Эхлээд худалдан аваарай.",
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
    buyer: "인증된 사용자",
    posted: "감사합니다 — 리뷰가 게시되었습니다.",
    failed: "리뷰를 저장하지 못했습니다",
    locked: "인증된 구매자만 리뷰를 남길 수 있습니다. 이 마인드를 구매한 후 리뷰를 작성하세요.",
    of: (n: number) => `리뷰 ${n}개`,
  },
} as const;

/** Amazon-style review & rating section shown under every AI Mind. */
export function MindReviews({
  mindId,
  lang = "en",
  purchased = true,
}: {
  mindId: string;
  lang?: Lang;
  purchased?: boolean;
}) {
  const t = copy[lang];
  const { user, profile } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("mind_reviews")
      .select("id,user_id,rating,body,video_proof_url,author_name,verified_deployment,created_at")
      .eq("mind_id", mindId)
      .order("created_at", { ascending: false })
      .limit(50);
    setReviews((data as Review[] | null) ?? []);
  }, [mindId]);

  useEffect(() => {
    void load();
  }, [load]);

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
      </div>

      {!purchased ? (
        <p className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">
          <Lock className="h-3.5 w-3.5 shrink-0" /> {t.locked}
        </p>
      ) : (
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
      )}

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
                    r.verified_deployment
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <BadgeCheck className="h-3 w-3" />
                  {r.verified_deployment ? t.verified : t.buyer}
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
