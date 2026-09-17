import { createFileRoute } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";

import { AiKeysCard } from "@/components/ai-keys-card";
import { AiRolesCard } from "@/components/ai-roles-card";
import { TokenUsagePanel } from "@/components/token-usage-panel";
import { pickCopy, useLang } from "@/lib/i18n";

const copy = {
  en: {
    title: "API Manager",
    hint: "Your own AI keys live here. Add one, test it, remove it, and see what it uses.",
    keys: "Your keys",
    keysHint: "Add a key, test it, or remove one. Free keys need no card.",
    roles: "Who runs what",
    rolesHint: "Choose which key does the translating, mining, chatting, voice and more.",
    usage: "Tokens and cost",
    usageHint: "How much you used today, what is left free, and when it refills.",
  },
  mn: {
    title: "API удирдлага",
    hint: "Таны өөрийн AI түлхүүрүүд энд байна. Нэмэх, шалгах, устгах, зарцуулалтаа харах.",
    keys: "Таны түлхүүрүүд",
    keysHint: "Түлхүүр нэмэх, шалгах, устгах. Үнэгүй түлхүүрт карт хэрэггүй.",
    roles: "Хэн юу ажиллуулах вэ",
    rolesHint: "Орчуулга, олборлолт, чат, дуу зэргийг аль түлхүүр ажиллуулахыг сонго.",
    usage: "Токен ба зардал",
    usageHint: "Өнөөдөр хэр зарцуулсан, үнэгүй хэр үлдсэн, хэзээ шинэчлэгдэх.",
  },
  ko: {
    title: "API 관리",
    hint: "내 AI 키를 여기서 관리합니다. 추가, 테스트, 삭제, 사용량 확인.",
    keys: "내 키",
    keysHint: "키를 추가하거나 테스트하거나 삭제하세요. 무료 키는 카드가 필요 없습니다.",
    roles: "누가 무엇을 실행할까요",
    rolesHint: "번역, 마이닝, 채팅, 음성을 어떤 키가 맡을지 고르세요.",
    usage: "토큰과 비용",
    usageHint: "오늘 사용량, 남은 무료 한도, 초기화 시각.",
  },
} as const;

export const Route = createFileRoute("/keys")({
  head: () => ({
    meta: [
      { title: "API Manager — Evermind" },
      {
        name: "description",
        content: "Add, test and remove your own AI keys, set spending limits and watch token usage in Evermind.",
      },
      { property: "og:title", content: "API Manager — Evermind" },
      { property: "og:description", content: "Manage your own AI keys, limits and token usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KeysPage,
});

function KeysPage() {
  const { lang } = useLang();
  const t = pickCopy(copy, lang);

  return (
    <div className="dark min-h-screen bg-background pb-28 text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t.hint}</p>

        <section className="mt-6">
          <h2 className="text-sm font-semibold text-foreground">{t.keys}</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">{t.keysHint}</p>
          <AiKeysCard />
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">{t.roles}</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">{t.rolesHint}</p>
          <AiRolesCard />
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">{t.usage}</h2>
          <p className="mb-3 mt-1 text-xs text-muted-foreground">{t.usageHint}</p>
          <TokenUsagePanel lang={lang} />
        </section>
      </div>
    </div>
  );
}
