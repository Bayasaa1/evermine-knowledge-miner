import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { listVideoSpeakers, setOwnerSpeakers } from "@/lib/owner-speaker.functions";
import { pickCopy, useLang } from "@/lib/i18n";

const COPY = {
  en: {
    open: "Who is the persona?",
    ask: (n: string) => `Which of these voices is ${n}? Tick them and save — only the name on those lines changes.`,
    noPersona: "File this video under a persona first.",
    lines: "lines",
    save: "Save",
    saved: (c: number) => `${c} lines now belong to the persona.`,
    only: (n: string) => `Show only ${n}`,
  },
  mn: {
    open: "Persona нь хэн бэ?",
    ask: (n: string) => `Эдгээр дуу хоолойн аль нь ${n} вэ? Сонгоод хадгална уу — зөвхөн тэр мөрүүдийн нэр солигдоно.`,
    noPersona: "Энэ бичлэгийг эхлээд persona-д хадгална уу.",
    lines: "мөр",
    save: "Хадгалах",
    saved: (c: number) => `${c} мөр persona-д оноогдлоо.`,
    only: (n: string) => `Зөвхөн ${n}`,
  },
  ko: {
    open: "페르소나는 누구인가요?",
    ask: (n: string) => `이 목소리 중 ${n}은(는) 누구인가요? 선택 후 저장하세요 — 해당 줄의 이름만 바뀝니다.`,
    noPersona: "먼저 이 영상을 페르소나에 저장하세요.",
    lines: "줄",
    save: "저장",
    saved: (c: number) => `${c}줄이 페르소나로 지정되었습니다.`,
    only: (n: string) => `${n}만 보기`,
  },
};

export function OwnerSpeakerPicker({ contentId }: { contentId: string }) {
  const t = pickCopy(COPY, useLang());
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const client = useQueryClient();
  const list = useServerFn(listVideoSpeakers);
  const save = useServerFn(setOwnerSpeakers);
  const { data, isLoading } = useQuery({
    queryKey: ["video-speakers", contentId],
    queryFn: () => list({ data: { contentId } }),
    enabled: open,
  });
  const mut = useMutation({
    mutationFn: () => save({ data: { contentId, labels: picked } }),
    onSuccess: (r) => {
      toast.success(t.saved(r.changed));
      setPicked([]);
      void client.invalidateQueries({ queryKey: ["video-speakers", contentId] });
      void client.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
      >
        <UserCheck className="h-3 w-3" /> {t.open}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border/70 bg-card p-2">
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {data && !data.personaName && <p className="text-[11px] text-muted-foreground">{t.noPersona}</p>}
          {data && data.personaName && (
            <>
              <p className="text-[11px] text-muted-foreground">{t.ask(data.personaName)}</p>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {data.speakers.map((s) => (
                  <li key={s.label}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-xs hover:bg-accent">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={s.isOwner || picked.includes(s.label)}
                        disabled={s.isOwner}
                        onChange={(e) =>
                          setPicked((p) => (e.target.checked ? [...p, s.label] : p.filter((x) => x !== s.label)))
                        }
                      />
                      <span className="min-w-0">
                        <span className="font-medium">{s.label}</span>{" "}
                        <span className="text-muted-foreground">· {s.count} {t.lines}</span>
                        {s.sample && <span className="block truncate text-muted-foreground">“{s.sample}”</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={!picked.length || mut.isPending}
                onClick={() => mut.mutate()}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {mut.isPending && <Loader2 className="h-3 w-3 animate-spin" />} {t.save}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
