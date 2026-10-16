/** Screen-only Google translation. No AI keys, storage writes or mined data. */
type Job = { text: string; target: string; resolve: (text: string) => void; reject: (error: Error) => void };
const queue: Job[] = [];
const cache = new Map<string, Promise<string>>();
let running = false;

async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const first = queue[0];
    if (!first) break;
    const jobs: Job[] = [];
    let length = 0;
    while (queue[0]?.target === first.target && jobs.length < 8) {
      const next = queue[0];
      if (!next || (jobs.length && length + next.text.length > 2400)) break;
      queue.shift(); jobs.push(next); length += next.text.length;
    }
    try {
      const url = new URL('https://clients5.google.com/translate_a/t');
      url.searchParams.set('client', 'dict-chrome-ex');
      url.searchParams.set('sl', 'auto');
      url.searchParams.set('tl', first.target);
      jobs.forEach((job) => url.searchParams.append('q', job.text));
      const response = await fetch(url);
      if (!response.ok) throw new Error('Translation unavailable');
      const result: unknown = await response.json();
      if (!Array.isArray(result) || result.length !== jobs.length) throw new Error('Invalid translation');
      jobs.forEach((job, i) => {
        const row: unknown = result[i];
        const text = Array.isArray(row) ? row[0] : row;
        if (typeof text !== 'string' || !text.trim()) job.reject(new Error('Empty translation'));
        else job.resolve(text);
      });
    } catch (error) {
      jobs.forEach((job) => job.reject(error instanceof Error ? error : new Error('Translation unavailable')));
    }
  }
  running = false;
}

function translatePart(text: string, target: string): Promise<string> {
  return new Promise((resolve, reject) => {
    queue.push({ text, target, resolve, reject });
    queueMicrotask(() => void drain());
  });
}

export function translateChatDisplay(text: string, target: string, owner: string): Promise<string> {
  const key = JSON.stringify([owner, target, text]);
  const hit = cache.get(key);
  if (hit) return hit;
  // Code, link destinations, URLs and proof markers are never sent for translation.
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`|\]\([^\n)]*\)|https?:\/\/[^\s]+|\[\[(?:yt|clip):[^\]]+\]\])/g);
  const promise = Promise.all(parts.map(async (part, i) => {
    if (i % 2 || !part.trim()) return part;
    const chunks = part.match(/[\s\S]{1,1800}(?:\s|$)|[\s\S]{1,1800}/g) ?? [];
    return (await Promise.all(chunks.map((chunk) => translatePart(chunk, target)))).join('');
  })).then((translated) => translated.join('')).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, promise);
  return promise;
}