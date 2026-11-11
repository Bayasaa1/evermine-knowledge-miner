import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Brain, Film, Play, ShieldCheck, Target, Undo2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-fetch";
import { runNextChunk } from "@/lib/mining-jobs.functions";
import { OPERATOR_SKILLS, type OperatorSkill } from "@/lib/architect-operator";
import type { ArchitectResult, AttachedMind } from "@/lib/architect-types";


const COPY = {
  en: { activity: "Autonomous Activity Log", pilot: "Auto-Pilot", ready: "Ready", choose: "Select attached project", enable: "Allow automatic stalled-job recovery and timing repair while this chat is open? One recovery per minute; checks use no AI tokens. Brain changes and posting still require confirmation.", confirm: "Confirm", cancel: "Cancel", skills: ["Fix & advance mining", "Deepen & fuse brains", "Draft feed post", "Mastery pack · Levels 1–3", "Team briefing"], consent: "Run this action for the selected project? Mining and challenges use your own assigned keys. Original evidence is preserved.", publish: "Publish", publishConfirm: "Publish this reviewed draft publicly?", undo: "Undo post", checking: "Checking attached Minds", empty: "Attach a Mind to begin", failed: "Failed", complete: "Completed", mining: "Saved mining checkpoint", capped: "Daily Auto-Pilot limit reached (20). Resumes tomorrow.", preview: "Video moment" },
  mn: { activity: "Автомат ажиллагааны бүртгэл", pilot: "Автомат горим", ready: "Бэлэн", choose: "Холбосон төслөө сонгох", enable: "Энэ чат нээлттэй үед гацсан олборлолт, хадмалын хугацааг автоматаар засахыг зөвшөөрөх үү? Минут тутам нэг сэргээх үйлдэл; шалгалтад AI түлхүүр ашиглахгүй. Тархи өөрчлөх, нийтлэхдээ тусад нь асууна.", confirm: "Зөвшөөрөх", cancel: "Болих", skills: ["Олборлолт засаж ахиулах", "Тархи гүнзгийрүүлж нэгтгэх", "Нийтлэл бэлдэх", "Сорилтын багц · 1–3 түвшин", "Багийн тайлан"], consent: "Сонгосон төсөл дээр энэ үйлдлийг хийх үү? Олборлолт, сорилт таны хуваарилсан түлхүүрээр ажиллана. Эх нотолгоо хэвээр үлдэнэ.", publish: "Нийтлэх", publishConfirm: "Энэ хянасан нийтлэлийг олон нийтэд нийтлэх үү?", undo: "Нийтлэл буцаах", checking: "Холбосон Mind-уудыг шалгаж байна", empty: "Mind холбоно уу", failed: "Алдаа", complete: "Дууслаа", mining: "Олборлолтын хэсэг хадгалагдлаа", capped: "Өдрийн автомат засварын хязгаар (20) дууслаа. Маргааш үргэлжилнэ.", preview: "Бичлэгийн мөч" },
  ko: { activity: "자동 활동 기록", pilot: "자동 모드", ready: "준비", choose: "연결된 프로젝트 선택", enable: "이 채팅이 열려 있는 동안 정지 작업과 자막 시간을 자동 복구할까요? 분당 복구 한 건; 점검은 AI 토큰을 사용하지 않습니다. 브레인 변경과 게시는 별도 승인이 필요합니다.", confirm: "승인", cancel: "취소", skills: ["마이닝 복구 및 진행", "브레인 심화·융합", "피드 게시물 초안", "챌린지 팩 · 레벨 1–3", "팀 브리핑"], consent: "선택한 프로젝트에서 실행할까요? 마이닝과 챌린지는 내 키를 사용하며 원본 근거는 보존됩니다.", publish: "게시", publishConfirm: "검토한 초안을 공개할까요?", undo: "게시 취소", checking: "연결된 마인드 점검 중", empty: "마인드를 연결하세요", failed: "실패", complete: "완료", mining: "마이닝 구간 저장됨", capped: "오늘 자동 모드 한도(20)에 도달했습니다. 내일 재개됩니다.", preview: "영상 시점" },
};
const ICONS = [Play, Brain, Film, Target, Users];

