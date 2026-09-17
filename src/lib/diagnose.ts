/**
 * Smart error diagnostics. Takes a raw developer log / thrown error and asks
 * the AI assigned to Chatting to rewrite it as a plain-language problem
 * statement plus concrete step-by-step fix, in the creator's active language.
 * Always resolves — if Gemini itself is unreachable we fall back to a local
 * localized explanation so the UI never shows a raw log line.
 */
import { describeError } from "@/lib/gemini";
import { tr, type Lang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-fetch";


export type Diagnosis = {
  problem: string;
  steps: string[];
  /** Raw log kept for the advanced view; never shown by default. */
  raw: string;
};

import { LANGUAGES } from "@/lib/languages";
const LANG_NAME = new Proxy({} as Record<Lang, string>, {
  get: (_t, k: string) => LANGUAGES[k as Lang]?.name ?? "English",
});

function fallback(lang: Lang, errorKey: string, raw: string): Diagnosis {
  return {
    problem: tr(lang, errorKey),
    steps: [tr(lang, "diagFallbackStep")],
    raw,
  };
}

export async function diagnoseError(opts: {
  error: unknown;
  errorKey: string;
  lang: Lang;
  apiKey?: string | undefined;
  context: string;
  signal?: AbortSignal;
}): Promise<Diagnosis> {
  const raw = describeError(opts.error);
  return backendDiagnosis(opts.lang, opts.errorKey, raw, opts.context, opts.signal);
}

/**
 * Zero-setup diagnosis through the app's own backend assistant. Used when the
 * account has neither a pasted key nor a usable Google session, so the creator
 * still gets a plain-language explanation instead of a raw log line.
 */
async function backendDiagnosis(
  lang: Lang,
  errorKey: string,
  raw: string,
  context: string,
  signal?: AbortSignal,
): Promise<Diagnosis> {
  try {
    const res = await apiFetch("/api/diagnose-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(signal ? { signal } : {}),
      body: JSON.stringify({
        system: `You are the in-app support assistant for Evermind. Reply in ${LANG_NAME[lang]} only, as strict JSON: {"problem":"one or two short sentences","steps":["short imperative step"]}. 2-4 steps, no jargon, no stack traces.`,
        messages: [{ role: "user", text: `Context: ${context}\nRaw developer log:\n${raw.slice(0, 4000)}` }],
      }),
    });
    if (!res.ok) return fallback(lang, errorKey, raw);
    const data = (await res.json()) as { text?: string };
    const parsed = JSON.parse((data.text ?? "").replace(/^```(?:json)?|```$/g, "").trim());
    const problem =
      typeof parsed?.problem === "string" && parsed.problem.trim() ? parsed.problem.trim() : tr(lang, errorKey);
    const steps = Array.isArray(parsed?.steps)
      ? parsed.steps.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 4)
      : [];
    return { problem, steps: steps.length ? steps : [tr(lang, "diagFallbackStep")], raw };
  } catch {
    return fallback(lang, errorKey, raw);
  }
}
