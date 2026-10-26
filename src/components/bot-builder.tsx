/**
 * Bot Builder — any user can design their own Minecraft teammate from a Mind,
 * fully in the browser. No AI calls, no credits: mined lines are only defaults.
 */
import { useMemo, useState } from "react";
import { Bot, Download, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { purchaseMind, useMindEntitlement } from "@/lib/purchases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { GamingExtraction } from "@/lib/gemini";
import { downloadBedrockAddon } from "@/lib/bedrock-addon";
import { buildTacticalPlaybook, downloadBotPolicy, downloadTeammateBot } from "@/lib/game-bot";
import { pickCopy, type Lang } from "@/lib/i18n";

const C = {
  open: { en: "Build my own bot", mn: "Өөрийн бот бүтээх", ko: "나만의 봇 만들기" },
  title: { en: "Bot Builder", mn: "Бот бүтээгч", ko: "봇 빌더" },
  desc: {
    en: "Design your teammate and download it. Free — runs on your device, no AI needed.",
    mn: "Багийн анд ботоо өөрөө тохируулаад татаж ав. Үнэгүй — AI шаардлагагүй, таны төхөөрөмж дээр бүтнэ.",
    ko: "팀원 봇을 직접 설계하고 다운로드하세요. 무료 — AI 없이 기기에서 생성됩니다.",
  },
  name: { en: "Bot name", mn: "Ботын нэр", ko: "봇 이름" },
  health: { en: "Health", mn: "Амь", ko: "체력" },
  damage: { en: "Attack", mn: "Цохилт", ko: "공격력" },
  speed: { en: "Speed", mn: "Хурд", ko: "속도" },
  tame: { en: "Tame item", mn: "Номхруулах зүйл", ko: "길들이기 아이템" },
  fight: { en: "Fights monsters", mn: "Мангастай тулалдана", ko: "몬스터와 싸움" },
  guard: { en: "Protects me", mn: "Намайг хамгаална", ko: "나를 보호" },
  greeting: { en: "Greeting", mn: "Мэндчилгээ", ko: "인사말" },
  lines: { en: "Chat lines (one per line)", mn: "Чатад хэлэх үгс (мөр бүрт нэг)", ko: "채팅 대사 (한 줄에 하나)" },
  every: { en: "Talks every (seconds)", mn: "Хэдэн секунд тутам ярих", ko: "대화 간격 (초)" },
  colors: { en: "Spawn egg colours", mn: "Өндөгний өнгө", ko: "스폰 알 색상" },
  phone: { en: "Download for phone (Bedrock)", mn: "Утсанд татах (Bedrock)", ko: "휴대폰용 다운로드 (Bedrock)" },
  pc: { en: "Download for PC (Java)", mn: "Компьютерт татах (Java)", ko: "PC용 다운로드 (Java)" },
  steps: {
    en: "Phone: tap the file → opens Minecraft. Create a world, turn on add-on in Behavior Packs, use the spawn egg, then tame it.",
    mn: "Утас: файлаа дарахад Minecraft нээгдэнэ. Шинэ ертөнц үүсгээд Behavior Packs-д нэмэлтээ асааж, өндгөөр гаргаад номхруулна.",
    ko: "휴대폰: 파일을 누르면 Minecraft가 열립니다. 월드를 만들고 행동 팩에서 애드온을 켠 뒤 스폰 알로 소환하고 길들이세요.",
  },
  playbook: { en: "Tactical Playbook", mn: "Тактикийн дэвтэр", ko: "전술 플레이북" },
  genre: { en: "Game / genre", mn: "Тоглоом / төрөл", ko: "게임 / 장르" },
  rules: { en: "When → do → why", mn: "Хэзээ → юу хийх → яагаад", ko: "상황 → 행동 → 이유" },
  noRules: { en: "No mined rules yet.", mn: "Олборлосон дүрэм алга.", ko: "마이닝된 규칙이 없습니다." },
  callouts: { en: "Callouts", mn: "Дуудлагууд", ko: "콜아웃" },
  policy: { en: "Download bot policy (JSON / WebSocket)", mn: "Ботын бодлого татах (JSON / WebSocket)", ko: "봇 정책 다운로드 (JSON / WebSocket)" },
  freeDl: { en: "Free Download", mn: "Үнэгүй татах", ko: "무료 다운로드" },
  unlocked: { en: "Unlocked — Complete Edition", mn: "Нээгдсэн — Бүрэн хувилбар", ko: "잠금 해제 — 컴플리트 에디션" },
  buyDl: { en: "Buy to Download (.JSON / Bot)", mn: "Худалдаж аваад татах (.JSON / Бот)", ko: "구매 후 다운로드 (.JSON / 봇)" },
  checkoutSoon: {
    en: "Checkout is not connected yet — paid downloads open once payments are on.",
    mn: "Төлбөрийн систем хараахан холбогдоогүй — холбогдмогц төлбөртэй татах нээгдэнэ.",
    ko: "결제가 아직 연결되지 않았습니다 — 연결되면 유료 다운로드가 열립니다.",
  },
  signIn: { en: "Sign in to buy this Mind.", mn: "Худалдаж авахын тулд нэвтэрнэ үү.", ko: "구매하려면 로그인하세요." },
  mcOnly: { en: "Minecraft downloads", mn: "Minecraft татах", ko: "Minecraft 다운로드" },
} as const;

const METRIC_LABEL: Record<string, { en: string; mn: string; ko: string }> = {
  aggression: { en: "Aggression", mn: "Довтолгоо", ko: "공격성" },
  risk_tolerance: { en: "Risk", mn: "Эрсдэл", ko: "위험 감수" },
  resource_greed: { en: "Resource greed", mn: "Нөөц хураалт", ko: "자원 욕심" },
  team_play: { en: "Team play", mn: "Багаар тоглох", ko: "팀플레이" },
  mechanical_tempo: { en: "Tempo", mn: "Хурд", ko: "템포" },
};

const TAME = ["emerald", "diamond", "bone", "apple", "gold_ingot", "cookie"];

export function BotBuilder({
  lang, mindName, gaming, mindId, ownerId, price,
}: {
  lang: Lang; mindName: string; gaming: GamingExtraction;
  /** Set for someone else's Mind; omitted = the viewer's own Mind (always free). */
  mindId?: string | null; ownerId?: string | null; price?: number | null;
}) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const { user } = useAuth();
  const ent = useMindEntitlement({ mindId: mindId ?? null, ownerId: ownerId ?? null, userId: user?.id ?? null, price: price ?? 0 });
  const [buying, setBuying] = useState(false);
  const buy = async () => {
    if (!mindId) return;
    if (!user) return void toast.error(t("signIn"));
    setBuying(true);
    const { error } = await purchaseMind({ mindId, category: "gaming" });
    setBuying(false);
    if (error) return void toast.error(error.includes("Checkout is not connected") ? t("checkoutSoon") : error);
    ent.refresh();
  };
  const gate = (fn: () => void) => () => (ent.allowed ? fn() : void buy());
  const lockIcon = <Lock className="mr-1.5 h-4 w-4" />;
  const dlIcon = ent.allowed ? <Download className="mr-1.5 h-4 w-4" /> : lockIcon;
  const defaults = useMemo(
    () =>
      [...gaming.communication.filter((c) => c.kind !== "tilt").map((c) => c.quote), ...gaming.commentaryStyle]
        .filter(Boolean)
        .slice(0, 40)
        .join("\n"),
    [gaming],
  );
  const playbook = useMemo(() => buildTacticalPlaybook(gaming), [gaming]);
  const [name, setName] = useState(mindName);
  const [health, setHealth] = useState(40);
  const [damage, setDamage] = useState(6);
  const [speed, setSpeed] = useState(0.3);
  const [tameItem, setTameItem] = useState("emerald");
  const [fightMobs, setFight] = useState(true);
  const [guardOwner, setGuard] = useState(true);
  const [greeting, setGreeting] = useState("");
  const [lines, setLines] = useState(defaults);
  const [every, setEvery] = useState(120);
  const [baseColor, setBase] = useState("#3a1c1c");
  const [overlayColor, setOverlay] = useState("#f2b6c6");

  const lineList = lines.split("\n").map((s) => s.trim()).filter(Boolean);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

  const buildPhone = () =>
    downloadBedrockAddon(mindName, gaming, {
      name: name.trim() || mindName,
      health: clamp(health, 1, 200),
      damage: clamp(damage, 0, 50),
      speed: clamp(speed, 0.1, 0.6),
      tameItem,
      fightMobs,
      guardOwner,
      ...(greeting.trim() ? { greeting: greeting.trim() } : {}),
      lines: lineList,
      chatEverySec: clamp(every, 20, 3600),
      baseColor,
      overlayColor,
    });
  const buildPc = () =>
    downloadTeammateBot(name.trim() || mindName, {
      ...gaming,
      communication: lineList.map((quote) => ({ kind: "banter", quote, context: "" }) as GamingExtraction["communication"][number]),
    });

  const num = (label: string, v: number, set: (n: number) => void, step = 1) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" inputMode="decimal" step={step} value={v} onChange={(e) => set(Number(e.target.value))} />
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Bot className="mr-1.5 h-3.5 w-3.5" />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
          <span className={`w-fit rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ent.allowed ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>{ent.allowed ? (ent.access === "purchased" ? t("unlocked") : t("freeDl")) : `${ent.price} ${ent.currency}`}</span>
        </DialogHeader>
        <div className="space-y-4">
          <section className="space-y-3 rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">{t("playbook")}</h3>
              <span className="text-xs text-muted-foreground">{t("genre")}: {playbook.detected_game_or_genre}</span>
            </div>
            <div className="space-y-1.5">
              {Object.entries(playbook.playstyle_metrics).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 text-muted-foreground">{METRIC_LABEL[k] ? pickCopy(METRIC_LABEL[k], lang) : k}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${v}%` }} /></div>
                  <span className="w-8 text-right tabular-nums">{v}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("rules")}</Label>
              {playbook.state_action_rules.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("noRules")}</p>
              ) : (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                  {playbook.state_action_rules.slice(0, 12).map((r, i) => (
                    <li key={i} className="rounded border border-border p-1.5">
                      <span className="text-muted-foreground">{r.when_hud_or_map_state}</span> → <b>{r.do_micro_or_macro_action}</b>
                      {r.creator_reason ? <span className="text-muted-foreground"> · {r.creator_reason}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {playbook.callout_vocabulary.length > 0 ? (
              <div className="space-y-1">
                <Label className="text-xs">{t("callouts")}</Label>
                <div className="flex flex-wrap gap-1">
                  {playbook.callout_vocabulary.slice(0, 12).map((c) => (
                    <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <Button className="w-full" variant={playbook.is_minecraft ? "outline" : "default"} disabled={buying} onClick={gate(() => downloadBotPolicy(name.trim() || mindName, gaming))}>
              {dlIcon}{ent.allowed ? t("policy") : t("buyDl")}
            </Button>
          </section>
          {playbook.is_minecraft ? <p className="text-xs font-semibold text-foreground">{t("mcOnly")}</p> : null}
          <div className={playbook.is_minecraft ? "space-y-4" : "space-y-4 opacity-70"}>
          <div className="space-y-1">
            <Label className="text-xs">{t("name")}</Label>
            <Input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {num(t("health"), health, setHealth)}
            {num(t("damage"), damage, setDamage)}
            {num(t("speed"), speed, setSpeed, 0.05)}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("tame")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {TAME.map((it) => (
                <Button key={it} type="button" size="sm" variant={tameItem === it ? "default" : "outline"} onClick={() => setTameItem(it)}>
                  {it.replace("_", " ")}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={fightMobs} onCheckedChange={setFight} />{t("fight")}</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={guardOwner} onCheckedChange={setGuard} />{t("guard")}</label>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("greeting")}</Label>
            <Input value={greeting} maxLength={160} onChange={(e) => setGreeting(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("lines")} · {lineList.length}</Label>
            <Textarea rows={6} value={lines} onChange={(e) => setLines(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {num(t("every"), every, setEvery, 10)}
            <div className="space-y-1">
              <Label className="text-xs">{t("colors")}</Label>
              <div className="flex gap-2">
                <Input type="color" className="h-10 p-1" value={baseColor} onChange={(e) => setBase(e.target.value)} />
                <Input type="color" className="h-10 p-1" value={overlayColor} onChange={(e) => setOverlay(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" variant={playbook.is_minecraft ? "default" : "outline"} disabled={buying} onClick={gate(buildPhone)}>{dlIcon}{ent.allowed ? t("phone") : t("buyDl")}</Button>
            <Button className="flex-1" variant="outline" disabled={buying} onClick={gate(buildPc)}>{dlIcon}{ent.allowed ? t("pc") : t("buyDl")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("steps")}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
