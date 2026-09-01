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

export type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  banned: boolean;
  banReason: string;
  unlimitedQuota: boolean;
  isAdmin: boolean;
  createdAt: string;
};

/** Verifies the caller holds the admin role, else throws. */
async function assertAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

/** Full user roster with moderation flags. Super admin only. */
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profiles, flags, roles] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, email, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("user_flags").select("user_id, banned, ban_reason, unlimited_quota"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    const flagById = new Map((flags.data ?? []).map((f) => [f.user_id, f]));
    const admins = new Set((roles.data ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    return (profiles.data ?? []).map((p) => {
      const f = flagById.get(p.id);
      return {
        id: p.id,
        email: p.email,
        displayName: p.display_name,
        banned: !!f?.banned,
        banReason: f?.ban_reason ?? "",
        unlimitedQuota: !!f?.unlimited_quota,
        isAdmin: admins.has(p.id),
        createdAt: p.created_at,
      };
    });
  });

/** Ban / unban / grant unlimited quota. Super admin only. */
export const adminSetUserFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; banned?: boolean; unlimitedQuota?: boolean; banReason?: string }) => ({
    userId: String(input?.userId ?? ""),
    banned: typeof input?.banned === "boolean" ? input.banned : undefined,
    unlimitedQuota: typeof input?.unlimitedQuota === "boolean" ? input.unlimitedQuota : undefined,
    banReason: String(input?.banReason ?? "").slice(0, 300),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    if (!data.userId) throw new Error("Missing user");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_flags").upsert(
      {
        user_id: data.userId,
        ...(data.banned !== undefined ? { banned: data.banned, ban_reason: data.banned ? data.banReason : "" } : {}),
        ...(data.unlimitedQuota !== undefined ? { unlimited_quota: data.unlimitedQuota } : {}),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("activity_logs").insert({
      user_id: context.userId,
      event: "admin_user_flags",
      detail: `${data.userId} banned=${data.banned ?? "-"} unlimited=${data.unlimitedQuota ?? "-"}`,
    });
    return { ok: true };
  });

/** Feature / unfeature a mind on the platform. Super admin only. */
export const adminFeatureMind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; featured: boolean; note?: string }) => ({
    mindId: String(input?.mindId ?? "").slice(0, 120),
    featured: !!input?.featured,
    note: String(input?.note ?? "").slice(0, 200),
  }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context);
    if (!data.mindId) throw new Error("Missing mind");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.featured) {
      const { error } = await supabaseAdmin
        .from("featured_minds")
        .upsert({ mind_id: data.mindId, featured_by: context.userId, note: data.note }, { onConflict: "mind_id" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("featured_minds").delete().eq("mind_id", data.mindId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Currently featured mind ids. Super admin only. */
export const adminListFeatured = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("featured_minds").select("mind_id");
    return (data ?? []).map((r) => r.mind_id);
  });
