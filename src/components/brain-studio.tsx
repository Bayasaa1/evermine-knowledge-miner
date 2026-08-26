import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BRAIN_CATEGORIES,
  deriveBrainDoc,
  downloadBrainDoc,
  emptyBrainDoc,
  loadBrainDoc,
  mergeBrainDoc,
  parseBrainDoc,
  saveBrainDoc,
  setEntryActive,
  brainId,
  type BrainCategory,
  type BrainDoc,
  type BrainEntry,
} from "@/lib/brain-studio";
import { parseTimestamp } from "@/lib/voice-sample";
import type { MineResult } from "@/lib/mine-file";
import {
  Brain,
  Pencil,
  Trash2,
  Plus,
  RefreshCw,
  Download,
  FolderOpen,
  Check,
  X,
  Quote,
  Film,
} from "lucide-react";

type Lang = "en" | "mn";

const L = {
  en: {
    tab: "🧠 Core Brain Studio",
    title: "Core Brain Studio",
    subtitle: "Edit, refine and inject knowledge straight into your AI clone's mind.",
    beliefs: "Beliefs & Philosophy",
    decisionLogic: "Decision Logic & Rules",
    skills: "Skills & Capabilities",
    expressiveStyle: "Expressive Style",
    aestheticProfile: "Aesthetic Profile",
    cultural: "Cultural Idioms & Unique Vocabulary",
    actions: "Visual Action Clips",
    empty: "Nothing here yet — mine a video or add a custom memory.",
    add: "+ Add Custom Memory",
    addPlaceholder: "Type a philosophy, rule or fact…",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    remove: "Delete",
    custom: "Custom",
    edited: "Edited",
    regenerate: "Regenerate Brain from Vault",
    download: "Download Brain (.json)",
    import: "Import Brain",
    saved: "Core Brain saved",
    deleted: "Removed from Core Brain",
    added: "Custom memory injected",
    regenerated: "Brain rebuilt from vault",
    imported: "Brain imported",
    importFailed: "Import failed",
    literal: "Literal",
    meaning: "True meaning",
    noVideo: "Load the source video to preview this action.",
    entries: "entries",
    activeBadge: "Active / Latest View",
    archivedBadge: "Archived / Old View",
    makeActive: "Set Active",
    archive: "Archive",
    recordedAt: "Recorded",
    historyTimeline: "Historical Memory Timeline",
    conflicts: "conflicts resolved (latest wins)",
  },
  mn: {
    tab: "🧠 Үндсэн Тархи Студи",
    title: "Үндсэн Тархи Студи",
    subtitle: "AI хуулбарынхаа тархинд мэдлэг засах, сайжруулах, нэмэх.",
    beliefs: "Итгэл үнэмшил ба Философи",
    decisionLogic: "Шийдвэрийн логик ба Дүрэм",
    skills: "Ур чадвар",
    expressiveStyle: "Илэрхийлэх хэв маяг",
    aestheticProfile: "Гоо зүйн хэв маяг",
    cultural: "Соёлын хэлц ба Онцлог үгсийн сан",
    actions: "Үйлдлийн видео хэсгүүд",
    empty: "Одоогоор хоосон — видео олборлох эсвэл санах ой нэмнэ үү.",
    add: "+ Санах ой нэмэх",
    addPlaceholder: "Философи, дүрэм эсвэл баримт бичнэ үү…",
    save: "Хадгалах",
    cancel: "Болих",
    edit: "Засах",
    remove: "Устгах",
    custom: "Нэмсэн",
    edited: "Засварласан",
    regenerate: "Тархийг сангаас дахин үүсгэх",
    download: "Тархи татах (.json)",
    import: "Тархи оруулах",
    saved: "Үндсэн тархи хадгалагдлаа",
    deleted: "Үндсэн тархинаас хаслаа",
    added: "Санах ой нэмэгдлээ",
    regenerated: "Тархи дахин үүслээ",
    imported: "Тархи орж ирлээ",
    importFailed: "Оруулж чадсангүй",
    literal: "Шууд утга",
    meaning: "Жинхэнэ утга",
    noVideo: "Энэ үйлдлийг үзэхийн тулд эх видеог ачаална уу.",
    entries: "бичлэг",
    activeBadge: "Идэвхтэй / Сүүлийн үзэл",
    archivedBadge: "Архив / Хуучин үзэл",
    makeActive: "Идэвхжүүлэх",
    archive: "Архивлах",
    recordedAt: "Бүртгэсэн",
    historyTimeline: "Санах ойн түүхэн хуанли",
    conflicts: "зөрчил шийдэгдсэн (шинэ нь давна)",
  },
} as const;

