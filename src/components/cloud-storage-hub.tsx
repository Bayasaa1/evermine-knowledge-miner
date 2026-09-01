import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CloudAccount,
  CloudHub,
  GB,
  IndexedFile,
  PROVIDERS,
  ProviderId,
  StorageRole,
  VAULT_FOLDER,
  emptyHub,
  formatBytes,
  freeBytes,
  isFull,
  loadHub,
  makeAccount,
  placeFile,
  resolveUri,
  routeTarget,
  saveHub,
  usagePct,
} from "@/lib/cloud-storage";
import { loadBrainDoc } from "@/lib/brain-studio";
import type { MineResult } from "@/lib/mine-file";
import { Cloud, HardDrive, Link2, Plus, RefreshCw, Trash2, Power, FolderSync, Search } from "lucide-react";
import { pickCopy, type Lang } from "@/lib/i18n";

export const CLOUD_HUB_TAB_LABEL: Record<Lang, string> = {
  en: "☁️ Cloud Storage Hub",
  mn: "☁️ Үүлэн сан",
  ko: "☁️ 클라우드 저장소 허브",
};

const L = {
  en: {
    title: "Cloud Storage Hub",
    subtitle: `Link multiple drives, assign roles and auto-failover when one fills up. App folder: ${VAULT_FOLDER}`,
    connect: "Connect account",
    provider: "Provider",
    account: "Account / bucket",
    label: "Display name",
    quota: "Quota (GB)",
    used: "Used (GB)",
    role: "Role",
    add: "Link storage",
    none: "No storage linked yet. Connect a drive to enable Core Brain sync and media routing.",
    primary: "Primary — Core Brain (.json)",
    media: "Media — videos & clips",
    backup: "Backup",
    syncBrain: "Sync Core Brain to Evermind_Vaults",
    registerMedia: "Route source video & clips",
    index: "Unified file index",
    indexEmpty: "Nothing indexed yet.",
    search: "Search indexed files…",
    disable: "Pause",
    enable: "Resume",
    remove: "Unlink",
    full: "Full",
    free: "free",
    oauthNote:
      "Google Drive access is scoped to an app-specific Evermind_Vaults folder. Connect a real Google account from workspace connectors to enable live OAuth sync; links added here index and route on-device.",
  },
  mn: {
    title: "Үүлэн сангийн төв",
    subtitle: `Олон дискийг холбож, үүрэг оноож, дүүрсэн үед автоматаар шилжүүлнэ. Апп фолдер: ${VAULT_FOLDER}`,
    connect: "Данс холбох",
    provider: "Үйлчилгээ",
    account: "Данс / bucket",
    label: "Нэр",
    quota: "Багтаамж (GB)",
    used: "Ашигласан (GB)",
    role: "Үүрэг",
    add: "Сан холбох",
    none: "Одоогоор сан холбоогүй байна.",
    primary: "Үндсэн — Core Brain (.json)",
    media: "Медиа — видео, клип",
    backup: "Нөөц",
    syncBrain: "Core Brain-г Evermind_Vaults руу хийх",
    registerMedia: "Эх видео, клипийг чиглүүлэх",
    index: "Нэгдсэн файлын индекс",
    indexEmpty: "Индекс хоосон байна.",
    search: "Файл хайх…",
    disable: "Түр зогсоох",
    enable: "Үргэлжлүүлэх",
    remove: "Салгах",
    full: "Дүүрсэн",
    free: "сул",
    oauthNote:
      "Google Drive хандалт нь зөвхөн Evermind_Vaults фолдероор хязгаарлагдана. Жинхэнэ OAuth синк хийхийн тулд Google дансаа холбоно уу.",
  },
  ko: {
    title: "클라우드 저장소 허브",
    subtitle: `여러 드라이브를 연결하고, 역할을 지정하며, 하나가 가득 차면 자동으로 다음 드라이브로 전환됩니다. 앱 폴더: ${VAULT_FOLDER}`,
    connect: "계정 연결",
    provider: "제공업체",
    account: "계정 / 버킷",
    label: "표시 이름",
    quota: "용량 (GB)",
    used: "사용량 (GB)",
    role: "역할",
    add: "저장소 연결",
    none: "아직 연결된 저장소가 없습니다. 드라이브를 연결해 Core Brain 동기화와 미디어 라우팅을 활성화하세요.",
    primary: "기본 — Core Brain (.json)",
    media: "미디어 — 영상 및 클립",
    backup: "백업",
    syncBrain: "Core Brain을 Evermind_Vaults로 동기화",
    registerMedia: "소스 영상 및 클립 라우팅",
    index: "통합 파일 인덱스",
    indexEmpty: "아직 인덱싱된 항목이 없습니다.",
    search: "인덱싱된 파일 검색…",
    disable: "일시 중지",
    enable: "재개",
    remove: "연결 해제",
    full: "가득 참",
    free: "여유",
    oauthNote:
      "Google Drive 접근 권한은 앱 전용 Evermind_Vaults 폴더로 범위가 제한됩니다. 실시간 OAuth 동기화를 사용하려면 워크스페이스 커넥터에서 실제 Google 계정을 연결하세요 — 여기서 추가한 링크는 기기 내에서 인덱싱 및 라우팅됩니다.",
  },
} as const;

