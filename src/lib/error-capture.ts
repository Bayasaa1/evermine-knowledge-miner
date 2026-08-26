/**
 * Global error capture for the System Diagnostic Assistant.
 *
 * A single in-memory ring buffer collects every failure worth explaining:
 * failed uploads, bad video URLs, non-2xx network responses (4xx/5xx from
 * Gemini, server functions, or any fetch), and uncaught runtime errors.
 * The floating chat widget reads this buffer and hands it to Gemini as
 * diagnostic context, so the assistant always knows what just broke.
 */

export type CapturedError = {
  id: string;
  /** ISO timestamp of when the failure happened. */
  at: string;
  /** Where it happened: "analysis", "network", "upload", "app", … */
  source: string;
  /** Short human summary (usually the thrown message). */
  message: string;
  /** Stack trace or response-body snippet, when available. */
  detail?: string;
  /** HTTP status for network failures. */
  status?: number;
  /** Request URL for network failures. */
  url?: string;
};

const MAX_ERRORS = 25;
const SNIPPET = 600;

let errors: CapturedError[] = [];
const listeners = new Set<(entry: CapturedError) => void>();
let seq = 0;

export function getCapturedErrors(): CapturedError[] {
  return errors;
}

export function clearCapturedErrors(): void {
  errors = [];
}

/** Fires once per captured failure; used by the widget's unread badge. */
export function subscribeCapturedErrors(fn: (entry: CapturedError) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function describeThrowable(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  return typeof err === "string" ? err : JSON.stringify(err);
}

/** Explicitly record a failure (uploads, URL checks, mining, server fns). */
export function reportFailure(
  source: string,
  err: unknown,
  extra?: { status?: number; url?: string },
): CapturedError {
  const entry: CapturedError = {
    id: `err_${Date.now().toString(36)}_${(seq += 1)}`,
    at: new Date().toISOString(),
    source,
    message: describeThrowable(err).slice(0, 300),
    detail: err instanceof Error && err.stack ? err.stack.slice(0, SNIPPET) : undefined,
    status: extra?.status,
    url: extra?.url,
  };
  errors = [...errors.slice(-(MAX_ERRORS - 1)), entry];
  listeners.forEach((fn) => {
    try {
      fn(entry);
    } catch {
      /* listener bug must never break the app */
    }
  });
  return entry;
}

const SKIP_HEADER = "x-evermine-skip-capture";

/** Marks a request (e.g. the assistant's own Gemini call) so it is never captured. */
export function skipCaptureHeader(): Record<string, string> {
  return { [SKIP_HEADER]: "1" };
}

let installed = false;

/**
 * Installs window-level interceptors once: fetch status capture, window.onerror
 * and unhandledrejection. Safe to call repeatedly; returns an uninstaller.
 */
export function installGlobalErrorInterceptors(): () => void {
  if (typeof window === "undefined" || installed) return () => undefined;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await originalFetch(input, init);
    try {
      if (res.ok) return res;
      const headers = new Headers(init?.headers);
      if (headers.get(SKIP_HEADER)) return res;
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const snippet = await res
        .clone()
        .text()
        .then((body) => body.slice(0, SNIPPET))
        .catch(() => "");
      reportFailure("network", new Error(`HTTP ${res.status} ${res.statusText}`.trim()), {
        status: res.status,
        url,
        ...(snippet ? {} : {}),
      });
      // Attach the response body as detail via a second entry update is overkill;
      // fold it into the latest entry instead.
      if (snippet) {
        const last = errors[errors.length - 1];
        if (last) last.detail = snippet;
      }
    } catch {
      /* capture must never break requests */
    }
    return res;
  };

  const onError = (event: ErrorEvent) => {
    reportFailure("app", event.error ?? new Error(event.message || "Unknown runtime error"));
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportFailure("app", event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    installed = false;
    window.fetch = originalFetch;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
