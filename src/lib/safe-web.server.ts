import { isSafeEndpoint } from './safe-endpoint';
export const WEB_FETCH_TIMEOUT_MS = 4000;
const MAX_BYTES = 600_000;
/** Every redirect is checked; no caller cookies/credentials are forwarded. */
export async function fetchWebPage(url: string): Promise<{ title: string; body: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_FETCH_TIMEOUT_MS);
  try {
    let current = url;
    for (let redirect = 0; redirect <= 3; redirect++) {
      if (!isSafeEndpoint(current)) return null;
      const response = await fetch(current, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'text/html,application/xhtml+xml' } });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) return null;
        current = new URL(location, current).toString(); continue;
      }
      if (!response.ok || !/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel(); return null; }
      const reader = response.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder(); let raw = ''; let bytes = 0;
      try {
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.length;
          if (bytes > MAX_BYTES) { await reader.cancel(); return null; }
          raw += decoder.decode(chunk.value, { stream: true });
        }
        raw += decoder.decode();
      } finally { reader.releaseLock(); }
      const decode = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const title = decode(raw.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)?.[1] ?? '').trim();
      const body = decode(raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 3500);
      return body ? { title, body } : null;
    }
    return null;
  } catch { return null; } finally { clearTimeout(timer); }
}
