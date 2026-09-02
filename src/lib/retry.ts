/**
 * Network resilience for long mining runs.
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
