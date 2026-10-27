import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MINDS } from "@/lib/minds";
import { PLAN_LENGTHS, expiryFor, normalizeTiers, type PlanLength } from "@/lib/subscription";

/**
 * Purchases are granted server-side only. The browser can no longer write to
 * mind_purchases (RLS + grants block it), so a buyer cannot self-issue a
 * purchase row and unlock paid deployment, voice or verified-review rights.
 *
 * The server resolves the price itself — never from the client — and only
 * writes the row when nothing is owed. Anything with a real price requires a
 * payment-processor confirmation before a row is created.
 */

export type PurchaseResult = { ok: boolean; error: string | null; requiresPayment?: boolean };

/** Authoritative price for a catalogue mind, or null when it is not catalogued. */
function catalogPrice(mindId: string): { price: number; currency: string } | null {
  const mind = MINDS.find((m) => m.id === mindId);
  if (!mind) return null;
  return { price: mind.hourly, currency: "USD" };
}

/** Price the creator set for this plan length on their published project. */
async function projectPrice(
  mindId: string,
  plan: PlanLength,
): Promise<{ price: number; currency: string } | null> {
  const projectId = mindId.startsWith("project:") ? mindId.slice("project:".length) : "";
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("projects")
    .select("price,currency,plan_tiers,published")
    .eq("id", projectId)
    .maybeSingle();
  if (!data || !data.published) return null;
  const raw = (data.plan_tiers ?? null) as Record<string, unknown> | null;
  const currency = (raw?.['currency'] as string | undefined) || data.currency || "USD";
  if (raw?.['enabled'] !== true) return { price: 0, currency };
  const tiers = normalizeTiers(raw);
  const tier = tiers[plan];
  // A length the creator does not sell cannot be claimed for free.
  if (!tier?.enabled) return { price: Number(data.price ?? 0) || 1, currency };
  return { price: tier.price, currency };
}

export const claimMind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; category: string; plan?: string }) => {
    if (!input?.mindId || typeof input.mindId !== "string") throw new Error("A mind id is required");
    if (input.mindId.length > 200) throw new Error("Invalid mind id");
    const plan = PLAN_LENGTHS.includes(input.plan as PlanLength) ? (input.plan as PlanLength) : "lifetime";
    return { mindId: input.mindId, category: String(input.category || "knowledge").slice(0, 40), plan };
  })
  .handler(async ({ data, context }): Promise<PurchaseResult> => {
    const { assertNotBanned } = await import("@/lib/api-guard.server");
    await assertNotBanned(context.supabase, context.userId);

    const listed = catalogPrice(data.mindId) ?? (await projectPrice(data.mindId, data.plan));
    // A project that is unpublished or unknown has no price to honour: never grant it.
    if (!listed && data.mindId.startsWith("project:")) {
      return { ok: false, error: "This Mind is not available." } as PurchaseResult;
    }
    const price = listed?.price ?? 0;
    const currency = listed?.currency ?? "USD";

    if (price > 0) {
      return {
        ok: false,
        requiresPayment: true,
        error:
          "This subscription costs money. Checkout is not connected yet, so access cannot be granted — connect a payment provider to enable paid subscriptions.",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("mind_purchases").upsert(
      {
        user_id: context.userId,
        mind_id: data.mindId,
        category: data.category,
        price: 0,
        currency,
        // A free unlock never expires; paid lengths get their expiry at checkout.
        plan: "lifetime",
        expires_at: expiryFor("lifetime"),
      },
      { onConflict: "user_id,mind_id" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  });

/** Cancels the viewer's own subscription to a mind. Only their own row is
 *  removed — nobody else's access is ever touched. */
export const releaseMind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string }) => {
    if (!input?.mindId || typeof input.mindId !== "string") throw new Error("A mind id is required");
    if (input.mindId.length > 200) throw new Error("Invalid mind id");
    return { mindId: input.mindId };
  })
  .handler(async ({ data, context }): Promise<PurchaseResult> => {
    const { error } = await context.supabase
      .from("mind_purchases")
      .delete()
      .eq("user_id", context.userId)
      .eq("mind_id", data.mindId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  });

export type MindEntitlement = {
  access: "owner" | "free" | "purchased" | "locked";
  price: number;
  currency: string;
};

/** Server-verified download entitlement for one Mind (owner, free, or buyer). */
export const getMindEntitlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string }) => {
    if (!input?.mindId || typeof input.mindId !== "string" || input.mindId.length > 200) {
      throw new Error("A mind id is required");
    }
    return { mindId: input.mindId };
  })
  .handler(async ({ data, context }): Promise<MindEntitlement> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { downloadAccess } = await import("@/lib/purchases");
    const projectId = data.mindId.startsWith("project:") ? data.mindId.slice(8) : "";
    let ownerId: string | null = null;
    let price = 0;
    let currency = "USD";
    if (/^[0-9a-f-]{36}$/i.test(projectId)) {
      const { data: p } = await supabaseAdmin.from("projects").select("user_id").eq("id", projectId).maybeSingle();
      ownerId = p?.user_id ?? null;
      const listed = await projectPrice(data.mindId, "lifetime");
      price = listed?.price ?? 0;
      currency = listed?.currency ?? currency;
    } else {
      const { data: v } = await supabaseAdmin.from("mind_vaults").select("user_id").eq("id", data.mindId).maybeSingle();
      ownerId = (v as { user_id?: string } | null)?.user_id ?? null;
      const listed = catalogPrice(data.mindId);
      price = ownerId ? 0 : (listed?.price ?? 0);
      currency = listed?.currency ?? currency;
    }
    const { data: rows } = await supabaseAdmin
      .from("mind_purchases")
      .select("mind_id,expires_at")
      .eq("user_id", context.userId)
      .eq("mind_id", data.mindId);
    const access = downloadAccess(
      { mind_id: data.mindId, user_id: ownerId, price },
      context.userId,
      (rows ?? []) as Array<{ mind_id: string; expires_at: string | null }>,
    );
    return { access, price, currency };
  });

