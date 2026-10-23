import { MindReviews } from "@/components/mind-reviews";
import { MindSpecs } from "@/components/mind-specs";
import type { Lang } from "@/lib/i18n";


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
  // Comments and reviews now live in one stream (stars optional) inside MindReviews.
  void purchased;
  return (
    <div className="space-y-3">
      <MindSpecs mindId={mindId} lang={lang} canEdit={canEditSpecs} />
      <section className="rounded-[12px] border border-border bg-card p-4">
        <MindReviews mindId={mindId} lang={lang} />
      </section>
    </div>
  );
}

