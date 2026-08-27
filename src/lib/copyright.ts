/**
 * Copyright & authenticity gate.
 *
 * Every mined segment carries a Gemini copyright audit. When any segment is
 * flagged the mind enters the FLAGGED_COPYRIGHT state and cannot be published
 * until the creator explicitly confirms they own the footage. The confirmation
 * is stored per account (device-local, account-scoped) alongside the mind.
 */
import { idbGet, idbSet, STORES } from "./store";
import { scopedKey } from "./user-scope";
import type { ChunkResult, CopyrightSignal } from "./gemini";

export type CopyrightState = "CLEAR" | "FLAGGED_COPYRIGHT" | "OWNER_CONFIRMED";

export type CopyrightVerdict = {
  state: CopyrightState;
  flagged: boolean;
  signals: CopyrightSignal[];
  summaries: string[];
};

const KEY = (mindId: string) => scopedKey(`copyright-ack:${mindId}`);

/** Aggregates the per-chunk audits into one verdict for the whole mind. */
export function auditChunks(chunks: ChunkResult[], confirmed = false): CopyrightVerdict {
  const audits = chunks.map((c) => c.copyright).filter(Boolean);
  const signals = audits.flatMap((a) => a?.signals ?? []).sort((a, b) => b.confidence - a.confidence);
  const flagged = audits.some((a) => a?.flagged);
  const summaries = audits.map((a) => a?.summary ?? "").filter(Boolean);
  return {
    flagged,
    signals,
    summaries,
    state: !flagged ? "CLEAR" : confirmed ? "OWNER_CONFIRMED" : "FLAGGED_COPYRIGHT",
  };
}

export async function isOwnershipConfirmed(mindId: string): Promise<boolean> {
  return (await idbGet<boolean>(STORES.SETTINGS, KEY(mindId))) === true;
}

/** Records the creator's explicit "this footage is mine" confirmation. */
export async function confirmOwnership(mindId: string): Promise<void> {
  await idbSet(STORES.SETTINGS, KEY(mindId), true);
}

export async function revokeOwnershipConfirmation(mindId: string): Promise<void> {
  await idbSet(STORES.SETTINGS, KEY(mindId), false);
}

/** Publishing is allowed when nothing was flagged, or the creator confirmed ownership. */
export function canPublish(verdict: CopyrightVerdict): boolean {
  return verdict.state !== "FLAGGED_COPYRIGHT";
}
