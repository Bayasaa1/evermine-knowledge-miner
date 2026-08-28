import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AuditEntry = {
  id: string;
  event: string;
  detail: string;
  ip: string | null;
  userAgent: string | null;
  suspicious: boolean;
  tokens: number;
  email: string | null;
  createdAt: string;
};

export type LeaderRow = { label: string; value: number; sub?: string };

export type ControlSessionData = {
  metrics: {
    users: number;
    miningJobs: number;
    chunksMined: number;
    activeJobs: number;
    pausedJobs: number;
    tokens: number;
    vaults: number;
  };
  audit: AuditEntry[];
  topCreators: LeaderRow[];
  topMinds: LeaderRow[];
};

/** Admin-only aggregate dashboard. Role is verified as the caller, never with the admin client. */
export const getControlSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ControlSessionData> => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profiles, jobs, logs, vaults, purchases, reviews] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, email"),
      supabaseAdmin.from("mining_jobs").select("id, user_id, status, next_index, source_label"),
      supabaseAdmin
        .from("activity_logs")
        .select("id, user_id, event, detail, ip, user_agent, suspicious, tokens, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("mind_vaults").select("id, user_id, title"),
      supabaseAdmin.from("mind_purchases").select("mind_id"),
      supabaseAdmin.from("mind_reviews").select("mind_id"),
    ]);

    const nameById = new Map<string, string>();
    for (const p of profiles.data ?? []) {
      nameById.set(p.id, p.display_name ?? p.email ?? p.id.slice(0, 8));
    }
    const emailById = new Map<string, string>();
    for (const p of profiles.data ?? []) if (p.email) emailById.set(p.id, p.email);

    const jobRows = jobs.data ?? [];
    const chunksMined = jobRows.reduce((sum, j) => sum + (j.next_index ?? 0), 0);

    const perCreator = new Map<string, number>();
    for (const j of jobRows) perCreator.set(j.user_id, (perCreator.get(j.user_id) ?? 0) + (j.next_index ?? 0));
    for (const v of vaults.data ?? []) perCreator.set(v.user_id, (perCreator.get(v.user_id) ?? 0) + 1);

    const perMind = new Map<string, number>();
    for (const p of purchases.data ?? []) perMind.set(p.mind_id, (perMind.get(p.mind_id) ?? 0) + 2);
    for (const r of reviews.data ?? []) perMind.set(r.mind_id, (perMind.get(r.mind_id) ?? 0) + 1);

    const rank = (m: Map<string, number>, label: (k: string) => string): LeaderRow[] =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, value]) => ({ label: label(k), value }));

    return {
      metrics: {
        users: profiles.data?.length ?? 0,
        miningJobs: jobRows.length,
        chunksMined,
        activeJobs: jobRows.filter((j) => j.status === "running" || j.status === "queued").length,
        pausedJobs: jobRows.filter((j) => j.status === "paused_quota").length,
        tokens: (logs.data ?? []).reduce((s, l) => s + (l.tokens ?? 0), 0),
        vaults: vaults.data?.length ?? 0,
      },
      audit: (logs.data ?? []).map((l) => ({
        id: l.id,
        event: l.event,
        detail: l.detail,
        ip: l.ip,
        userAgent: l.user_agent,
        suspicious: l.suspicious,
        tokens: l.tokens,
        email: l.user_id ? (emailById.get(l.user_id) ?? null) : null,
        createdAt: l.created_at,
      })),
      topCreators: rank(perCreator, (id) => nameById.get(id) ?? id.slice(0, 8)),
      topMinds: rank(perMind, (id) => id),
    };
  });

/** Records a client-observed security event (sign-in, account switch, suspicious retry). */
export const logActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event: string; detail?: string; suspicious?: boolean; tokens?: number }) => ({
    event: String(input?.event ?? "unknown").slice(0, 60),
    detail: String(input?.detail ?? "").slice(0, 300),
    suspicious: !!input?.suspicious,
    tokens: Number.isFinite(input?.tokens) ? Math.max(0, Math.floor(input!.tokens!)) : 0,
  }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      event: data.event,
      detail: data.detail,
      suspicious: data.suspicious,
      tokens: data.tokens,
      ip,
      user_agent: getRequestHeader("user-agent") ?? null,
    });
    return { ok: true };
  });
