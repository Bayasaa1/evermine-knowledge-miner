/**
 * Custom AI provider addresses must be public HTTPS hosts, so a saved key can
 * never make the server call into private or internal networks.
 */
export function isSafeEndpoint(raw: string | null | undefined): boolean {
  if (!raw) return true;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (!host.includes(".") && !host.includes(":")) return false;
  // IPv6 literals: block loopback, link-local, unique-local and mapped.
  if (host.includes(":")) {
    if (host === "::" || host === "::1" || /^(fe8|fe9|fea|feb|fc|fd)/.test(host) || host.startsWith("::ffff:")) return false;
    return true;
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }
  return true;
}