type Props = {
  lang: Lang;
  results: MineResult[];
  sourceName: string | null;
  sourceSize: number | null;
  onLog: (m: string) => void;
};

export function CloudStorageHub({ lang, results, sourceName, sourceSize, onLog }: Props) {
  const t = pickCopy(L, lang);
  const [hub, setHub] = useState<CloudHub>(emptyHub());
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({
    provider: "google_drive" as ProviderId,
    account: "",
    label: "",
    quotaGb: "",
    usedGb: "",
    role: "media" as StorageRole,
  });

  useEffect(() => {
    void loadHub().then((h) => {
      setHub(h);
      setReady(true);
    });
  }, []);

  const persist = useCallback((next: CloudHub) => {
    setHub(next);
    void saveHub(next);
  }, []);

  const roleLabel = (r: StorageRole) => (r === "primary" ? t.primary : r === "media" ? t.media : t.backup);

  const addAccount = () => {
    if (!form.account.trim()) {
      toast.error(
        lang === "en"
          ? "Enter the account or bucket name."
          : lang === "ko"
          ? "계정 또는 버킷 이름을 입력하세요."
          : "Данс эсвэл bucket нэрээ оруулна уу.",
      );
      return;
    }
    const acc = makeAccount({
      provider: form.provider,
      account: form.account,
      label: form.label,
      role: form.role,
      quotaGb: Number(form.quotaGb) || undefined,
      usedGb: Number(form.usedGb) || 0,
    });
    persist({ ...hub, accounts: [...hub.accounts, acc] });
    setForm({ ...form, account: "", label: "", quotaGb: "", usedGb: "" });
    onLog(`Linked ${acc.label} (${acc.account}) as ${acc.role} storage — folder ${acc.folder}`);
    toast.success(`${acc.label} linked`);
  };

  const patch = (id: string, p: Partial<CloudAccount>) =>
    persist({ ...hub, accounts: hub.accounts.map((a) => (a.id === id ? { ...a, ...p } : a)) });

  const unlink = (a: CloudAccount) => {
    persist({ accounts: hub.accounts.filter((x) => x.id !== a.id), index: hub.index.filter((f) => f.accountId !== a.id) });
    onLog(`Unlinked ${a.label}`);
  };

  const store = (kind: IndexedFile["kind"], name: string, sizeBytes: number, role?: StorageRole) => {
    const res = placeFile(hub, { kind, name, sizeBytes, role });
    if (!res.file) {
      toast.error(
        lang === "en" ? "All linked drives are full." : lang === "ko" ? "연결된 모든 드라이브가 가득 찼습니다." : "Бүх сан дүүрсэн байна.",
      );
      onLog(`Routing failed for ${name} — every linked drive is at capacity`);
      return null;
    }
    persist(res.hub);
    const acc = res.hub.accounts.find((a) => a.id === res.file!.accountId)!;
    onLog(
      `${res.failedOver ? "Failover: " : ""}${name} → ${acc.label}:/${res.file.path} (${formatBytes(sizeBytes)})`,
    );
    if (res.failedOver)
      toast.warning(
      lang === "en" ? `Failover → ${acc.label}` : lang === "ko" ? `장애 조치 → ${acc.label}` : `Шилжүүлэв → ${acc.label}`,
    );
    return res;
  };

  const syncBrain = async () => {
    const doc = (await loadBrainDoc()) ?? null;
    if (!doc) {
      toast.error(
        lang === "en"
          ? "Mine a video first — no Core Brain yet."
          : lang === "ko"
          ? "먼저 영상을 채굴하세요 — 아직 Core Brain이 없습니다."
          : "Эхлээд видео боловсруулна уу.",
      );
      return;
    }
    const size = new Blob([JSON.stringify(doc)]).size;
    const r = store("brain", "core-brain.brain.json", size, "primary");
    if (r)
      toast.success(
        lang === "en" ? "Core Brain synced" : lang === "ko" ? "Core Brain 동기화 완료" : "Core Brain синк хийгдлээ",
      );
  };

  const registerMedia = () => {
    if (!sourceName) {
      toast.error(
        lang === "en" ? "Upload a video first." : lang === "ko" ? "먼저 영상을 업로드하세요." : "Эхлээд видео оруулна уу.",
      );
      return;
    }
    store("video", sourceName, sourceSize ?? 0, "media");
    const clips = results.flatMap((r) => (r.data.faceData ?? []).filter((f) => f.isKeyAction));
    clips.slice(0, 12).forEach((c, i) =>
      store("clip", `${sourceName.replace(/\.[^.]+$/, "")}_clip_${i + 1}_${(c.timestamp || "").replace(/\D/g, "")}.mp4`, 4 * 1024 * 1024, "media"),
    );
  };

  const filtered = useMemo(
    () =>
      [...hub.index]
        .reverse()
        .filter((f) => (query ? f.name.toLowerCase().includes(query.toLowerCase()) : true))
        .slice(0, 40),
    [hub.index, query],
  );

  const nextTarget = routeTarget(hub, "media", 0);

  if (!ready) return <div className="text-sm text-muted-foreground">…</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cloud className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-foreground">{t.title}</h4>
          <p className="text-xs text-muted-foreground">{t.subtitle}</p>
        </div>
      </div>

      {/* Connected accounts */}
      <div className="grid gap-3 sm:grid-cols-2">
        {hub.accounts.length === 0 && (
          <p className="rounded-[12px] border border-dashed border-border p-4 text-sm text-muted-foreground sm:col-span-2">
            {t.none}
          </p>
        )}
        {hub.accounts.map((a) => {
          const pct = usagePct(a);
          const full = isFull(a);
          return (
            <div key={a.id} className="rounded-[12px] border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                    <HardDrive className="h-4 w-4 shrink-0 text-primary" />
                    {a.label}
                    {!a.enabled && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">paused</span>}
                    {full && <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive">{t.full}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.account} · /{a.folder}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={a.enabled ? t.disable : t.enable}
                    onClick={() => patch(a.id, { enabled: !a.enabled })}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t.remove}
                    onClick={() => unlink(a)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${pct >= 98 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {formatBytes(a.usedBytes)}/{formatBytes(a.quotaBytes)} · {formatBytes(freeBytes(a))} {t.free}
              </p>

              <select
                value={a.role}
                onChange={(e) => patch(a.id, { role: e.target.value as StorageRole })}
                className="mt-3 w-full rounded-lg border border-border bg-muted px-2.5 py-2 text-xs text-foreground"
              >
                <option value="primary">{t.primary}</option>
                <option value="media">{t.media}</option>
                <option value="backup">{t.backup}</option>
              </select>
            </div>
          );
        })}
      </div>

      {/* Connect form */}
      <div className="rounded-[12px] border border-border bg-card p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Link2 className="h-4 w-4 text-primary" /> {t.connect}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            aria-label={t.provider}
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value as ProviderId })}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            aria-label={t.account}
            value={form.account}
            onChange={(e) => setForm({ ...form, account: e.target.value })}
            placeholder={PROVIDERS.find((p) => p.id === form.provider)?.hint}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <input
            aria-label={t.label}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={t.label}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <input
            aria-label={t.quota}
            inputMode="decimal"
            value={form.quotaGb}
            onChange={(e) => setForm({ ...form, quotaGb: e.target.value })}
            placeholder={t.quota}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <input
            aria-label={t.used}
            inputMode="decimal"
            value={form.usedGb}
            onChange={(e) => setForm({ ...form, usedGb: e.target.value })}
            placeholder={t.used}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <select
            aria-label={t.role}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as StorageRole })}
            className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
          >
            <option value="primary">{t.primary}</option>
            <option value="media">{t.media}</option>
            <option value="backup">{t.backup}</option>
          </select>
        </div>
        <button
          type="button"
          onClick={addAccount}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> {t.add}
        </button>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.oauthNote}</p>
      </div>

      {/* Routing actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void syncBrain()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <FolderSync className="h-4 w-4 text-primary" /> {t.syncBrain}
        </button>
        <button
          type="button"
          onClick={registerMedia}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4 text-primary" /> {t.registerMedia}
        </button>
        {nextTarget && (
          <span className="inline-flex items-center rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            → {nextTarget.label}
          </span>
        )}
      </div>

      {/* Unified index */}
      <div className="rounded-[12px] border border-border bg-card p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-foreground">{t.index}</p>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              className="w-full rounded-lg border border-border bg-muted py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t.indexEmpty}</p>
        ) : (
          <ul className="space-y-1.5">
            {filtered.map((f) => {
              const r = resolveUri(hub, f.name);
              return (
                <li key={f.id} className="min-w-0 rounded-lg border border-border bg-muted px-3 py-2">
                  <p className="truncate text-xs font-medium text-foreground">{f.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{r?.uri ?? f.path}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {f.kind} · {formatBytes(f.sizeBytes)} · {new Date(f.savedAt).toLocaleString()}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export { GB };
