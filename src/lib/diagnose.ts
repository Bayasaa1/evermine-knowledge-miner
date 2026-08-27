/**
 * Gemini-powered smart error diagnostics. Takes a raw developer log / thrown
 * error and asks Gemini Flash to rewrite it as a plain-language problem
 * statement plus concrete step-by-step fix, in the creator's active language.
 * Always resolves — if Gemini itself is unreachable we fall back to a local
 * localized explanation so the UI never shows a raw log line.
 */
import { describeError } from "@/lib/gemini";
import { getGeminiAccessToken } from "@/lib/google-gemini-auth";
import { tr, type Lang } from "@/lib/i18n";
import { apiFetch } from "@/lib/api-fetch";

const BASE = "https://generativelanguage.googleapis.com";
const DIAG_MODEL = "gemini-2.5-flash";

export type Diagnosis = {
  problem: string;
  steps: string[];
  /** Raw log kept for the advanced view; never shown by default. */
  raw: string;
};

const LANG_NAME: Record<Lang, string> = { en: "English", mn: "Mongolian (Cyrillic)" };

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
  // Unified auth: a pasted key, the active Google OAuth session, or (as a last
  // resort) the built-in backend assistant. Never bail out just for a missing key.
  const token = await getGeminiAccessToken();
  if (!opts.apiKey && !token) return backendDiagnosis(opts.lang, opts.errorKey, raw, opts.context, opts.signal);

  const prompt = [
    `You are the in-app support assistant for Evermine, a tool where creators mine knowledge from their videos.`,
    `A step failed. Context: ${opts.context}.`,
    `Raw developer log:\n"""\n${raw.slice(0, 4000)}\n"""`,
    `Explain it to a non-technical creator in ${LANG_NAME[opts.lang]}.`,
    `Never mention stack traces, HTTP jargon, code, or "check the log".`,
    `Reply as strict JSON only: {"problem": "one or two short sentences", "steps": ["short imperative step", "..."]}`,
    `Give 2-4 steps, each actionable inside this app (fix the link, use a public video, add or swap the API key, retry later, use a smaller file).`,
  ].join("\n");

  try {
    const res = await fetch(
      token
        ? `${BASE}/v1/models/${DIAG_MODEL}:generateContent`
        : `${BASE}/v1/models/${DIAG_MODEL}:generateContent?key=${encodeURIComponent(opts.apiKey!)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(opts.signal ? { signal: opts.signal } : {}),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) return backendDiagnosis(opts.lang, opts.errorKey, raw, opts.context, opts.signal);
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    const parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
    const problem = typeof parsed?.problem === "string" && parsed.problem.trim() ? parsed.problem.trim() : tr(opts.lang, opts.errorKey);
    const steps = Array.isArray(parsed?.steps)
      ? parsed.steps.filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 4)
      : [];
    return { problem, steps: steps.length ? steps : [tr(opts.lang, "diagFallbackStep")], raw };
  } catch {
    return backendDiagnosis(opts.lang, opts.errorKey, raw, opts.context, opts.signal);
  }
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
        system: `You are the in-app support assistant for Evermine. Reply in ${LANG_NAME[lang]} only, as strict JSON: {"problem":"one or two short sentences","steps":["short imperative step"]}. 2-4 steps, no jargon, no stack traces.`,
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
