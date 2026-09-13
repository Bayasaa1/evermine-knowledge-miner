import { idbGet, idbSet, STORES } from "./store";
import { scopedKey, whenScopeReady } from "./user-scope";

export const CLOUD_KEY = "cloudStorageHub";
// Linked drives and their file index name real accounts, so they are stored
// under the signed-in Evermind account and never shared across sign-ins.
const cloudKey = () => scopedKey(CLOUD_KEY);
export const VAULT_FOLDER = "Evermind_Vaults";

export type ProviderId = "google_drive" | "dropbox" | "onedrive" | "s3";

export type StorageRole = "primary" | "media" | "backup";

export type CloudAccount = {
  id: string;
  provider: ProviderId;
  label: string;
  /** Account identity shown in the UI (email / bucket name). */
  account: string;
  role: StorageRole;
  quotaBytes: number;
  usedBytes: number;
  connectedAt: string;
  folder: string;
  enabled: boolean;
};

export type IndexedFile = {
  id: string;
  accountId: string;
  path: string;
  kind: "brain" | "video" | "clip";
  name: string;
  sizeBytes: number;
  savedAt: string;
};

export type CloudHub = {
  accounts: CloudAccount[];
  index: IndexedFile[];
};

export const PROVIDERS: { id: ProviderId; name: string; hint: string; defaultQuotaGb: number }[] = [
  { id: "google_drive", name: "Google Drive", hint: "you@gmail.com", defaultQuotaGb: 15 },
  { id: "dropbox", name: "Dropbox", hint: "you@dropbox.com", defaultQuotaGb: 2 },
  { id: "onedrive", name: "OneDrive", hint: "you@outlook.com", defaultQuotaGb: 5 },
  { id: "s3", name: "AWS S3", hint: "my-evermind-bucket", defaultQuotaGb: 100 },
];

export const GB = 1024 ** 3;

