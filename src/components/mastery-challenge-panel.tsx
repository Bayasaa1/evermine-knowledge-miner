import { useEffect, useState } from "react";
import { Loader2, Lock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-fetch";
import { pickCopy, type Lang } from "@/lib/i18n";
import {
  parseVideoRef,
  unlockedLevel,
  type Challenge,
  type ChallengeDomain,
  type ChallengeLevel,
  type Evaluation,
} from "@/lib/mastery-challenge";

const copy = {
  en: {
    title: "Mastery Challenges", level: "Level", l1: "Foundation", l2: "Edge case", l3: "Master stress-test",
    get: "🎯 Get challenge", scenario: "Scenario", task: "Your task", criteria: "Pass criteria", source: "Source",
    answer: "Write your diagnosis, protocol or solution…", submit: "Submit for judging", score: "Score",
    critique: "Mechanism critique", missing: "Missing", proof: "Video proof", next: "Next level unlocked!",
    noMind: "Open a published Mind to take its challenges.", watch: "Watch", retry: "New challenge",
  },
  mn: {
    title: "Сорилт & Даалгавар", level: "Түвшин", l1: "Суурь оношилгоо", l2: "Нарийн edge-case", l3: "Мастер стресс-тест",
    get: "🎯 Даалгавар авах", scenario: "Нөхцөл байдал", task: "Даалгавар", criteria: "Тэнцэх шалгуур", source: "Эх сурвалж",
    answer: "Өөрийн оношилгоо, протокол эсвэл шийдлээ бичнэ үү…", submit: "Дүгнүүлэх", score: "Оноо",
    critique: "Механизмын шүүмж", missing: "Орхигдсон зүйлс", proof: "Видео баталгаа", next: "Дараагийн түвшин нээгдлээ!",
    noMind: "Сорилт авахын тулд нийтлэгдсэн Mind нээнэ үү.", watch: "Үзэх", retry: "Шинэ даалгавар",
  },
  ko: {
    title: "마스터리 챌린지", level: "레벨", l1: "기초 진단", l2: "엣지 케이스", l3: "마스터 스트레스 테스트",
    get: "🎯 챌린지 받기", scenario: "상황", task: "과제", criteria: "통과 기준", source: "출처",
    answer: "진단, 프로토콜 또는 해결책을 작성하세요…", submit: "평가 받기", score: "점수",
    critique: "메커니즘 비평", missing: "누락된 요소", proof: "영상 근거", next: "다음 레벨이 열렸습니다!",
    noMind: "챌린지를 받으려면 공개된 Mind를 여세요.", watch: "보기", retry: "새 챌린지",
  },
};

const storeKey = (mindId: string) => `evermind.mastery.${mindId}`;

function readPassed(mindId: string): ChallengeLevel[] {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(mindId)) ?? "[]");
    return Array.isArray(v) ? v.filter((n): n is ChallengeLevel => n === 1 || n === 2 || n === 3) : [];
  } catch {
    return [];
  }
}

