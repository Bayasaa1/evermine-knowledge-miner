// Single source of truth for Gemini model choices.
// Free tier only by default — paid models are never selected automatically.
export const GEMINI_DEFAULT_MODEL = "gemini-3.1-flash-lite";
export const GEMINI_PAID_MODEL = "gemini-3.8-flash";

// Google returns this when a model is retired for the key's user tier.
// It is permanent — retrying only burns quota.
export function isGeminiModelRetiredError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("no longer available") || m.includes("is not found for api version") || (m.includes("404") && m.includes("models/"));
}