export function emptyHub(): CloudHub {
  return { accounts: [], index: [] };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function usageLabel(a: CloudAccount): string {
  return `${a.label}: ${formatBytes(a.usedBytes)}/${formatBytes(a.quotaBytes)} used`;
}

export function freeBytes(a: CloudAccount): number {
  return Math.max(0, a.quotaBytes - a.usedBytes);
}

export function usagePct(a: CloudAccount): number {
  return a.quotaBytes > 0 ? Math.min(100, Math.round((a.usedBytes / a.quotaBytes) * 100)) : 0;
}

/** Drives above this fill level are considered full and get skipped by routing. */
export const FULL_THRESHOLD = 0.98;

export function isFull(a: CloudAccount, needBytes = 0): boolean {
  return a.usedBytes + needBytes > a.quotaBytes * FULL_THRESHOLD;
}

/**
 * Picks the account a new file should land on.
 * Preferred-role drives come first (in connection order); when they are full the
 * next connected drive with room takes over — that is the auto-failover path.
 */
export function routeTarget(hub: CloudHub, role: StorageRole, sizeBytes: number): CloudAccount | null {
  const live = hub.accounts.filter((a) => a.enabled);
  const preferred = live.filter((a) => a.role === role);
  const rest = live.filter((a) => a.role !== role);
  for (const a of [...preferred, ...rest]) if (!isFull(a, sizeBytes)) return a;
  return null;
}

export function vaultPath(a: CloudAccount, kind: IndexedFile["kind"], name: string): string {
  const sub = kind === "brain" ? "brains" : kind === "video" ? "media" : "clips";
  return `${a.folder}/${sub}/${name}`;
}

/** Records a file against the routed drive and updates its usage. Returns the updated hub. */
export function placeFile(
  hub: CloudHub,
  input: { kind: IndexedFile["kind"]; name: string; sizeBytes: number; role?: StorageRole | undefined },
): { hub: CloudHub; file: IndexedFile | null; failedOver: boolean } {
  const role: StorageRole = input.role ?? (input.kind === "brain" ? "primary" : "media");
  const target = routeTarget(hub, role, input.sizeBytes);
  if (!target) return { hub, file: null, failedOver: false };
  const failedOver = target.role !== role;
  const path = vaultPath(target, input.kind, input.name);
  const file: IndexedFile = {
    id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    accountId: target.id,
    path,
    kind: input.kind,
    name: input.name,
    sizeBytes: input.sizeBytes,
    savedAt: new Date().toISOString(),
  };
  const next: CloudHub = {
    accounts: hub.accounts.map((a) => (a.id === target.id ? { ...a, usedBytes: a.usedBytes + input.sizeBytes } : a)),
    // One logical name per kind: re-syncing the brain replaces the old record.
    index: [...hub.index.filter((f) => !(f.kind === input.kind && f.name === input.name)), file],
  };
  return { hub: next, file, failedOver };
}

/**
 * Unified indexer: resolves a logical file name to a streamable URI no matter
 * which linked drive hosts it, so Gemini can read it through one address space.
 */
export function resolveUri(hub: CloudHub, name: string): { file: IndexedFile; account: CloudAccount; uri: string } | null {
  const file = [...hub.index].reverse().find((f) => f.name === name);
  if (!file) return null;
  const account = hub.accounts.find((a) => a.id === file.accountId);
  if (!account) return null;
  return { file, account, uri: `evermind://${account.provider}/${account.account}/${file.path}` };
}

export function makeAccount(input: {
  provider: ProviderId;
  account: string;
  label?: string | undefined;
  role?: StorageRole | undefined;
  quotaGb?: number | undefined;
  usedGb?: number | undefined;
}): CloudAccount {
  const meta = PROVIDERS.find((p) => p.id === input.provider)!;
  const quotaGb = input.quotaGb && input.quotaGb > 0 ? input.quotaGb : meta.defaultQuotaGb;
  return {
    id: `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    provider: input.provider,
    label: input.label?.trim() || meta.name,
    account: input.account.trim(),
    role: input.role ?? "media",
    quotaBytes: Math.round(quotaGb * GB),
    usedBytes: Math.max(0, Math.round((input.usedGb ?? 0) * GB)),
    connectedAt: new Date().toISOString(),
    folder: VAULT_FOLDER,
    enabled: true,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

export function parseHub(raw: unknown): CloudHub {
  if (!isObj(raw)) return emptyHub();
  const accounts = Array.isArray(raw['accounts'])
    ? raw['accounts'].filter(isObj).map((a): CloudAccount => ({
        id: str(a['id'], `acc_${Math.random().toString(36).slice(2)}`),
        provider: (PROVIDERS.some((p) => p.id === a['provider']) ? a['provider'] : "google_drive") as ProviderId,
        label: str(a['label'], "Drive"),
        account: str(a['account']),
        role: (["primary", "media", "backup"].includes(String(a['role'])) ? a['role'] : "media") as StorageRole,
        quotaBytes: num(a['quotaBytes'], 15 * GB),
        usedBytes: num(a['usedBytes']),
        connectedAt: str(a['connectedAt'], new Date().toISOString()),
        folder: str(a['folder'], VAULT_FOLDER),
        enabled: a['enabled'] !== false,
      }))
    : [];
  const index = Array.isArray(raw['index'])
    ? raw['index'].filter(isObj).map((f): IndexedFile => ({
        id: str(f['id'], `f_${Math.random().toString(36).slice(2)}`),
        accountId: str(f['accountId']),
        path: str(f['path']),
        kind: (["brain", "video", "clip"].includes(String(f['kind'])) ? f['kind'] : "video") as IndexedFile["kind"],
        name: str(f['name']),
        sizeBytes: num(f['sizeBytes']),
        savedAt: str(f['savedAt'], new Date().toISOString()),
      }))
    : [];
  return { accounts, index };
}

export async function loadHub(): Promise<CloudHub> {
  await whenScopeReady();
  return parseHub(await idbGet<unknown>(STORES.SETTINGS, cloudKey()));
}

export async function saveHub(hub: CloudHub): Promise<void> {
  await whenScopeReady();
  await idbSet(STORES.SETTINGS, cloudKey(), hub);
}