function ClipPreview({ src, start, end }: { src: string; start: string; end: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const from = parseTimestamp(start) ?? 0;
  const rawTo = parseTimestamp(end) ?? from + 4;
  const to = rawTo > from ? Math.min(rawTo, from + 6) : from + 4;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime >= to || v.currentTime < from - 0.5) v.currentTime = from;
    };
    const onLoaded = () => {
      v.currentTime = from;
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onLoaded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [from, to]);

  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      autoPlay
      playsInline
      className="h-28 w-full rounded-lg border border-border object-cover"
    />
  );
}

export function BrainStudio({
  lang,
  results,
  previewUrl,
  onLog,
  onRemine,
  canRemine,
  mindId,
}: {
  lang: Lang;
  results: MineResult[];
  previewUrl: string | null;
  onLog?: (message: string) => void;
  onRemine?: () => void;
  canRemine?: boolean;
  /** Isolates this Core Brain to a specific Mind Vault. */
  mindId?: string | null;
}) {
  const t = L[lang];
  const [doc, setDoc] = useState<BrainDoc>(() => emptyBrainDoc());
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<BrainCategory | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    setReady(false);
    void (async () => {
      const stored = await loadBrainDoc(mindId);
      if (!alive) return;
      setDoc(mergeBrainDoc(stored, deriveBrainDoc(results)));
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mindId]);

  // Absorb newly mined material without discarding manual edits.
  useEffect(() => {
    if (!ready) return;
    setDoc((prev) => mergeBrainDoc(prev, deriveBrainDoc(results)));
  }, [ready, results]);

  const commit = useCallback(
    (next: BrainDoc, message?: string) => {
      const stamped = { ...next, updatedAt: new Date().toISOString() };
      setDoc(stamped);
      void saveBrainDoc(stamped, mindId);
      if (message) {
        toast.success(message);
        onLog?.(message);
      }
    },
    [onLog, mindId],
  );

  const updateEntry = (cat: BrainCategory, id: string, text: string) =>
    commit(
      {
        ...doc,
        entries: {
          ...doc.entries,
          [cat]: doc.entries[cat].map((e) =>
            e.id === id ? { ...e, text, edited: true, updatedAt: new Date().toISOString() } : e,
          ),
        },
      },
      t.saved,
    );

  const deleteEntry = (cat: BrainCategory, id: string) =>
    commit(
      {
        ...doc,
        entries: { ...doc.entries, [cat]: doc.entries[cat].filter((e) => e.id !== id) },
        deleted: Array.from(new Set([...doc.deleted, id])),
      },
      t.deleted,
    );

  const addEntry = (cat: BrainCategory, text: string) => {
    const now = new Date().toISOString();
    const entry: BrainEntry = {
      id: brainId("custom", `${cat}:${text}:${Date.now()}`),
      text,
      source: "custom",
      edited: false,
      createdAt: now,
      updatedAt: now,
      status: "active",
      supersededBy: null,
    };
    commit({ ...doc, entries: { ...doc.entries, [cat]: [...doc.entries[cat], entry] } }, t.added);
  };

  const toggleActive = (cat: BrainCategory, id: string, active: boolean) =>
    commit(setEntryActive(doc, cat, id, active), t.saved);

  const updateCultural = (id: string, meaning: string) =>
    commit(
      { ...doc, cultural: doc.cultural.map((c) => (c.id === id ? { ...c, meaning, edited: true } : c)) },
      t.saved,
    );

  const deleteCultural = (id: string) =>
    commit(
      {
        ...doc,
        cultural: doc.cultural.filter((c) => c.id !== id),
        deleted: Array.from(new Set([...doc.deleted, id])),
      },
      t.deleted,
    );

  const regenerate = () => {
    commit(mergeBrainDoc(doc, deriveBrainDoc(results)), t.regenerated);
    if (canRemine) onRemine?.();
  };

  const handleImport = async (file: File) => {
    try {
      const parsed = parseBrainDoc(JSON.parse(await file.text()));
      commit(parsed, t.imported);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      toast.error(`${t.importFailed}: ${reason}`);
      onLog?.(`${t.importFailed}: ${reason}`);
    }
  };

  const total =
    BRAIN_CATEGORIES.reduce((n, c) => n + doc.entries[c].length, 0) + doc.cultural.length + doc.actions.length;

  const renderEntry = (cat: BrainCategory, e: BrainEntry) => {
    const key = `${cat}:${e.id}`;
    if (editing === key)
      return (
        <li key={e.id} className="rounded-lg border border-primary/40 bg-background p-3">
          <textarea
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            rows={3}
            className="w-full resize-y rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                const v = draft.trim();
                if (v) updateEntry(cat, e.id, v);
                setEditing(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              <Check className="h-3.5 w-3.5" />
              {t.save}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              {t.cancel}
            </button>
          </div>
        </li>
      );

    return (
      <li key={e.id} className="group flex items-start gap-3 rounded-lg border border-border bg-background p-3">
        <p className="min-w-0 flex-1 break-words text-sm leading-relaxed text-foreground">
          {e.text}
          {e.source === "custom" && (
            <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              {t.custom}
            </span>
          )}
          {e.edited && (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {t.edited}
            </span>
          )}
        </p>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={t.edit}
            title={t.edit}
            onClick={() => {
              setEditing(key);
              setDraft(e.text);
            }}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={t.remove}
            title={t.remove}
            onClick={() => deleteEntry(cat, e.id)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-status-red"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Brain className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{t.title}</p>
            <p className="text-xs text-muted-foreground">{t.subtitle}</p>
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {total} {t.entries}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={regenerate}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t.regenerate}
        </button>
        <button
          type="button"
          onClick={() => downloadBrainDoc(doc)}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          <Download className="h-3.5 w-3.5" />
          {t.download}
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t.import}
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleImport(f);
          }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {BRAIN_CATEGORIES.map((cat) => (
          <section key={cat} className="min-w-0 rounded-[12px] border border-border bg-card p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">{t[cat]}</p>
            {doc.entries[cat].length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.empty}</p>
            ) : (
              <ul className="space-y-2">{doc.entries[cat].map((e) => renderEntry(cat, e))}</ul>
            )}

            {adding === cat ? (
              <div className="mt-3 rounded-lg border border-primary/40 bg-background p-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  placeholder={t.addPlaceholder}
                  className="w-full resize-y rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none focus:border-primary"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const v = draft.trim();
                      if (v) addEntry(cat, v);
                      setAdding(null);
                      setDraft("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(null);
                      setDraft("");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAdding(cat);
                  setDraft("");
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                {t.add}
              </button>
            )}
          </section>
        ))}
      </div>

      <section className="min-w-0 rounded-[12px] border border-border bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">{t.cultural}</p>
        {doc.cultural.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {doc.cultural.map((c) => (
              <div key={c.id} className="min-w-0 rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex min-w-0 items-start gap-2 text-sm font-medium text-foreground">
                    <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="break-words">{c.phrase}</span>
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      aria-label={t.edit}
                      onClick={() => {
                        setEditing(`cul:${c.id}`);
                        setDraft(c.meaning);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t.remove}
                      onClick={() => deleteCultural(c.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-status-red"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.literal}: {c.literal || "—"}
                </p>
                {editing === `cul:${c.id}` ? (
                  <div className="mt-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      className="w-full resize-y rounded-md border border-border bg-card p-2 text-sm text-foreground outline-none focus:border-primary"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          updateCultural(c.id, draft.trim());
                          setEditing(null);
                        }}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      >
                        {t.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-foreground">
                    <span className="text-primary">{t.meaning}:</span> {c.meaning || "—"}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="min-w-0 rounded-[12px] border border-border bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-primary">{t.actions}</p>
        {doc.actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {doc.actions.map((a) => (
              <div key={a.id} className="min-w-0 rounded-lg border border-border bg-background p-3">
                {previewUrl ? (
                  <ClipPreview src={previewUrl} start={a.clipStart} end={a.clipEnd} />
                ) : (
                  <div className="flex h-28 w-full items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-[11px] text-muted-foreground">
                    <Film className="mr-1.5 h-3.5 w-3.5" />
                    {t.noVideo}
                  </div>
                )}
                <p className="mt-2 truncate text-sm font-medium text-foreground">{a.label}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
                <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {a.timestamp}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export const BRAIN_STUDIO_TAB_LABEL: Record<Lang, string> = { en: L.en.tab, mn: L.mn.tab };
