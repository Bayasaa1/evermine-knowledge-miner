/**
 * Deterministic detection of Architect chat commands (no AI call). Keys are
 * recognised by shape and are never echoed back unmasked.
 */
export type ChatCommand =
  | { kind: "api_key"; provider: "gemini" | "openai" | "anthropic" | "groq" | "openrouter" | "deepseek"; key: string; masked: string }
  | { kind: "youtube"; urls: string[] }
  | { kind: "remine_all" }
  | { kind: "role_split" }
  | { kind: "mining_rules"; rules: string };

const KEY_SHAPES: [ChatCommand & { kind: "api_key" } extends infer K ? K extends { provider: infer P } ? P : never : never, RegExp][] = [
  ["anthropic", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ["openrouter", /\bsk-or-v1-[A-Za-z0-9]{20,}\b/],
  ["openai", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ["gemini", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["groq", /\bgsk_[A-Za-z0-9]{20,}\b/],
];

export const maskKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

/** Replaces every recognised key in text with its masked form. */
export function redactKeys(text: string): string {
  let out = text;
  for (const [, re] of KEY_SHAPES) out = out.replace(new RegExp(re.source, "g"), (m) => maskKey(m));
  return out;
}

const YT = /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|live\/|playlist\?[^\s]*list=)|youtu\.be\/)[^\s<>"']+/gi;

export function detectChatCommand(text: string): ChatCommand | undefined {
  for (const [provider, re] of KEY_SHAPES) {
    const m = text.match(re);
    if (m) return { kind: "api_key", provider, key: m[0], masked: maskKey(m[0]) };
  }
  const urls = [...new Set(text.match(YT) ?? [])].slice(0, 10);
  if (urls.length) return { kind: "youtube", urls };
  if (/\bre-?mine\b|дахин\s*(mine|олборл|майн)|다시\s*마이닝|재마이닝/i.test(text)) return { kind: "remine_all" };
  if (/\b(split|assign)\b.*\b(keys?|api)\b|\b(keys?|api)\b.*\b(split|assign|roles?)\b|(api|түлхүүр).*(хуваар|үүрэг)|키.*(분배|역할)/i.test(text)) return { kind: "role_split" };
  const rule = text.match(/^(?:mining rules?|mine rules?|олборлох заавар|олборлолтын заавар|마이닝 규칙)\s*[:：-]\s*([\s\S]{3,})$/i);
  if (rule) return { kind: "mining_rules", rules: rule[1]!.trim().slice(0, 1500) };
  return undefined;
}

/** Same plan as the API page's Smart split: live jobs keep their own keys, background jobs share the rest. */
export function smartSplitPlan(ids: string[]): [string, string[]][] | null {
  if (ids.length < 2) return null;
  const live = Math.min(3, ids.length - 1);
  const id = (i: number) => ids[i % live]!;
  const bg = ids.slice(live);
  return [["chat", [id(0)]], ["assistant", [id(1)]], ["translate", [id(2)]], ["mine", bg], ["mine_write", bg], ["core_brain", bg]];
}