/* ───────────── Dual checkout: card link + bank / QR transfer ───────────── */

export type CheckoutOrder = {
  orderId: string;
  reference: string;
  amount: number;
  currency: string;
  plan: PlanLength;
  status: string;
  bank: { bankName: string; accountNumber: string; holder: string; qrUrl: string } | null;
  stripeLink: string | null;
};

function projectIdOf(mindId: string): string | null {
  const id = mindId.startsWith("project:") ? mindId.slice(8) : "";
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Opens (or re-opens) a payment order with a unique reference. Price comes from the server. */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mindId: string; category?: string; plan?: string; method?: string }) => {
    if (!input?.mindId || typeof input.mindId !== "string" || input.mindId.length > 200) throw new Error("A mind id is required");
    const plan = PLAN_LENGTHS.includes(input.plan as PlanLength) ? (input.plan as PlanLength) : "lifetime";
    const method = input.method === "stripe" ? "stripe" : "bank";
    return { mindId: input.mindId, category: String(input.category || "knowledge").slice(0, 40), plan, method };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; error: string | null; order?: CheckoutOrder }> => {
    const { assertNotBanned } = await import("@/lib/api-guard.server");
    await assertNotBanned(context.supabase, context.userId);
    const projectId = projectIdOf(data.mindId);
    if (!projectId) return { ok: false, error: "This Mind cannot be bought yet." };
    const listed = await projectPrice(data.mindId, data.plan);
    if (!listed) return { ok: false, error: "This Mind is not available." };
    if (!(listed.price > 0)) return { ok: false, error: "This plan is free — no payment needed." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: proj } = await supabaseAdmin.from("projects").select("user_id").eq("id", projectId).maybeSingle();
    const creatorId = proj?.user_id ?? null;
    if (!creatorId) return { ok: false, error: "This Mind is not available." };
    if (creatorId === context.userId) return { ok: false, error: "You already own this Mind." };
    const { data: acct } = await supabaseAdmin.from("creator_payout_accounts").select("*").eq("user_id", creatorId).maybeSingle();
    const links = (acct?.stripe_links ?? {}) as Record<string, unknown>;
    const stripeLink = typeof links[data.plan] === "string" && /^https:\/\//.test(links[data.plan] as string) ? (links[data.plan] as string) : null;
    const bank = acct && acct.account_number
      ? { bankName: acct.bank_name, accountNumber: acct.account_number, holder: acct.account_holder, qrUrl: acct.qr_url }
      : null;
    if (data.method === "stripe" && !stripeLink) return { ok: false, error: "The creator has not added a card payment link for this plan yet." };
    if (data.method === "bank" && !bank) return { ok: false, error: "The creator has not added bank details yet." };

    // Reuse an open order for the same Mind/plan/method so the reference stays stable.
    const { data: open } = await supabaseAdmin
      .from("mind_payment_orders")
      .select("id,reference,status,amount,currency")
      .eq("buyer_id", context.userId).eq("mind_id", data.mindId).eq("plan", data.plan).eq("method", data.method)
      .in("status", ["awaiting", "submitted"]).maybeSingle();
    let row = open;
    if (!row) {
      const { makePaymentReference } = await import("@/lib/payouts");
      for (let i = 0; i < 5 && !row; i++) {
        const { data: ins } = await supabaseAdmin.from("mind_payment_orders").insert({
          buyer_id: context.userId, creator_user_id: creatorId, mind_id: data.mindId, category: data.category,
          plan: data.plan, amount: listed.price, currency: listed.currency, method: data.method,
          reference: makePaymentReference(),
        }).select("id,reference,status,amount,currency").maybeSingle();
        row = ins;
      }
      if (!row) return { ok: false, error: "Could not create the payment order. Try again." };
    }
    return {
      ok: true, error: null,
      order: { orderId: row.id, reference: row.reference, amount: Number(row.amount), currency: row.currency, plan: data.plan, status: row.status, bank, stripeLink },
    };
  });