export function MasteryChallengePanel({
  mindId, lang, domain = "knowledge", topicTitle,
}: { mindId: string | null | undefined; lang: Lang; domain?: ChallengeDomain; topicTitle?: string | undefined }) {
  const t = pickCopy(copy, lang);
  const [passed, setPassed] = useState<ChallengeLevel[]>([]);
  const [level, setLevel] = useState<ChallengeLevel>(1);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (mindId) setPassed(readPassed(mindId)); }, [mindId]);
  if (!mindId) return <p className="text-sm text-muted-foreground">{t.noMind}</p>;
  const maxLevel = unlockedLevel(passed);

  const call = async (payload: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const res = await apiFetch("/api/mind-chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mindId, lang, topicTitle, ...payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; challenge?: Challenge; evaluation?: Evaluation };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setEvaluation(null); setAnswer("");
    const data = await call({ mode: "challenge_generate", level, domain });
    if (data?.challenge) setChallenge(data.challenge);
  };

  const evaluate = async () => {
    if (!challenge || !answer.trim()) return;
    const data = await call({ mode: "challenge_evaluate", challenge, answer });
    if (!data?.evaluation) return;
    setEvaluation(data.evaluation);
    if (data.evaluation.verdict === "PASS" && !passed.includes(challenge.level)) {
      const next = [...passed, challenge.level];
      setPassed(next);
      try { localStorage.setItem(storeKey(mindId), JSON.stringify(next)); } catch { /* storage full */ }
    }
  };

  const ref = (s: string) => {
    const r = parseVideoRef(s);
    if (!r) return s ? <span>{s}</span> : null;
    const mm = `${Math.floor(r.start / 60)}:${String(r.start % 60).padStart(2, "0")}`;
    return r.id
      ? <a className="text-primary underline" href={`https://www.youtube.com/watch?v=${r.id}&t=${r.start}s`} target="_blank" rel="noreferrer">{t.watch} @{mm}</a>
      : <span>@{mm}</span>;
  };

  const tone = evaluation?.verdict === "PASS" ? "text-primary" : evaluation?.verdict === "FAIL" ? "text-destructive" : "text-foreground";

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap gap-2">
        {([1, 2, 3] as ChallengeLevel[]).map((l) => {
          const locked = l > maxLevel;
          return (
            <Button key={l} size="sm" variant={level === l ? "default" : "outline"} disabled={locked || busy} onClick={() => setLevel(l)}>
              {locked && <Lock className="mr-1 h-3 w-3" />}
              {t.level} {l} · {l === 1 ? t.l1 : l === 2 ? t.l2 : t.l3}{passed.includes(l) ? " ✓" : ""}
            </Button>
          );
        })}
      </div>
      <Button size="sm" onClick={() => void generate()} disabled={busy}>
        {busy && !challenge ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{challenge ? t.retry : t.get}
      </Button>
      {error && <p className="text-destructive">{error}</p>}
      {challenge && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="font-semibold">{t.level} {challenge.level}: {challenge.title}</p>
          <p><span className="font-medium">{t.scenario}:</span> {challenge.scenario}</p>
          <div><p className="font-medium">{t.task}:</p><ol className="list-decimal pl-5">{challenge.task_steps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
          <div><p className="font-medium">{t.criteria}:</p><ul className="list-disc pl-5">{challenge.pass_criteria.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          {challenge.source_video_ref && <p className="text-xs text-muted-foreground">{t.source}: {ref(challenge.source_video_ref)}</p>}
        </div>
      )}
      {challenge && (
        <>
          <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t.answer} rows={5} maxLength={6000} />
          <Button size="sm" onClick={() => void evaluate()} disabled={busy || !answer.trim()}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{t.submit}
          </Button>
        </>
      )}
      {evaluation && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className={`text-base font-bold ${tone}`}>{evaluation.verdict} · {t.score} {evaluation.score}%</p>
          <p><span className="font-medium">{t.critique}:</span> {evaluation.mechanism_critique}</p>
          {evaluation.missing_elements.length > 0 && (
            <div><p className="font-medium">{t.missing}:</p><ul className="list-disc pl-5">{evaluation.missing_elements.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          )}
          {evaluation.video_proof && <p className="text-xs text-muted-foreground">{t.proof}: {ref(evaluation.video_proof)}</p>}
          {evaluation.verdict === "PASS" && challenge && challenge.level < 3 && <p className="text-primary">{t.next}</p>}
        </div>
      )}
    </div>
  );
}

/** "🎯 Test my level" launcher for the domain studios. */
export function MasteryChallengeButton({ mindId, lang, domain, label }: { mindId: string | null | undefined; lang: Lang; domain: ChallengeDomain; label?: string }) {
  const t = pickCopy(copy, lang);
  const text = label ?? (lang === "mn" ? "🎯 Түвшин шалгах даалгавар авах" : lang === "ko" ? "🎯 레벨 테스트 챌린지" : "🎯 Get a level-test challenge");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Target className="mr-1 h-4 w-4" />{text}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{t.title}</DialogTitle></DialogHeader>
        <MasteryChallengePanel mindId={mindId} lang={lang} domain={domain} />
      </DialogContent>
    </Dialog>
  );
}
