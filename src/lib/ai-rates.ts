/**
 * Shared price list, used by both the server (when a call is recorded) and the
 * browser (when history is displayed), so a token always costs the same number
 * in every screen.
 *
 * Everything here is an estimate built from each provider's public price page —
 * it is not a bill.
 */

export type Rate = {
  label: string;
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1k characters (voice engines bill characters, not tokens). */
  perKChar?: number;
  free: boolean;
};

export const AI_RATES: Record<string, Rate> = {
  gemini: { label: "Gemini", input: 0, output: 0, free: true },
  "gemini-paid": { label: "Gemini (paid tier)", input: 0.3, output: 2.5, free: false },
  groq: { label: "Groq", input: 0, output: 0, free: true },
  cerebras: { label: "Cerebras", input: 0, output: 0, free: true },
  together: { label: "Together", input: 0, output: 0, free: true },
  mistral: { label: "Mistral", input: 0, output: 0, free: true },
  github: { label: "GitHub Models", input: 0, output: 0, free: true },
  openrouter: { label: "OpenRouter", input: 0.2, output: 0.8, free: false },
  openai: { label: "OpenAI", input: 0.15, output: 0.6, free: false },
  anthropic: { label: "Claude", input: 0.8, output: 4, free: false },
  deepseek: { label: "DeepSeek", input: 0.27, output: 1.1, free: false },
  moonshot: { label: "Kimi", input: 0.6, output: 2.5, free: false },
  xai: { label: "Grok", input: 0.3, output: 0.5, free: false },
  perplexity: { label: "Perplexity", input: 1, output: 1, free: false },
  cohere: { label: "Cohere", input: 0.15, output: 0.6, free: true },
  elevenlabs: { label: "ElevenLabs", input: 0, output: 0, perKChar: 0.15, free: false },
};

export function rateOf(provider: string): Rate {
  return AI_RATES[provider] ?? { label: provider, input: 0, output: 0, free: false };
}

/** Estimated dollars for one call. */
export function estimateCost(provider: string, inputTokens: number, outputTokens: number, chars = 0): number {
  const rate = rateOf(provider);
  const tokenCost = (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
  const charCost = chars > 0 && rate.perKChar ? (chars / 1000) * rate.perKChar : 0;
  return Number((tokenCost + charCost).toFixed(6));
}

export function isFreeProvider(provider: string): boolean {
  return rateOf(provider).free;
}
