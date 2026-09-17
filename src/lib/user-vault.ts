import { idbGet, idbSet, STORES } from "@/lib/store";
import { scopedKey, whenScopeReady } from "@/lib/user-scope";
import { apiFetch } from "@/lib/api-fetch";

export type UserVault = {
  updatedAt: string;
  turns: number;
  interests: string[];
  beliefs: string[];
  questions: string[];
  toneNotes: string[];
};

const VAULT_KEY = () => scopedKey("user_mind_vault");
const CAPTURE_KEY = () => scopedKey("user_mind_capture");

export function emptyVault(): UserVault {
  return {
    updatedAt: new Date().toISOString(),
    turns: 0,
    interests: [],
    beliefs: [],
    questions: [],
    toneNotes: [],
  };
}

export async function loadVault(): Promise<UserVault> {
  await whenScopeReady();
  const v = await idbGet<UserVault>(STORES.SETTINGS, VAULT_KEY());
  return v ?? emptyVault();
}

export async function saveVault(vault: UserVault): Promise<void> {
  await whenScopeReady();
  await idbSet(STORES.SETTINGS, VAULT_KEY(), vault);
}

export async function loadCaptureEnabled(): Promise<boolean> {
  await whenScopeReady();
  const v = await idbGet<boolean>(STORES.SETTINGS, CAPTURE_KEY());
  return v ?? true;
}

export async function saveCaptureEnabled(on: boolean): Promise<void> {
  await whenScopeReady();
  await idbSet(STORES.SETTINGS, CAPTURE_KEY(), on);
}

function mergeList(base: string[], next: string[], cap: number): string[] {
  const seen = new Set(base.map((v) => v.toLowerCase().trim()));
  const out = [...base];
  for (const item of next) {
    const clean = item.trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    out.push(clean);
  }
  return out.slice(-cap);
}

export type MinedDelta = {
  interests?: string[];
  beliefs?: string[];
  questions?: string[];
  toneNotes?: string[];
};

export function applyDelta(vault: UserVault, delta: MinedDelta, turns: number): UserVault {
  return {
    updatedAt: new Date().toISOString(),
    turns: vault.turns + turns,
    interests: mergeList(vault.interests, delta.interests ?? [], 24),
    beliefs: mergeList(vault.beliefs, delta.beliefs ?? [], 24),
    questions: mergeList(vault.questions, delta.questions ?? [], 24),
    toneNotes: mergeList(vault.toneNotes, delta.toneNotes ?? [], 12),
  };
}

export function vaultSignals(vault: UserVault): number {
  return vault.interests.length + vault.beliefs.length + vault.questions.length;
}

/** Mine the user's own utterances into their Subconsciousness Mind Vault. */
export async function mineUserTurns(utterances: string[]): Promise<MinedDelta | null> {
  const clean = utterances.map((u) => u.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  try {
    const res = await apiFetch("/api/user-mine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterances: clean.slice(-12) }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as MinedDelta;
    return data;
  } catch {
    return null;
  }
}

export function exportUserVault(vault: UserVault) {
  const blob = new Blob([JSON.stringify({ kind: "evermind.user-vault", version: 1, ...vault }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-subconsciousness.evermind.json";
  a.click();
  URL.revokeObjectURL(url);
}

export type VaultField = "interests" | "beliefs" | "questions" | "toneNotes";

/** Remove a single mined data point from the vault. */
export function removeVaultItem(vault: UserVault, field: VaultField, item: string): UserVault {
  return {
    ...vault,
    updatedAt: new Date().toISOString(),
    [field]: vault[field].filter((v) => v !== item),
  };
}

/** Wipe every mined data point (keeps nothing server-side — vault is device-local). */
export async function deleteVault(): Promise<UserVault> {
  const fresh = emptyVault();
  await saveVault(fresh);
  return fresh;
}
