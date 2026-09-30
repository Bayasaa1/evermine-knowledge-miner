import type { PrimaryEmotion } from "@/lib/gemini";

/**
 * Runtime emotion engine for the live avatar.
 *
 * Turns a reply (and, when available, the mined emotion timeline of the mind)
 * into an active emotion tag that drives both the avatar's facial expression
 * and the voice engine's pitch/tone.
 */
export type AvatarEmotion = {
  primary_emotion: PrimaryEmotion;
  /** 0.0 - 1.0 */
  expression_intensity: number;
  facial_trigger: string;
  vocal_tone_marker: string;
};

export const NEUTRAL_EMOTION: AvatarEmotion = {
  primary_emotion: "NEUTRAL",
  expression_intensity: 0.25,
  facial_trigger: "Neutral_Face",
  vocal_tone_marker: "Flat_Even",
};

const RULES: {
  emotion: PrimaryEmotion;
  facial: string;
  vocal: string;
  weight: number;
  test: RegExp;
}[] = [
  {
    emotion: "EXCITED",
    facial: "Eyebrow_Raise",
    vocal: "Passionate",
    weight: 0.9,
    test: /!{1,}|\bwow\b|\bamazing\b|\bincredible\b|\blet'?s go\b|\bcan'?t wait\b|\bhuge\b|гайхал|шал|яг тийм|маш сайн|баяр хүргэе/i,
  },
  {
    emotion: "HAPPY",
    facial: "Smile",
    vocal: "High_Pitch",
    weight: 0.7,
    test: /\b(haha|lol|funny|great|love|happy|glad|nice|thank you|thanks|welcome|congrats)\b|😊|😄|😁|инээ|баяртай байна|гоё|сайхан|баярлалаа/i,
  },
  {
    emotion: "SAD",
    facial: "Frown",
    vocal: "Low_Calm",
    weight: 0.8,
    test: /\b(sad|sorry|unfortunately|lost|died|passed away|painful|hurts|miss(ed)? (you|them|him|her))\b|уучлаарай|харамсалтай|гунигтай|өвдөж/i,
  },
  {
    emotion: "EMPATHETIC",
    facial: "Nod",
    vocal: "Soft_Warm",
    weight: 0.75,
    test: /\b(i understand|i hear you|that must be|it'?s okay|take your time|you'?re not alone|i'?m here)\b|ойлгож байна|санаа зоволтгүй|зүгээр ээ/i,
  },
  {
    emotion: "SERIOUS",
    facial: "Neutral_Face",
    vocal: "Low_Calm",
    weight: 0.6,
    test: /\b(important|careful|warning|danger|must|never|risk|safety|rule|critical)\b|\?$|чухал|болгоомжтой|аюул|заавал/i,
  },
];

/** Infer the emotion the avatar should perform for a given reply. */
export function inferEmotion(text: string, tone?: string): AvatarEmotion {
  const source = `${text}\n${tone ?? ""}`.trim();
  if (!source) return NEUTRAL_EMOTION;

  let best: AvatarEmotion | null = null;
  let bestWeight = 0;
  for (const rule of RULES) {
    if (!rule.test.test(source)) continue;
    if (rule.weight <= bestWeight) continue;
    bestWeight = rule.weight;
    best = {
      primary_emotion: rule.emotion,
      expression_intensity: rule.weight,
      facial_trigger: rule.facial,
      vocal_tone_marker: rule.vocal,
    };
  }
  if (!best) return NEUTRAL_EMOTION;

  // Louder punctuation and longer emotive replies raise the intensity a little.
  const exclamations = (text.match(/!/g) ?? []).length;
  const intensity = Math.min(1, best.expression_intensity + Math.min(0.2, exclamations * 0.07));
  return { ...best, expression_intensity: Number(intensity.toFixed(2)) };
}

export const EMOTION_LABEL: Record<PrimaryEmotion, { en: string; mn: string }> = {
  HAPPY: { en: "Happy", mn: "Баяртай" },
  EXCITED: { en: "Excited", mn: "Догдолсон" },
  SERIOUS: { en: "Serious", mn: "Нухацтай" },
  SAD: { en: "Sad", mn: "Гунигтай" },
  EMPATHETIC: { en: "Empathetic", mn: "Энэрэнгүй" },
  NEUTRAL: { en: "Neutral", mn: "Төвийг сахисан" },
};

/** Visual style the avatar takes on for an emotion. */
export type EmotionStyle = {
  /** Ring / glow colour tokens. */
  ring: string;
  glow: string;
  /** Mouth curve in px — positive smiles, negative frowns. */
  mouthCurve: number;
  /** Eyebrow lift in px. */
  browLift: number;
  /** Subtle scale applied to the avatar. */
  scale: number;
};

export function emotionStyle(e: AvatarEmotion): EmotionStyle {
  const i = Math.max(0, Math.min(1, e.expression_intensity));
  switch (e.primary_emotion) {
    case "HAPPY":
      return { ring: "ring-primary/70", glow: "hsl(var(--primary) / 0.55)", mouthCurve: 6 * i, browLift: 1.5 * i, scale: 1 + 0.02 * i };
    case "EXCITED":
      return { ring: "ring-primary", glow: "hsl(var(--primary) / 0.75)", mouthCurve: 9 * i, browLift: 3.5 * i, scale: 1 + 0.04 * i };
    case "AMUSED":
      return { ring: "ring-primary/60", glow: "hsl(var(--primary) / 0.5)", mouthCurve: 7.5 * i, browLift: 2.5 * i, scale: 1 + 0.015 * i };
    case "PROUD":
      return { ring: "ring-primary/80", glow: "hsl(var(--primary) / 0.6)", mouthCurve: 4 * i, browLift: 2 * i, scale: 1 + 0.03 * i };
    case "CONFIDENT":
      return { ring: "ring-primary/60", glow: "hsl(var(--primary) / 0.45)", mouthCurve: 3 * i, browLift: 1 * i, scale: 1 + 0.02 * i };
    case "SURPRISED":
      return { ring: "ring-accent", glow: "hsl(var(--accent) / 0.6)", mouthCurve: 2 * i, browLift: 5 * i, scale: 1 + 0.035 * i };
    case "CURIOUS":
      return { ring: "ring-accent/70", glow: "hsl(var(--accent) / 0.5)", mouthCurve: 2 * i, browLift: 3 * i, scale: 1 + 0.01 * i };
    case "PONDERING":
      return { ring: "ring-muted-foreground/40", glow: "hsl(var(--muted-foreground) / 0.3)", mouthCurve: -1 * i, browLift: 1.5 * i, scale: 1 };
    case "SAD":
      return { ring: "ring-muted-foreground/50", glow: "hsl(var(--muted-foreground) / 0.35)", mouthCurve: -6 * i, browLift: -2 * i, scale: 1 - 0.02 * i };
    case "NERVOUS":
      return { ring: "ring-muted-foreground/60", glow: "hsl(var(--muted-foreground) / 0.4)", mouthCurve: -2 * i, browLift: 2.5 * i, scale: 1 - 0.01 * i };
    case "ANGRY":
      return { ring: "ring-destructive", glow: "hsl(var(--destructive) / 0.6)", mouthCurve: -7 * i, browLift: -4 * i, scale: 1 + 0.02 * i };
    case "FRUSTRATED":
      return { ring: "ring-destructive/70", glow: "hsl(var(--destructive) / 0.4)", mouthCurve: -4.5 * i, browLift: -3 * i, scale: 1 };
    case "EMPATHETIC":
      return { ring: "ring-accent/70", glow: "hsl(var(--accent) / 0.45)", mouthCurve: 2.5 * i, browLift: -1 * i, scale: 1 };
    case "CALM":
      return { ring: "ring-accent/50", glow: "hsl(var(--accent) / 0.3)", mouthCurve: 1.5 * i, browLift: -0.5 * i, scale: 1 };
    case "SERIOUS":
      return { ring: "ring-foreground/40", glow: "hsl(var(--foreground) / 0.25)", mouthCurve: -1.5 * i, browLift: -0.5 * i, scale: 1 };
    default:
      return { ring: "ring-border", glow: "hsl(var(--primary) / 0.25)", mouthCurve: 0, browLift: 0, scale: 1 };
  }
}

/** Voice-engine hints derived from the active emotion. */
export function emotionVoiceHints(e: AvatarEmotion): { speedDelta: number; instruction: string } {
  const i = Math.max(0, Math.min(1, e.expression_intensity));
  const map: Record<PrimaryEmotion, { speedDelta: number; instruction: string }> = {
    HAPPY: { speedDelta: 0.06 * i, instruction: "Lift the pitch slightly and let a warm smile colour the voice." },
    EXCITED: { speedDelta: 0.12 * i, instruction: "Raise the pitch and energy, speak faster and with clear enthusiasm." },
    SERIOUS: { speedDelta: -0.04 * i, instruction: "Lower the pitch, steady and measured, no smile in the voice." },
    SAD: { speedDelta: -0.1 * i, instruction: "Lower and soften the pitch, slower, quieter, with gentle heaviness." },
    EMPATHETIC: { speedDelta: -0.06 * i, instruction: "Soften and warm the voice, slower and caring, as if comforting someone." },
    NEUTRAL: { speedDelta: 0, instruction: "Keep an even, natural delivery." },
    CONFIDENT: { speedDelta: 0.02 * i, instruction: "Speak with settled certainty, firm and unhurried, no hedging." },
    AMUSED: { speedDelta: 0.08 * i, instruction: "Let laughter sit just under the words, playful and teasing." },
    PROUD: { speedDelta: 0.03 * i, instruction: "Warm and full-chested, savouring the words a little." },
    CURIOUS: { speedDelta: 0.04 * i, instruction: "Lift the ends of phrases, leaning in, genuinely interested." },
    PONDERING: { speedDelta: -0.08 * i, instruction: "Slow down, leave small thinking pauses between thoughts." },
    ANGRY: { speedDelta: 0.05 * i, instruction: "Harden and sharpen the voice, clipped words, more force." },
    FRUSTRATED: { speedDelta: -0.02 * i, instruction: "Tighten the voice with audible impatience, short exhales." },
    SURPRISED: { speedDelta: 0.1 * i, instruction: "Jump the pitch up sharply, breath caught, then recover." },
    NERVOUS: { speedDelta: 0.07 * i, instruction: "Lighter, slightly unsteady, quicker with small hesitations." },
    CALM: { speedDelta: -0.05 * i, instruction: "Low, smooth and relaxed, with easy breathing room." },
  };
  return map[e.primary_emotion];
}
