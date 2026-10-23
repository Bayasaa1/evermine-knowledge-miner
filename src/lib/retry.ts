/**
 * Network resilience for long mining runs and AI provider calls.
 *
 * Mining checkpoints live on the server, so a dropped connection is never data
 * loss — it only interrupts the live view. We reconnect automatically every
 * 10 seconds, up to 3 times, before surfacing the error to the creator.
 */

const RETRY_DELAY_MS = 10_000;
const MAX_RETRIES = 3;

/** True for transient connectivity failures (offline, fetch abort by network, 5xx/timeouts). */
export function isNetworkError(err: unknown): boolean {
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /network|failed to fetch|load failed|timeout|timed out|econn|socket|502|503|504|fetch error/i.test(
    message,
  );
}

/** Reads an HTTP status from an error object (`.status`) or its "HTTP 503" message. */
export function httpStatusOf(err: unknown): number | null {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status;
  const message = err instanceof Error ? err.message : String(err ?? "");
  const match = /\bHTTP (\d{3})\b/.exec(message);
  return match ? Number(match[1]) : null;
}

/** Upstream server trouble (500/502/503/504): the key is fine, retry the same key. */
export function isServerBusyStatus(status: number | null): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Retries `run` with exponential backoff while `shouldRetry` says the failure
 * is transient. Defaults: 2 retries after 1s and 2s (doubling).
 */
export async function withBackoff<T>(
  run: () => Promise<T>,
  shouldRetry: (err: unknown) => boolean,
  opts: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const baseMs = opts.baseMs ?? 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseMs * 2 ** attempt));
    }
  }
}

export async function withNetworkRetry<T>(
  run: () => Promise<T>,
  opts: { retries?: number; delayMs?: number; onRetry?: (attempt: number, err: unknown) => void } = {},
): Promise<T> {
  const retries = opts.retries ?? MAX_RETRIES;
  const delayMs = opts.delayMs ?? RETRY_DELAY_MS;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err) || attempt === retries) throw err;
      opts.onRetry?.(attempt + 1, err);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
