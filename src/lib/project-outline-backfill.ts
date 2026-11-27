import { z } from "zod";
import type { VideoOutline } from "./project-outline";

const evidence = z.object({ text: z.string().min(1), quote: z.string().min(12) });
export const backfillSchema = z.object({
  summary: z.string().min(1),
  readMeFirst: z.string(),
  prerequisites: z.array(evidence),
  guidelines: z.array(evidence),
  architecturalDecisions: z.array(evidence),
  mentalModels: z.array(evidence),
  troubleshooting: z.array(evidence),
  milestones: z.array(evidence),
  chapters: z.array(z.object({ title: z.string(), timestamp: z.string(), keywords: z.array(z.string()), quote: z.string().min(12) })),
  keywords: z.array(z.string()),
  mistakes: z.array(z.object({ timestamp: z.string(), mistake: z.string().min(1), cause: z.string(), fix: z.string().min(1), mistakeQuote: z.string().min(12), fixQuote: z.string().min(12) })),
  gotchas: z.array(evidence),
  recommendations: z.array(evidence),
  capabilities: z.array(evidence),
  limits: z.array(evidence),
});

/** Full string traversal, never a prefix/sample: source quotes must occur in saved evidence. */
export function sourceStrings(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(sourceStrings).join("\n");
  if (value && typeof value === "object") return Object.values(value).map(sourceStrings).join("\n");
  return "";
}

/** Lossless JSON partitioning; every serialized character is sent exactly once. */
export function partitionPayload(payload: string, size = 350000): string[] {
  const parts: string[] = [];
  for (let offset = 0; offset < payload.length; offset += size) parts.push(payload.slice(offset, offset + size));
  return parts;
}

export function mergeBackfillParts(parts: z.infer<typeof backfillSchema>[]): z.infer<typeof backfillSchema> {
  const first = parts[0];
  if (!first) throw new Error("No completed outline segments.");
  const merged = { ...first, summary: parts.map((p) => p.summary).join("\n"), readMeFirst: parts.map((p) => p.readMeFirst).join("\n") };
  const fields = ["prerequisites", "guidelines", "architecturalDecisions", "mentalModels", "troubleshooting", "milestones", "chapters", "keywords", "mistakes", "gotchas", "recommendations", "capabilities", "limits"] as const;
  for (const field of fields) {
    // Distinct fields have different element types; assigning through a record preserves the parsed arrays.
    (merged as unknown as Record<string, unknown>)[field] = [...new Map(parts.flatMap((p) => p[field] as unknown[]).map((v) => [JSON.stringify(v), v])).values()];
  }
  return merged;
}

export function groundedOutline(raw: unknown, payload: unknown, title: string) {
  const parsed = backfillSchema.parse(raw);
  const source = sourceStrings(payload);
  const verified = (quote: string) => source.includes(quote);
  const items = (xs: z.infer<typeof evidence>[]) => xs.filter((x) => verified(x.quote));
  const mistakes = parsed.mistakes.filter((m) => verified(m.mistakeQuote) && verified(m.fixQuote));
  const chapters = parsed.chapters.filter((c) => verified(c.quote));
  const grounded = {
    ...parsed, mistakes, chapters,
    prerequisites: items(parsed.prerequisites), guidelines: items(parsed.guidelines),
    architecturalDecisions: items(parsed.architecturalDecisions), mentalModels: items(parsed.mentalModels),
    troubleshooting: items(parsed.troubleshooting), milestones: items(parsed.milestones),
    gotchas: items(parsed.gotchas), recommendations: items(parsed.recommendations),
    capabilities: items(parsed.capabilities), limits: items(parsed.limits),
  };
  const keywords = [...new Set([...parsed.keywords, ...chapters.flatMap((c) => c.keywords)].map((s) => s.trim().toLowerCase()).filter(Boolean))];
  const video: VideoOutline = {
    title, summary: parsed.summary, keywords, mistakes,
    gotchas: grounded.gotchas.map((x) => x.text), recommendations: grounded.recommendations.map((x) => x.text),
    capabilities: grounded.capabilities.map((x) => x.text), limits: grounded.limits.map((x) => x.text),
  };
  return { ...video, readMeFirst: grounded.readMeFirst, chapters, evidence: grounded };
}