/** Buyer sends their bank transaction id / Stripe receipt id. Access waits for the creator's approval. */
export const submitPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; transactionRef: string }) => {
    const ref = String(input?.transactionRef ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(String(input?.orderId))) throw new Error("Invalid order");
    if (ref.length < 4 || ref.length > 120) throw new Error("Enter the transaction ID from your bank or receipt.");
    return { orderId: input.orderId, transactionRef: ref };
  })
  .handler(async ({ data, context }): Promise<PurchaseResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: upd, error } = await supabaseAdmin.from("mind_payment_orders")
      .update({ transaction_ref: data.transactionRef, status: "submitted" })
      .eq("id", data.orderId).eq("buyer_id", context.userId).in("status", ["awaiting", "submitted"])
      .select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!upd) return { ok: false, error: "Order not found." };
    return { ok: true, error: null };
  });

export type SaleRow = {
  id: string; mind_id: string; plan: string; amount: number; currency: string; method: string;
  reference: string; transaction_ref: string; status: string; buyer_id: string; buyer_name: string; created_at: string;
};

/** The creator's own sales, newest first. */
export const listCreatorSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SaleRow[]> => {
    const { data } = await context.supabase.from("mind_payment_orders").select("*")
      .eq("creator_user_id", context.userId).order("created_at", { ascending: false }).limit(300);
    const rows = data ?? [];
    const ids = [...new Set(rows.map((r) => r.buyer_id))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: ps } = await supabaseAdmin.from("profiles").select("id,display_name,username").in("id", ids);
      for (const p of ps ?? []) names.set(p.id, p.display_name || p.username || "");
    }
    return rows.map((r) => ({
      id: r.id, mind_id: r.mind_id, plan: r.plan, amount: Number(r.amount), currency: r.currency, method: r.method,
      reference: r.reference, transaction_ref: r.transaction_ref, status: r.status, buyer_id: r.buyer_id,
      buyer_name: names.get(r.buyer_id) || r.buyer_id.slice(0, 8), created_at: r.created_at,
    }));
  });

/** Creator approves (grants access) or revokes/rejects one of their own orders. */
export const decideOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; decision: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(input?.orderId))) throw new Error("Invalid order");
    const decision = input.decision === "approve" ? "approve" : input.decision === "reject" ? "reject" : "revoke";
    return { orderId: input.orderId, decision } as const;
  })
  .handler(async ({ data, context }): Promise<PurchaseResult> => {
    // Ownership check runs as the caller (RLS): only the creator sees their own sale.
    const { data: order } = await context.supabase.from("mind_payment_orders").select("*")
      .eq("id", data.orderId).eq("creator_user_id", context.userId).maybeSingle();
    if (!order) return { ok: false, error: "Order not found." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.decision === "approve") {
      const plan = (PLAN_LENGTHS.includes(order.plan as PlanLength) ? order.plan : "lifetime") as PlanLength;
      const { error } = await supabaseAdmin.from("mind_purchases").upsert({
        user_id: order.buyer_id, mind_id: order.mind_id, category: order.category,
        price: order.amount, currency: order.currency, plan, expires_at: expiryFor(plan),
      }, { onConflict: "user_id,mind_id" });
      if (error) return { ok: false, error: error.message };
      await supabaseAdmin.from("mind_payment_orders").update({ status: "approved" }).eq("id", order.id);
      return { ok: true, error: null };
    }
    if (order.status === "approved") {
      await supabaseAdmin.from("mind_purchases").delete().eq("user_id", order.buyer_id).eq("mind_id", order.mind_id);
    }
    await supabaseAdmin.from("mind_payment_orders")
      .update({ status: data.decision === "reject" ? "rejected" : "revoked" }).eq("id", order.id);
    return { ok: true, error: null };
  });
