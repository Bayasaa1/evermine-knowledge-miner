// Single source of truth for Gemini model choices.
// Free tier only by default — paid models are never selected automatically.
export const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_PAID_MODEL = "gemini-3.8-flash";

/**
 * Free models tried in order when one model's capacity pool is congested
 * (503 / 429). Capacity and free-tier availability are not guaranteed.
 */
export const GEMINI_CONGESTION_CASCADE = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

/** Models to try after `current`, never repeating it. */
export function geminiCascadeAfter(current: string): string[] {
  const index = GEMINI_CONGESTION_CASCADE.findIndex((m) => m === current);
  return GEMINI_CONGESTION_CASCADE.slice(index + 1);
}

/** 503 overload / 429 rate-limit: another model may succeed right away. */
export function isGeminiCongestionError(status: number | undefined, message?: string | null): boolean {
  if (status !== undefined) return status === 429 || status === 503 || status === 500 || status === 502 || status === 504;
  return /resource_exhausted|unavailable|overloaded|high demand|rate limit|too many requests/i.test(message ?? "");
}

// Google returns this when a model is retired for the key's user tier.
// It is permanent — retrying only burns quota.
export function isGeminiModelRetiredError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("no longer available") || m.includes("is not found for api version") || (m.includes("404") && m.includes("models/"));
}
