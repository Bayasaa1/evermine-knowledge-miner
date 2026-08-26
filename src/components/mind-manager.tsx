import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Boxes, Check, Plus, Trash2, X } from "lucide-react";
import {
  createCreatorMind,
  deleteCreatorMind,
  ensureActiveCreatorMind,
  listCreatorMinds,
  setActiveCreatorMind,
  type CreatorMind,
} from "@/lib/mind-registry";

type Lang = "en" | "mn";

const L = {
  en: {
    title: "My Mind Vaults",
    subtitle: "Each vault keeps its own Core Brain, tone and logic — fully isolated.",
    add: "New Mind Vault",
    placeholder: "e.g. Lawyer Mind, Journalist Mind…",
    domainPlaceholder: "Specialization (optional)",
    create: "Create",
    cancel: "Cancel",
    active: "Active",
    use: "Set active",
    remove: "Delete vault",
    created: "Mind Vault created",
    deleted: "Mind Vault deleted",
    empty: "No vaults yet — create your first mind.",
  },
  mn: {
    title: "Миний Оюун Сангууд",
    subtitle: "Сан бүр өөрийн Үндсэн Тархи, өнгө аяс, логиктой — бүрэн тусдаа.",
    add: "Шинэ Оюун Сан",
    placeholder: "жиш: Хуулийн Оюун, Сэтгүүлчийн Оюун…",
    domainPlaceholder: "Мэргэшлийн чиглэл (заавал биш)",
    create: "Үүсгэх",
    cancel: "Болих",
    active: "Идэвхтэй",
    use: "Идэвхжүүлэх",
    remove: "Сан устгах",
    created: "Оюун Сан үүслээ",
    deleted: "Оюун Сан устгагдлаа",
    empty: "Одоогоор сан байхгүй — эхний оюунаа үүсгэнэ үү.",
  },
} as const;

export function MindManager({
  lang,
  onChange,
}: {
  lang: Lang;
  /** Called whenever the active mind changes (id of the active vault). */
  onChange?: (mind: CreatorMind) => void;
}) {
  const t = L[lang];
  const [minds, setMinds] = useState<CreatorMind[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("");

  const refresh = useCallback(async () => {
    const active = await ensureActiveCreatorMind();
    setMinds(await listCreatorMinds());
    setActiveId(active.id);
    onChange?.(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const pick = async (id: string) => {
    await setActiveCreatorMind(id);
    const all = await listCreatorMinds();
    setMinds(all);
    setActiveId(id);
    const found = all.find((m) => m.id === id);
    if (found) onChange?.(found);
  };

  const create = async () => {
    if (!title.trim()) return;
    const mind = await createCreatorMind(title, domain);
    setAdding(false);
    setTitle("");
    setDomain("");
    await refresh();
    onChange?.(mind);
    toast.success(t.created);
  };

  const remove = async (id: string) => {
    await deleteCreatorMind(id);
    await refresh();
    toast.success(t.deleted);
  };

  return (
    <section className="min-w-0 rounded-[12px] border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Boxes className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{t.title}</p>
            <p className="text-xs text-muted-foreground">{t.subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <Plus className="h-3.5 w-3.5" />
          {t.add}
        </button>
      </div>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-primary/40 bg-background p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.placeholder}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t.domainPlaceholder}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void create()}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <Check className="h-3.5 w-3.5" />
              {t.create}
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {minds.length === 0 && !adding ? (
        <p className="mt-3 text-sm text-muted-foreground">{t.empty}</p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {minds.map((m) => {
            const active = m.id === activeId;
            return (
              <div
                key={m.id}
                className={`min-w-0 rounded-lg border p-3 transition-colors ${
                  active ? "border-primary/60 bg-primary/5" : "border-border bg-background"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{m.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.domain || "—"}</p>
                  </div>
                  {active && (
                    <span className="shrink-0 rounded-full bg-status-green/15 px-2 py-0.5 text-[10px] font-semibold text-status-green">
                      {t.active}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  {!active && (
                    <button
                      type="button"
                      onClick={() => void pick(m.id)}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      {t.use}
                    </button>
                  )}
                  {minds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => void remove(m.id)}
                      aria-label={t.remove}
                      title={t.remove}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-status-red/50 hover:text-status-red"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
