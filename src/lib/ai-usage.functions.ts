/**
 * Reading the account AI usage history.
 *
 * Everything here is owner-scoped through `requireSupabaseAuth`: a signed-in
 * person only ever sees their own calls.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type UsageRow = {
  id: string;
  at: string;
  role: string;
  provider: string;
  keyTail: string | null;
  model: string;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  inputTokens: number;
  outputTokens: number;
  chars: number;
  cost: number;
  free: boolean;
  status: string;
  jobId: string;
};

export type UsageBucket = {
  key: string;
  label: string;
  calls: number;
  tokens: number;
  chars: number;
  cost: number;
  failures: number;
};

export type UsageHistory = {
  rows: UsageRow[];
  total: number;
  today: { tokens: number; cost: number; calls: number };
  month: { tokens: number; cost: number; calls: number };
  all: { tokens: number; cost: number; calls: number };
  byRole: UsageBucket[];
  byProvider: UsageBucket[];
  byVideo: UsageBucket[];
  leaks: { kind: string; label: string; tokens: number; cost: number; detail: string }[];
};

const schema = z.object({
  /** How far back to look, in days. 0 = everything. */
  days: z.number().int().min(0).max(365).default(30),
  role: z.string().max(40).optional(),
  onlyFailures: z.boolean().default(false),
  limit: z.number().int().min(1).max(500).default(200),
});

type DbRow = {
  id: string;
  created_at: string;
  role: string;
  provider: string;
  key_tail: string | null;
  model: string;
  subject_kind: string;
  subject_id: string;
  subject_label: string;
  input_tokens: number;
  output_tokens: number;
  char_count: number;
  estimated_cost_usd: number | string;
  free_tier: boolean;
  status: string;
  job_id: string;
};

const toRow = (r: DbRow): UsageRow => ({
  id: r.id,
  at: r.created_at,
  role: r.role,
  provider: r.provider,
  keyTail: r.key_tail,
  model: r.model,
  subjectKind: r.subject_kind,
  subjectId: r.subject_id,
  subjectLabel: r.subject_label,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
  chars: r.char_count,
  cost: Number(r.estimated_cost_usd) || 0,
  free: r.free_tier,
  status: r.status,
  jobId: r.job_id,
});

function group(rows: UsageRow[], pick: (r: UsageRow) => { key: string; label: string } | null): UsageBucket[] {
  const map = new Map<string, UsageBucket>();
  for (const row of rows) {
    const id = pick(row);
    if (!id) continue;
    const bucket = map.get(id.key) ?? { key: id.key, label: id.label, calls: 0, tokens: 0, chars: 0, cost: 0, failures: 0 };
    bucket.calls += 1;
    bucket.tokens += row.inputTokens + row.outputTokens;
    bucket.chars += row.chars;
    bucket.cost += row.cost;
    if (row.status !== "ok") bucket.failures += 1;
    map.set(id.key, bucket);
  }
  return [...map.values()].sort((a, b) => b.tokens + b.chars - (a.tokens + a.chars) || b.cost - a.cost);
}

const sum = (rows: UsageRow[]) => ({
  tokens: rows.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0),
  cost: Number(rows.reduce((n, r) => n + r.cost, 0).toFixed(4)),
  calls: rows.length,
});

