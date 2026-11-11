import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchWebPage, WEB_FETCH_TIMEOUT_MS } from "./safe-web.server";
test("website fetching has the requested four-second timeout", () => assert.equal(WEB_FETCH_TIMEOUT_MS, 4000));
test("private destinations and redirect targets are not fetched", async () => {
  const original = globalThis.fetch;
  const visited: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    visited.push(String(input));
    return new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } });
  }) as typeof fetch;
  try {
    assert.equal(await fetchWebPage("https://127.0.0.1"), null);
    assert.equal(await fetchWebPage("https://public.example"), null);
    assert.deepEqual(visited, ["https://public.example"]);
  } finally { globalThis.fetch = original; }
});