import { Check, ListOrdered, Pause, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type RoomMessage, type RoomMind } from "@/lib/chat-rooms";
export function ModeratorBar({ pending, minds, busy, paused, onSpeak, onComplete, onPause, labels }: {
  pending: RoomMessage[]; minds: RoomMind[]; busy: boolean; paused: boolean;
  onSpeak: (minds: RoomMind[]) => void; onComplete: () => void; onPause: () => void;
  labels: { moderator: string; queued: string; order: string; done: string; pause: string; waiting: string };
}) {
  return <section aria-label={labels.moderator} className="shrink-0 space-y-2 border-b border-border bg-muted/30 px-3 py-3">
    <div className="flex items-center gap-2 text-xs font-medium"><Scale className="h-4 w-4" />{labels.moderator}<span className="ml-auto text-muted-foreground">{labels.queued}: {pending.length}</span></div>
    <p className="line-clamp-2 break-words text-sm text-muted-foreground">{pending[0]?.body || pending[0]?.attachment?.name || labels.waiting}</p>
    <div className="flex gap-2 overflow-x-auto pb-1">{minds.map((m) => <Button key={m.id} size="sm" variant="outline" disabled={busy || !pending.length} onClick={() => onSpeak([m])}>{m.mind_name}</Button>)}</div>
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal text-left" disabled={busy || !pending.length || !minds.length} onClick={() => onSpeak(minds)}><ListOrdered />{labels.order}: {minds.map((m) => m.mind_name).join(" → ")}</Button>
      <Button variant="ghost" size="sm" disabled={busy || !pending.length} onClick={onComplete}><Check />{labels.done}</Button>
      {busy && <Button variant="outline" size="sm" onClick={onPause} disabled={paused}><Pause />{labels.pause}</Button>}
    </div>
  </section>;
}