export function ArchitectOperator({ ids, onResult, proposal, operatorMindId }: { operatorMindId: string; ids: string[]; onResult: (result: ArchitectResult) => void; proposal?: { skill: OperatorSkill; serial: number } | null }) {
  const { userId } = useAuth(); const { lang } = useLang();
  const t = COPY[lang === "mn" || lang === "ko" ? lang : "en"];
  const [pilot, setPilot] = useState(false);
  const [confirm, setConfirm] = useState<OperatorSkill | "pilot" | "publish" | null>(null);
  const [projects, setProjects] = useState<AttachedMind[]>([]);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ at: string; text: string }[]>([]);
  const [draft, setDraft] = useState<ArchitectResult["operator"]>();
  const generation = useRef(0); const flight = useRef(false);
  const nextChunk = useServerFn(runNextChunk);
  const rosterKey = JSON.stringify(ids);
  const append = (text: string) => setLog((list) => [...list.slice(-49), { at: new Date().toLocaleTimeString(), text }]);
  async function request(action: string, args: Record<string, unknown> = {}, signal?: AbortSignal) {
    const response = await apiFetch("/api/diagnose-chat", { method: "POST", ...(signal ? { signal } : {}), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, args, attachedMindIds: ids, lang, operatorMindId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `${t.failed} (${response.status})`);
    return data as ArchitectResult & { minds?: AttachedMind[]; project?: { id: string; title: string } };
  }
  useEffect(() => {
    const token = ++generation.current; const controller = new AbortController();
    setPilot(false); setBusy(false); setConfirm(null); setDraft(undefined); setProjectId(""); setProjects([]); setLog([]);
    if (!userId || !ids.length) return;
    void request("mind_roster", {}, controller.signal).then(async (data) => {
      const owned = (data.minds ?? []).filter((m) => m.kind === "project");
      const allowed: AttachedMind[] = [];
      // Validate persona-linked project membership on the server; never infer ownership in the UI.
      const linked = (data as ArchitectResult & { operatorProjects?: AttachedMind[] }).operatorProjects ?? [];
      for (const p of [...owned, ...linked.filter((p) => !owned.some((x) => x.mindId === p.mindId))]) {
        if (controller.signal.aborted) return;
        if (ids.includes(p.mindId) || linked.some((x) => x.mindId === p.mindId)) allowed.push(p);
      }
      if (generation.current === token) { setProjects(allowed); setProjectId(allowed[0]?.mindId.replace("project:", "") ?? ""); append(t.ready); }
    }).catch((error) => { if (!controller.signal.aborted) append(error.message); });
    return () => { controller.abort(); generation.current++; };
  }, [userId, rosterKey]);
  useEffect(() => { if (proposal) setConfirm(proposal.skill); }, [proposal]);
  useEffect(() => {
    if (!pilot || !userId || !ids.length) return;
    const token = generation.current; const controller = new AbortController();
    const tick = async () => {
      if (flight.current || document.visibilityState !== "visible") return;
      flight.current = true; setBusy(true); append(t.checking);
      try {
        let result = await request("operator_tick", { approved: true }, controller.signal);
        if (generation.current !== token || controller.signal.aborted) return;
        if (generation.current === token && !controller.signal.aborted) { append(result.text); onResult(result); }
      }
      catch (error) { if (!controller.signal.aborted && generation.current === token) append(`${t.failed}: ${error instanceof Error ? error.message : String(error)}`); }
      finally { flight.current = false; if (generation.current === token) setBusy(false); }
    };
    void tick(); const timer = window.setInterval(() => void tick(), 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [pilot, userId, rosterKey, lang]);
  async function execute(skill: OperatorSkill | "publish") {
    if (flight.current || !projectId) return;
    flight.current = true; setBusy(true); setConfirm(null);
    const token = generation.current;
    append(skill === "publish" ? t.publish : t.skills[OPERATOR_SKILLS.indexOf(skill)] ?? skill);
    try {
      let result: ArchitectResult;
      if (skill === "challenge_pack") {
        result = await request("operator_challenge_pack", { projectId, confirmed: true });
      } else {
        result = await request(skill === "publish" ? "publish_operator_post" : "operator_skill", skill === "publish" ? { projectId, draft: draft?.draft, confirmed: true } : { projectId, skill, confirmed: true });
        if (generation.current !== token) return;
        if (result.operator?.jobId) {
          const step = await nextChunk({ data: { jobId: result.operator.jobId, respectLease: true } });
          result = { ...result, text: `${step.chunk ? t.mining : step.busy ? t.checking : t.failed}: ${step.job.nextIndex}/${step.job.totalChunks}${step.job.lastError ? ` · ${step.job.lastError}` : ""}` };
        }
      }
      if (generation.current !== token) return;
      if (result.operator?.draft || result.operator?.postId) setDraft(result.operator);
      append(result.text.slice(0, 280)); onResult(result);
    } catch (error) { if (generation.current === token) append(`${t.failed}: ${error instanceof Error ? error.message : String(error)}`); }
    finally { flight.current = false; if (generation.current === token) setBusy(false); }
  }
  return <section aria-label={t.activity} className="shrink-0 space-y-2 border-b border-border px-3 py-2 text-xs">
    <div className="flex flex-wrap items-center gap-2"><Activity className="h-4 w-4 text-primary" /><strong className="flex-1">{t.activity}</strong><label className="flex items-center gap-2"><Switch checked={pilot} disabled={busy || !ids.length} onCheckedChange={(value) => value ? setConfirm("pilot") : setPilot(false)} aria-label={t.pilot} />{t.pilot}</label></div>
    {ids.length > 0 && <><Select value={projectId} disabled={busy} onValueChange={(id) => { setProjectId(id); setDraft(undefined); setConfirm(null); }}><SelectTrigger className="h-8 text-xs" aria-label={t.choose}><SelectValue placeholder={t.choose} /></SelectTrigger><SelectContent>{projects.map((p) => <SelectItem key={p.mindId} value={p.mindId.replace("project:", "")}>{p.name}</SelectItem>)}</SelectContent></Select>
    <div className="grid grid-cols-2 gap-1">{OPERATOR_SKILLS.map((skill, i) => { const Icon = ICONS[i] ?? Play; return <Button key={skill} size="sm" variant="outline" className="h-auto min-h-8 whitespace-normal text-left text-[11px]" disabled={busy || !projectId} onClick={() => setConfirm(skill)}><Icon className="shrink-0" />{t.skills[i]}</Button>; })}</div></>}
    {draft?.clipUrl && <a className="block text-primary underline" href={draft.clipUrl} target="_blank" rel="noreferrer">{t.preview}</a>}
    {draft?.draft && !draft.published && <Button size="sm" disabled={busy} onClick={() => setConfirm("publish")}><Film />{t.publish}</Button>}
    {draft?.postId && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { const token = generation.current; setBusy(true); void request("undo_operator_post", { postId: draft.postId }).then((r) => { if (generation.current === token) { setDraft(undefined); append(r.text); onResult(r); } }).catch((e) => { if (generation.current === token) append(e.message); }).finally(() => { if (generation.current === token) setBusy(false); }); }}><Undo2 />{t.undo}</Button>}
    {confirm && <div role="alertdialog" aria-label={t.confirm} className="space-y-2 border-t border-border pt-2"><p>{confirm === "pilot" ? t.enable : confirm === "publish" ? t.publishConfirm : t.consent}</p><Button size="sm" disabled={busy || (confirm !== "pilot" && !projectId)} onClick={() => { if (confirm === "pilot") { setConfirm(null); setPilot(true); } else void execute(confirm); }}><ShieldCheck />{t.confirm}</Button><Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>{t.cancel}</Button></div>}
    <div role="log" aria-live="polite" className="max-h-24 space-y-1 overflow-y-auto break-words text-[11px] text-muted-foreground">{log.length ? log.map((entry, i) => <p key={i}><time>{entry.at}</time> · {entry.text}</p>) : <p>{ids.length ? t.ready : t.empty}</p>}</div>
  </section>;
}