/**
 * The account-wide AI usage ledger.
 *
 * Every AI call the signed-in user's own keys make is written here once, from
 * the server, so the history in the API Manager is the same on every device.
 * Recording is always best-effort: a failed write must never break a job.
 */
import { estimateCost, isFreeProvider } from "@/lib/ai-rates";

export type UsageMeta = {
  userId: string;
  role: string;
  provider?: string;
  keyId?: string | null;
  keyTail?: string | null;
  model?: string;
  subjectKind?: "video" | "mind" | "project" | "test" | "other";
  subjectId?: string;
  subjectLabel?: string;
  jobId?: string;
};

export type UsageResult = {
  inputTokens?: number;
  outputTokens?: number;
  chars?: number;
  status?: "ok" | "error" | "quota";
  errorCode?: string | null;
};

const text = (v: unknown, max = 200): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** Appends one AI call to the account ledger. Never throws. */
export async function recordAiUsage(meta: UsageMeta, result: UsageResult = {}): Promise<void> {
  try {
    if (!meta.userId) return;
    const provider = text(meta.provider) || "unknown";
    const inputTokens = int(result.inputTokens);
    const outputTokens = int(result.outputTokens);
    const chars = int(result.chars);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_usage_events").insert({
      user_id: meta.userId,
      role: text(meta.role, 40) || "other",
      provider,
      key_id: meta.keyId ?? null,
      key_tail: text(meta.keyTail, 8) || null,
      model: text(meta.model, 80),
      subject_kind: meta.subjectKind ?? "other",
      subject_id: text(meta.subjectId, 120),
      subject_label: text(meta.subjectLabel, 200),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      char_count: chars,
      estimated_cost_usd: estimateCost(provider, inputTokens, outputTokens, chars),
      free_tier: isFreeProvider(provider),
      status: result.status ?? "ok",
      error_code: text(result.errorCode, 40) || null,
      job_id: text(meta.jobId, 80),
    });
  } catch {
    /* usage history must never break an AI job */
  }
}

/** Reads token counts out of any provider's response shape. */
export function readUsageTokens(data: unknown): { inputTokens: number; outputTokens: number } {
  const d = (data ?? {}) as Record<string, unknown>;
  const gem = d["usageMetadata"] as Record<string, unknown> | undefined;
  if (gem) {
    return {
      inputTokens: int(gem["promptTokenCount"]),
      outputTokens: int(gem["candidatesTokenCount"]) + int(gem["thoughtsTokenCount"]),
    };
  }
  const oa = d["usage"] as Record<string, unknown> | undefined;
  if (oa) {
    return {
      inputTokens: int(oa["prompt_tokens"]) || int(oa["input_tokens"]),
      outputTokens: int(oa["completion_tokens"]) || int(oa["output_tokens"]),
    };
  }
  return { inputTokens: 0, outputTokens: 0 };
}
