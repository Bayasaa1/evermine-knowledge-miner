/**
 * Per-request access to the Worker's ExecutionContext, so a route can hand a
 * long background promise to ctx.waitUntil and still answer immediately.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type Ctx = { waitUntil?: (p: Promise<unknown>) => void };
export const workerContext = new AsyncLocalStorage<Ctx | undefined>();

/** Keep `promise` alive after the response is sent (no-op outside Workers). */
export function keepAlive(promise: Promise<unknown>): void {
  const ctx = workerContext.getStore();
  try {
    ctx?.waitUntil?.(promise);
  } catch {
    /* the floating promise still runs in Node dev */
  }
}
