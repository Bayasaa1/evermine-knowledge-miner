import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { ArrowRight, Boxes, Camera, KeyRound, Loader2, PenSquare, Settings, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

import { AccountMenu } from "@/components/account-menu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { FriendsPanel } from "@/components/friends-panel";
import type { Graph } from "@/lib/friends";
import { UsernameEditor } from "@/components/username-editor";
import { SavedMinds } from "@/components/saved-minds";
import { VaultMiningQueue } from "@/components/vault-mining-queue";
import { SubtitleHealth } from "@/components/subtitle-health";
import { VaultHub, type VaultPersonaSelection } from "@/components/vault-hub";
import { CreatorProfileEditor } from "@/components/creator-profile-editor";
import { AiKeysCard } from "@/components/ai-keys-card";
import { TokenUsagePanel } from "@/components/token-usage-panel";
import { setProfilePicture } from "@/lib/community";
import { pickCopy, useLang } from "@/lib/i18n";
import { initials, useAuth } from "@/hooks/use-auth";

const copy = {
  en: { people: "People", subscribers: "Subscribers", following: "Following", vault: "Vault", api: "API", more: "More",
    openApi: "Roles, history and full API Manager", apiHint: "Your own keys — never shared, never Evermind credits.",
    posts: "Posts & stories", earnings: "Earnings & unclaimed balance" },
  mn: { people: "Хүмүүс", subscribers: "Дагагчид", following: "Дагасан", vault: "Vault", api: "API", more: "Бусад",
    openVault: "Vault студи нээх (төсөл, мод, тархи)", openApi: "Үүрэг, түүх, бүтэн API удирдлага", apiHint: "Таны өөрийн түлхүүр — хэзээ ч хуваалцахгүй.",
    posts: "Пост & стори", earnings: "Орлого & үлдэгдэл" },
  ko: { people: "사람들", subscribers: "구독자", following: "구독 중", vault: "저장됨", api: "API", more: "더보기",
    openVault: "볼트 스튜디오 열기", openApi: "역할, 기록, 전체 API 관리", apiHint: "내 키만 사용 — 공유되지 않습니다.",
    posts: "게시물 & 스토리", earnings: "수익 & 미청구 잔액" },
} as const;

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Evermind" },
      { name: "description", content: "Your Evermind profile: friends, subscribers, Mind vaults and your own AI keys." },
      { property: "og:title", content: "Profile — Evermind" },
      { property: "og:description", content: "Manage friends, vaults and API keys in Evermind." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, isAuthenticated } = useAuth();
  const { lang } = useLang();
  const t = pickCopy(copy, lang);
  const [tab, setTab] = useState<"people" | "vault" | "api" | "more">("vault");
  const [persona, setPersona] = useState<VaultPersonaSelection>(null);
  const [peopleTab, setPeopleTab] = useState<"subscribers" | "following">("subscribers");
  const [counts, setCounts] = useState({ subscribers: 0, following: 0 });
  const onCounts = useCallback((g: Graph) => setCounts({ subscribers: g.subscribers.length + g.friends.length, following: g.following.length + g.friends.length }), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [picture, setPicture] = useState<string | null>(null);
  const avatar = picture ?? profile?.avatarUrl ?? null;

  const changePicture = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await setProfilePicture(file);
      setPicture(url);
      toast.success("Profile picture updated");
    } catch {
      toast.error("Could not change your picture");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void changePicture(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => (isAuthenticated ? fileRef.current?.click() : toast.error("Sign in first"))}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-primary/10"
            aria-label="Change profile picture"
          >
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-primary">
                {isAuthenticated && profile ? initials(profile.displayName) : "EV"}
              </span>
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/55 py-0.5">
              {busy ? <Loader2 className="h-3 w-3 animate-spin text-white" /> : <Camera className="h-3 w-3 text-white" />}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">
              {isAuthenticated && profile ? profile.displayName : "Guest"}
            </h1>
            {isAuthenticated ? <UsernameEditor /> : <p className="text-xs text-muted-foreground">A life becomes a mind.</p>}
          </div>
          <AccountMenu compact />
        </div>

        {isAuthenticated && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            {(["subscribers", "following"] as const).map((k) => (
              <button key={k} onClick={() => { setPeopleTab(k); setTab("people"); }} className="rounded-xl border border-border bg-card py-2.5">
                <p className="text-base font-semibold">{counts[k]}</p>
                <p className="text-[11px] text-muted-foreground">{t[k]}</p>
              </button>
            ))}
          </div>
        )}

        <div className="sticky top-0 z-10 -mx-4 mt-4 flex gap-1 bg-background/95 px-4 py-2 backdrop-blur">
          {([["people", Users], ["vault", Boxes], ["api", KeyRound], ["more", Settings]] as const).map(([k, Icon]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-xs font-semibold ${tab === k ? "bg-foreground text-background" : "text-muted-foreground"}`}>
              <Icon className="h-4 w-4" />{t[k]}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <div className={tab === "people" ? "" : "hidden"}>
            <FriendsPanel onCounts={onCounts} initialTab={peopleTab} />
          </div>
          {tab === "vault" && (
            <div className="space-y-6">
              <Link to="/mining" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />Live mining progress
              </Link>
              <VaultHub lang={lang} selected={persona} onSelect={setPersona} />
              <div className="space-y-6 border-t border-border pt-6">
                <CreatorProfileEditor personaId={persona?.id ?? null} lang={lang} />
                <VaultMiningQueue lang={lang} personaId={persona?.id ?? null} />
                <SavedMinds lang={lang} forcedPersona={persona ?? undefined} />
                <SubtitleHealth personaId={persona?.id ?? null} />
              </div>
            </div>
          )}
          {tab === "api" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">{t.apiHint}</p>
              <AiKeysCard />
              <TokenUsagePanel lang={lang} />
              <Link to="/keys" className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <span className="flex items-center gap-3 text-sm font-medium"><KeyRound className="h-5 w-5" />{t.openApi}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
          {tab === "more" && (
            <div className="grid gap-3">
              <Link to="/community" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <PenSquare className="h-5 w-5" /><span className="text-sm font-medium">{t.posts}</span>
              </Link>
              <Link to="/creator" hash="analytics" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <Wallet className="h-5 w-5 text-primary" /><span className="text-sm font-medium">{t.earnings}</span>
              </Link>
              <ThemeSwitcher />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
