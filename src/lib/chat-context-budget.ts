export const MAX_TOPIC_CHUNKS = 8;
export const SYSTEM_CONTEXT_CHARS = 24000;
/** Keep complete high-priority sections; bound individual archive excerpts only. */
export function budgetSections(sections: string[], limit = SYSTEM_CONTEXT_CHARS): string {
  const selected: string[] = [];
  let remaining = limit;
  for (const section of sections.filter(Boolean)) {
    const separator = selected.length ? 2 : 0;
    const available = remaining - separator;
    if (available <= 0) break;
    const text = section.length <= available ? section : section.slice(0, available);
    selected.push(text);
    remaining -= text.length + separator;
  }
  return selected.join("\n\n");
}