/** Everything the History section needs, in one owner-scoped read. */
export const getUsageHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<UsageHistory> => {
    let query = context.supabase
      .from("ai_usage_events")
      .select(
        "id, created_at, role, provider, key_tail, model, subject_kind, subject_id, subject_label, input_tokens, output_tokens, char_count, estimated_cost_usd, free_tier, status, job_id",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data.days > 0) {
      query = query.gte("created_at", new Date(Date.now() - data.days * 86_400_000).toISOString());
    }
    if (data.role) query = query.eq("role", data.role);
    if (data.onlyFailures) query = query.neq("status", "ok");

    const { data: raw, error } = await query;
    if (error) throw new Error(error.message);
    const rows = ((raw ?? []) as DbRow[]).map(toRow);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const todayRows = rows.filter((r) => new Date(r.at) >= startOfDay);
    const monthRows = rows.filter((r) => new Date(r.at) >= monthStart);

    const byVideo = group(rows, (r) => (r.subjectKind === "video" ? { key: r.subjectId || r.subjectLabel, label: r.subjectLabel || r.subjectId } : null));

    // ── Where tokens leak ────────────────────────────────────────────────
    const leaks: UsageHistory["leaks"] = [];
    const failed = rows.filter((r) => r.status !== "ok");
    if (failed.length) {
      leaks.push({
        kind: "failed",
        label: "Calls that failed or hit a limit",
        tokens: failed.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0),
        cost: Number(failed.reduce((n, r) => n + r.cost, 0).toFixed(4)),
        detail: `${failed.length} calls returned nothing usable.`,
      });
    }
    const repeated = byVideo.filter((v) => v.calls > 4);
    for (const v of repeated.slice(0, 3)) {
      leaks.push({
        kind: "repeat",
        label: `Mined many times: ${v.label}`,
        tokens: v.tokens,
        cost: Number(v.cost.toFixed(4)),
        detail: `${v.calls} mining calls on the same video.`,
      });
    }
    const paid = rows.filter((r) => !r.free && r.cost > 0);
    if (paid.length) {
      leaks.push({
        kind: "paid",
        label: "Work that ran on a paid key",
        tokens: paid.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0),
        cost: Number(paid.reduce((n, r) => n + r.cost, 0).toFixed(4)),
        detail: `${paid.length} calls were billed. A free key assigned to that job would cost nothing.`,
      });
    }
    const biggest = [...rows].sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens))[0];
    if (biggest && biggest.inputTokens + biggest.outputTokens > 200_000) {
      leaks.push({
        kind: "huge",
        label: "One very large call",
        tokens: biggest.inputTokens + biggest.outputTokens,
        cost: biggest.cost,
        detail: `${biggest.subjectLabel || biggest.role} used more tokens than a normal job. Shorter videos cost far less.`,
      });
    }

    return {
      rows: rows.slice(0, data.limit),
      total: rows.length,
      today: sum(todayRows),
      month: sum(monthRows),
      all: sum(rows),
      byRole: group(rows, (r) => ({ key: r.role, label: r.role })),
      byProvider: group(rows, (r) => ({ key: r.provider, label: r.provider })),
      byVideo,
      leaks,
    };
  });

/** Wipes the account history. The keys and their limits stay untouched. */
export const clearUsageHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    await context.supabase.from("ai_usage_events").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export type ProviderMeter = {
  provider: string;
  free: boolean;
  calls: number;
  callsToday: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  todayTokens: number;
  cost: number;
};

export type UsageMeters = {
  totalTokens: number;
  totalCalls: number;
  todayTokens: number;
  todayCalls: number;
  totalCost: number;
  todayCost: number;
  lastCallAt: string | null;
  providers: ProviderMeter[];
  /** Today's tokens and calls grouped by what the AI was doing. */
  byRoleToday: { role: string; calls: number; tokens: number; cost: number }[];
};

/**
 * Live meters straight from the account's server-side usage records, so the
 * headline numbers always match the History list below them.
 */
export const getUsageMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageMeters> => {
    const { data: raw, error } = await context.supabase
      .from("ai_usage_events")
      .select("created_at, role, provider, input_tokens, output_tokens, estimated_cost_usd, free_tier")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);

    type Row = {
      created_at: string;
      role: string;
      provider: string;
      input_tokens: number;
      output_tokens: number;
      estimated_cost_usd: number | string;
      free_tier: boolean;
    };
    const rows = (raw ?? []) as Row[];

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const providers = new Map<string, ProviderMeter>();
    const roles = new Map<string, { role: string; calls: number; tokens: number; cost: number }>();
    let totalTokens = 0;
    let todayTokens = 0;
    let todayCalls = 0;
    let totalCost = 0;
    let todayCost = 0;

    for (const r of rows) {
      const tokens = (r.input_tokens || 0) + (r.output_tokens || 0);
      const cost = Number(r.estimated_cost_usd) || 0;
      const isToday = new Date(r.created_at) >= dayStart;
      totalTokens += tokens;
      totalCost += cost;
      if (isToday) {
        todayTokens += tokens;
        todayCalls += 1;
        todayCost += cost;
        const rr = roles.get(r.role) ?? { role: r.role, calls: 0, tokens: 0, cost: 0 };
        rr.calls += 1;
        rr.tokens += tokens;
        rr.cost += cost;
        roles.set(r.role, rr);
      }
      const p =
        providers.get(r.provider) ??
        ({
          provider: r.provider,
          free: r.free_tier,
          calls: 0,
          callsToday: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          todayTokens: 0,
          cost: 0,
        } satisfies ProviderMeter);
      p.calls += 1;
      p.inputTokens += r.input_tokens || 0;
      p.outputTokens += r.output_tokens || 0;
      p.totalTokens += tokens;
      p.cost += cost;
      if (isToday) {
        p.callsToday += 1;
        p.todayTokens += tokens;
      }
      providers.set(r.provider, p);
    }

    return {
      totalTokens,
      totalCalls: rows.length,
      todayTokens,
      todayCalls,
      totalCost: Number(totalCost.toFixed(4)),
      todayCost: Number(todayCost.toFixed(4)),
      lastCallAt: rows[0]?.created_at ?? null,
      providers: [...providers.values()].sort((a, b) => b.totalTokens - a.totalTokens),
      byRoleToday: [...roles.values()].sort((a, b) => b.tokens - a.tokens),
    };
  });

