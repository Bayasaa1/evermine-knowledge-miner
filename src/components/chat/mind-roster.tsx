import { useEffect, useRef, useState } from "react";
import { Brain, Loader2, Plus, RefreshCw, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-fetch";
import { normalizeMindRoster, updateMindRoster } from "@/lib/mind-directives";
import type { AttachedMind, ArchitectResult, MindDirective } from "@/lib/architect-types";

const COPY = {
  en: { roster: "Active Mind Roster", add: "Add Mind", remove: "Remove", check: "Check Minds", execute: "Execute Mind’s Order", all: "Execute All Mind Directives", confirm: "Confirm these repairs? Failed jobs will be requeued, not deleted. Deepening preserves originals; timing repair may re-mine one part using your mining key. Each request handles one brain/video. Remaining work stays visible.", cancel: "Cancel", source: "Detected from saved records, not a live teacher message", none: "No repair directives", undo: "Undo", critical: "Critical", warning: "Warning", enhance: "Enhance" },
  mn: { roster: "Идэвхтэй Mind-ууд", add: "Mind нэмэх", remove: "Хасах", check: "Mind шалгах", execute: "Mind-ийн даалгаврыг гүйцэтгэх", all: "Бүх Mind-ийн даалгаврыг гүйцэтгэх", confirm: "Эдгээр засварыг зөвшөөрөх үү? Алдаатай ажлыг устгахгүй, дахин дараалалд оруулна. Гүнзгийрүүлэхэд эх мэдээлэл хэвээр үлдэнэ; хадмал засахад таны олборлолтын түлхүүрээр нэг хэсгийг дахин олборлож болно. Нэг хүсэлт нэг тархи/бичлэг засна. Үлдсэн ажил харагдана.", cancel: "Болих", source: "Хадгалсан мэдээллээс илрүүлсэн; багшийн шууд мессеж биш", none: "Засварын даалгавар алга", undo: "Буцаах", critical: "Ноцтой", warning: "Анхааруулга", enhance: "Сайжруулах" },
  ko: { roster: "활성 마인드", add: "마인드 추가", remove: "제거", check: "마인드 점검", execute: "마인드 지시 실행", all: "모든 마인드 지시 실행", confirm: "복구를 승인할까요? 실패 작업은 삭제하지 않고 다시 대기시킵니다. 원본은 유지되며 자막 복구는 내 마이닝 키로 한 구간을 다시 분석할 수 있습니다. 요청당 브레인/영상 하나를 처리합니다. 남은 작업은 표시됩니다.", cancel: "취소", source: "저장된 기록에서 감지됨; 교사의 실시간 메시지가 아님", none: "복구 지시 없음", undo: "실행 취소", critical: "심각", warning: "경고", enhance: "개선" },
};
export function MindRoster({ ids, onChange, refreshToken = 0, onResult, rosterOnly = false, choices: provided }: {
  ids: string[]; onChange: (ids: string[]) => void; refreshToken?: number;
  onResult?: (result: ArchitectResult) => void; rosterOnly?: boolean; choices?: AttachedMind[];
}) {
  const { userId } = useAuth(); const { lang } = useLang();
  const t = COPY[lang === "mn" || lang === "ko" ? lang : "en"];
  const [choices, setChoices] = useState<AttachedMind[]>([]);
  const [directives, setDirectives] = useState<MindDirective[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<MindDirective[] | null>(null);
  const [undo, setUndo] = useState<string[] | null>(null);
  const generation = useRef(0);
  const rosterKey = JSON.stringify(ids);
  async function request(action: string, args: Record<string, unknown> = {}) {
    const res = await apiFetch("/api/diagnose-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, args, lang, attachedMindIds: ids }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data as ArchitectResult & { minds?: AttachedMind[] };
  }
  useEffect(() => {
    const token = ++generation.current; setDirectives([]); setError(""); setConfirming(null);
    if (!userId || rosterOnly) return;
    let cancelled = false;
    const check = async () => {
      try { const data = await request("mind_roster"); if (!cancelled && generation.current === token) { setChoices(data.minds ?? []); setDirectives(data.directives ?? []); setError(""); } }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); }
    };
    void check(); const timer = window.setInterval(() => void check(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [userId, rosterKey, lang, refreshToken, rosterOnly]);
  async function execute(list: MindDirective[]) {
    setConfirming(null); setBusy(true); setError("");
    const token = generation.current; const seen = new Set<string>();
    try {
      for (const d of list) {
        if (token !== generation.current) break;
        const key = `${d.targetProjectId}:${d.suggestedTool}`;
        if (seen.has(key)) continue; seen.add(key);
        const result = await request("execute_mind_directive", { directiveId: d.id });
        if (token !== generation.current) break;
        setDirectives(result.directives ?? []); onResult?.(result);
      }
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const available = provided ?? choices;
  return <section aria-label={t.roster} className="shrink-0 border-b border-border px-3 py-2 text-xs">
    <div className="mb-1 flex items-center gap-2 font-medium"><Brain className="h-3.5 w-3.5" />{t.roster}{!rosterOnly && <Button variant="ghost" size="icon-sm" aria-label={t.check} title={t.check} disabled={busy} onClick={() => void request("mind_directives").then((d) => setDirectives(d.directives ?? [])).catch((e) => setError(e.message))}><RefreshCw /></Button>}</div>
    <div className="flex flex-wrap items-center gap-1">
      {ids.map((id) => <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border pl-2"><Brain className="h-3 w-3 shrink-0" /><span className="truncate">{available.find((m) => m.mindId === id)?.name || id}</span><Button variant="ghost" size="icon-sm" disabled={busy} aria-label={`${t.remove} ${available.find((m) => m.mindId === id)?.name || id}`} onClick={() => { setUndo(ids); onChange(updateMindRoster(ids, id, false)); }}><X /></Button></span>)}
      <Select value="" onValueChange={(id) => { setUndo(ids); onChange(updateMindRoster(ids, id, true)); }} disabled={busy || ids.length >= 10 || !userId}><SelectTrigger className="h-8 w-auto max-w-full text-xs" aria-label={t.add}><Plus className="h-3 w-3" /><SelectValue placeholder={t.add} /></SelectTrigger><SelectContent>{available.filter((m) => !ids.includes(m.mindId)).map((m) => <SelectItem key={m.mindId} value={m.mindId}>{m.name}</SelectItem>)}</SelectContent></Select>
      {undo && <Button variant="ghost" size="sm" disabled={busy} onClick={() => { onChange(undo); setUndo(null); }}>{t.undo}</Button>}
    </div>
    {!rosterOnly && ids.length > 0 && <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
      <p className="text-[10px] text-muted-foreground">{t.source}</p>
      {directives.length > 1 && <Button size="sm" className="h-auto whitespace-normal" disabled={busy} onClick={() => setConfirming(directives)}><Zap />{t.all}</Button>}
      {directives.map((d) => <article key={d.id} className="rounded-md border border-border bg-muted/30 p-2"><div className="flex items-center gap-2">{d.mindAvatar ? <img src={d.mindAvatar} alt="" className="h-6 w-6 rounded-full object-cover" /> : <Brain className="h-5 w-5 shrink-0" />}<strong className="min-w-0 break-words">{d.mindName}</strong><span className="ml-auto text-muted-foreground">{t[d.severity]}</span></div><p className="mt-1 break-words">{d.issueSummary}</p><p className="mt-1 break-words text-muted-foreground">{d.directiveForChatbot}</p><Button size="sm" className="mt-2 h-auto whitespace-normal" disabled={busy} onClick={() => setConfirming([d])}>{busy ? <Loader2 className="animate-spin" /> : <Zap />}{t.execute}</Button></article>)}
      {!directives.length && !error && <p className="text-muted-foreground">{t.none}</p>}
    </div>}
    {confirming && <div role="alertdialog" aria-label={t.execute} className="mt-2 space-y-2 border-t border-border pt-2"><p>{t.confirm}</p>{confirming.map((d) => <p key={d.id}>{d.mindName}: {d.suggestedTool}</p>)}<Button size="sm" onClick={() => void execute(confirming)}><Zap />{t.execute}</Button><Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>{t.cancel}</Button></div>}
    {error && <p role="alert" className="mt-2 break-words text-destructive">{error}</p>}
  </section>;
}

export function useArchitectRoster() {
  const { userId } = useAuth(); const [state, setState] = useState<{ owner: string | null; ids: string[] }>({ owner: null, ids: [] });
  useEffect(() => {
    if (!userId) { setState({ owner: null, ids: [] }); return; }
    try { setState({ owner: userId, ids: normalizeMindRoster(JSON.parse(localStorage.getItem(`evermind:architect-roster:${userId}`) || "[]")) }); }
    catch { setState({ owner: userId, ids: [] }); }
  }, [userId]);
  const ids = state.owner === userId ? state.ids : [];
  const change = (next: string[]) => { if (!userId) return; const clean = normalizeMindRoster(next); setState({ owner: userId, ids: clean }); try { localStorage.setItem(`evermind:architect-roster:${userId}`, JSON.stringify(clean)); } catch { /* memory state still works */ } };
  return { ids, change };
}