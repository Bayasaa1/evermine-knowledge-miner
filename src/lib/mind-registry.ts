import { idbGet, idbSet, STORES } from "./store";
import { scopedKey } from "./user-scope";

/**
 * Creator Multi-Mind registry. One account owns many isolated Mind Vaults
 * (e.g. "Lawyer Mind", "Journalist Mind"). Each vault has its own Core Brain
 * document, vocabulary, tone and logic — nothing is shared between vaults.
 */

export type CreatorMind = {
  id: string;
  title: string;
  domain: string;
  /** Mind Vault ids that feed this mind, for traceability. */
  createdAt: string;
  updatedAt: string;
};

const REGISTRY_KEY = () => scopedKey("creatorMinds");
const ACTIVE_KEY = () => scopedKey("activeCreatorMind");

export async function listCreatorMinds(): Promise<CreatorMind[]> {
  const raw = await idbGet<CreatorMind[]>(STORES.SETTINGS, REGISTRY_KEY());
  return Array.isArray(raw) ? raw : [];
}

export async function createCreatorMind(title: string, domain = ""): Promise<CreatorMind> {
  const minds = await listCreatorMinds();
  const now = new Date().toISOString();
  const mind: CreatorMind = {
    id: `mind_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: title.trim() || "Untitled Mind",
    domain: domain.trim(),
    createdAt: now,
    updatedAt: now,
  };
  await idbSet(STORES.SETTINGS, REGISTRY_KEY(), [...minds, mind]);
  await setActiveCreatorMind(mind.id);
  return mind;
}

export async function renameCreatorMind(id: string, title: string, domain: string): Promise<void> {
  const minds = await listCreatorMinds();
  await idbSet(
    STORES.SETTINGS,
    REGISTRY_KEY(),
    minds.map((m) => (m.id === id ? { ...m, title: title.trim() || m.title, domain: domain.trim(), updatedAt: new Date().toISOString() } : m)),
  );
}

export async function deleteCreatorMind(id: string): Promise<void> {
  const minds = await listCreatorMinds();
  const rest = minds.filter((m) => m.id !== id);
  await idbSet(STORES.SETTINGS, REGISTRY_KEY(), rest);
  if ((await getActiveCreatorMindId()) === id) {
    await setActiveCreatorMind(rest[0]?.id ?? null);
  }
}

export async function getActiveCreatorMindId(): Promise<string | null> {
  return idbGet<string>(STORES.SETTINGS, ACTIVE_KEY());
}

export async function setActiveCreatorMind(id: string | null): Promise<void> {
  await idbSet(STORES.SETTINGS, ACTIVE_KEY(), id);
}

/** Resolve the active mind, creating a default vault on first run. */
export async function ensureActiveCreatorMind(): Promise<CreatorMind> {
  const minds = await listCreatorMinds();
  const activeId = await getActiveCreatorMindId();
  const active = minds.find((m) => m.id === activeId);
  if (active) return active;
  if (minds.length > 0) {
    await setActiveCreatorMind(minds[0]!.id);
    return minds[0]!;
  }
  return createCreatorMind("My First Mind", "General knowledge");
}
