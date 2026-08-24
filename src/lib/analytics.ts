import { idbGet, idbSet, STORES } from "@/lib/store";
import { normalizeOwnership, type Ownership } from "@/lib/ownership";

const KEY = "analytics";

export type SessionKind = "call" | "chat";

export type EngagementSession = {
  id: string;
  kind: SessionKind;
  mindId: string;
  startedAt: number;
  endedAt: number | null;
  queries: number;
};

export type GrowthEvent = {
  at: number;
  beliefs: number;
  memories: number;
  skills: number;
};

export type PayoutRequest = {
  at: number;
  amount: number;
  currency: string;
};

export type Analytics = {
  sessions: EngagementSession[];
  growth: GrowthEvent[];
  payouts: PayoutRequest[];
};

export function emptyAnalytics(): Analytics {
  return { sessions: [], growth: [], payouts: [] };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function normalize(raw: unknown): Analytics {
  if (typeof raw !== "object" || raw === null) return emptyAnalytics();
  const v = raw as Record<string, unknown>;
  const sessions = Array.isArray(v['sessions'])
    ? (v['sessions'] as unknown[]).flatMap((s) => {
        if (typeof s !== "object" || s === null) return [];
        const o = s as Record<string, unknown>;
        return [
          {
            id: String(o['id'] ?? ""),
            kind: o['kind'] === "call" ? ("call" as const) : ("chat" as const),
            mindId: String(o['mindId'] ?? ""),
            startedAt: num(o['startedAt'], Date.now()),
            endedAt: typeof o['endedAt'] === "number" ? (o['endedAt'] as number) : null,
            queries: num(o['queries']),
          },
        ];
      })
    : [];
  const growth = Array.isArray(v['growth'])
    ? (v['growth'] as unknown[]).flatMap((g) => {
        if (typeof g !== "object" || g === null) return [];
        const o = g as Record<string, unknown>;
        return [
          { at: num(o['at'], Date.now()), beliefs: num(o['beliefs']), memories: num(o['memories']), skills: num(o['skills']) },
        ];
      })
    : [];
  const payouts = Array.isArray(v['payouts'])
    ? (v['payouts'] as unknown[]).flatMap((p) => {
        if (typeof p !== "object" || p === null) return [];
        const o = p as Record<string, unknown>;
        return [{ at: num(o['at'], Date.now()), amount: num(o['amount']), currency: String(o['currency'] ?? "EVM") }];
      })
    : [];
  return { sessions: sessions.slice(-500), growth: growth.slice(-500), payouts: payouts.slice(-100) };
}

export async function loadAnalytics(): Promise<Analytics> {
  return normalize(await idbGet<unknown>(STORES.SETTINGS, KEY));
}

export async function saveAnalytics(a: Analytics): Promise<void> {
  await idbSet(STORES.SETTINGS, KEY, a);
}

async function mutate(fn: (a: Analytics) => Analytics): Promise<Analytics> {
  const next = fn(await loadAnalytics());
  await saveAnalytics(next);
  return next;
}

function sid(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Opens an engagement session (video call or chat) and returns its id. */
export async function startSession(kind: SessionKind, mindId: string): Promise<string> {
  const id = sid();
  await mutate((a) => ({
    ...a,
    sessions: [...a.sessions, { id, kind, mindId, startedAt: Date.now(), endedAt: null, queries: 0 }].slice(-500),
  }));
  return id;
}

/** Counts a query against a session and keeps its live end time fresh. */
export async function recordQuery(id: string): Promise<void> {
  await mutate((a) => ({
    ...a,
    sessions: a.sessions.map((s) => (s.id === id ? { ...s, queries: s.queries + 1, endedAt: null } : s)),
  }));
}

export async function endSession(id: string): Promise<void> {
  await mutate((a) => ({
    ...a,
    sessions: a.sessions.map((s) => (s.id === id && s.endedAt === null ? { ...s, endedAt: Date.now() } : s)),
  }));
}

/** Records newly mined mind growth (beliefs / memories / skills). */
export async function recordGrowth(delta: Omit<GrowthEvent, "at">): Promise<void> {
  if (delta.beliefs + delta.memories + delta.skills <= 0) return;
  await mutate((a) => ({ ...a, growth: [...a.growth, { at: Date.now(), ...delta }].slice(-500) }));
}

export async function requestPayout(amount: number, currency: string): Promise<Analytics> {
  return mutate((a) => ({ ...a, payouts: [...a.payouts, { at: Date.now(), amount, currency }].slice(-100) }));
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function sessionMinutes(s: EngagementSession, now = Date.now()): number {
  const end = s.endedAt ?? now;
  return Math.max(0, (end - s.startedAt) / 60000);
}

export type AnalyticsSummary = {
  totalCalls: number;
  activeChats: number;
  activeCalls: number;
  engagementMinutes: number;
  callMinutes: number;
  totalQueries: number;
  weekBeliefs: number;
  weekMemories: number;
  weekSkills: number;
  queryEarnings: number;
  callEarnings: number;
  gross: number;
  paidOut: number;
  available: number;
  currency: string;
};

/**
 * Earnings model: per-query rate applies to every chat/call query, and the
 * hourly rate is billed per elapsed call minute (rate / 60).
 */
export function summarize(a: Analytics, ownershipRaw: unknown, now = Date.now()): AnalyticsSummary {
  const ownership: Ownership = normalizeOwnership(ownershipRaw);
  const calls = a.sessions.filter((s) => s.kind === "call");
  const engagementMinutes = a.sessions.reduce((sum, s) => sum + sessionMinutes(s, now), 0);
  const callMinutes = calls.reduce((sum, s) => sum + sessionMinutes(s, now), 0);
  const totalQueries = a.sessions.reduce((sum, s) => sum + s.queries, 0);
  const week = a.growth.filter((g) => now - g.at <= WEEK_MS);

  const perQuery = ownership.rateUnit === "query" ? ownership.rate : 0;
  const perMinute = ownership.rateUnit === "hour" ? ownership.rate / 60 : 0;
  const queryEarnings = totalQueries * perQuery;
  const callEarnings = callMinutes * perMinute;
  const gross = queryEarnings + callEarnings;
  const paidOut = a.payouts.reduce((sum, p) => sum + p.amount, 0);

  return {
    totalCalls: calls.length,
    activeChats: a.sessions.filter((s) => s.kind === "chat" && s.endedAt === null).length,
    activeCalls: calls.filter((s) => s.endedAt === null).length,
    engagementMinutes,
    callMinutes,
    totalQueries,
    weekBeliefs: week.reduce((n, g) => n + g.beliefs, 0),
    weekMemories: week.reduce((n, g) => n + g.memories, 0),
    weekSkills: week.reduce((n, g) => n + g.skills, 0),
    queryEarnings,
    callEarnings,
    gross,
    paidOut,
    available: Math.max(0, gross - paidOut),
    currency: ownership.currency,
  };
}
