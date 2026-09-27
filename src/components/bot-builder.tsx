/**
 * Bot Builder — any user can design their own Minecraft teammate from a Mind,
 * fully in the browser. No AI calls, no credits: mined lines are only defaults.
 */
import { useMemo, useState } from "react";
import { Bot, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { GamingExtraction } from "@/lib/gemini";
import { downloadBedrockAddon } from "@/lib/bedrock-addon";
import { downloadTeammateBot } from "@/lib/game-bot";
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
} as const;

const TAME = ["emerald", "diamond", "bone", "apple", "gold_ingot", "cookie"];

export function BotBuilder({ lang, mindName, gaming }: { lang: Lang; mindName: string; gaming: GamingExtraction }) {
  const t = (k: keyof typeof C) => pickCopy(C[k], lang);
  const defaults = useMemo(
    () =>
      [...gaming.communication.filter((c) => c.kind !== "tilt").map((c) => c.quote), ...gaming.commentaryStyle]
        .filter(Boolean)
        .slice(0, 40)
        .join("\n"),
    [gaming],
  );
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
        </DialogHeader>
        <div className="space-y-4">
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
            <Button className="flex-1" onClick={buildPhone}><Download className="mr-1.5 h-4 w-4" />{t("phone")}</Button>
            <Button className="flex-1" variant="outline" onClick={buildPc}><Download className="mr-1.5 h-4 w-4" />{t("pc")}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("steps")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
