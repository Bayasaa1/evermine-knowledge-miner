import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-fetch";
import { allowedOperator, normalizeOperatorMind } from "@/lib/operator-mind";
import type { AttachedMind } from "@/lib/architect-types";

const EVENT = "evermind:operator-mind";
export function useOperatorMind() {
  const { userId } = useAuth();
  const [state, setState] = useState<{ owner: string | null; id: string }>({ owner: null, id: "builtin:architect" });
  useEffect(() => {
    if (!userId) { setState({ owner: null, id: "builtin:architect" }); return; }
    const read = () => { let id = "builtin:architect"; try { id = normalizeOperatorMind(localStorage.getItem(`evermind:operator-mind:${userId}`)); } catch { /* retain safe default */ } setState({ owner: userId, id }); };
    read(); window.addEventListener(EVENT, read); window.addEventListener("storage", read);
    return () => { window.removeEventListener(EVENT, read); window.removeEventListener("storage", read); };
  }, [userId]);
  const change = (id: string) => {
    if (!userId) return;
    const clean = normalizeOperatorMind(id); setState({ owner: userId, id: clean });
    try { localStorage.setItem(`evermind:operator-mind:${userId}`, clean); } catch { /* in-memory choice still works */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return { id: state.owner === userId ? state.id : "builtin:architect", change };
}
export function OperatorMindSelector({ value, onChange, disabled = false }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const { userId } = useAuth(); const { lang } = useLang();
  const [owned, setOwned] = useState<{ owner: string; minds: AttachedMind[] } | null>(null);
  const [error, setError] = useState("");
  const copy = lang === "mn" ? { label: "Чатботын тархи · Оператор Mind", presets: ["Системийн архитектор", "Elon Musk · Суурь зарчим", "Gordon Ramsay · Чанарын хяналт"] } : lang === "ko" ? { label: "챗봇 브레인 · 운영 마인드", presets: ["기본 시스템 설계자", "Elon Musk · 제1원리", "Gordon Ramsay · 품질 관리"] } : { label: "Chatbot Brain · Operator Mind", presets: ["Default System Architect", "Elon Musk · First principles", "Gordon Ramsay · Quality control"] };
  useEffect(() => {
    setOwned(null); setError(""); if (!userId) return;
    const controller = new AbortController();
    void apiFetch("/api/diagnose-chat", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "operator_choices" }) }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not load Minds");
      if (!controller.signal.aborted) { setOwned({ owner: userId, minds: data.minds ?? [] }); const clean = allowedOperator(value, data.minds ?? []); if (clean !== value) onChange(clean); }
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [userId]);
  const minds = owned?.owner === userId ? owned.minds : [];
  return <section className="shrink-0 space-y-1 border-b border-border bg-muted/30 px-3 py-2"><label className="flex items-center gap-2 text-xs font-semibold"><Crown className="h-4 w-4 text-primary" />{copy.label}</label><Select value={value} disabled={disabled || !userId} onValueChange={onChange}><SelectTrigger className="h-auto min-h-9 w-full text-xs [&>span]:truncate" aria-label={copy.label}><SelectValue /></SelectTrigger><SelectContent>{["builtin:architect", "builtin:musk", "builtin:ramsay"].map((id, i) => <SelectItem key={id} value={id}>{copy.presets[i]}</SelectItem>)}{minds.map((m) => <SelectItem key={m.mindId} value={m.mindId}>{m.name}</SelectItem>)}</SelectContent></Select>{error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}</section>;
}