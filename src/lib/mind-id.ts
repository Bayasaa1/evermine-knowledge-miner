/** Preset slugs are not database UUIDs. */
export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
export function mindDatabaseId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const raw = id.replace(/^(project|persona):/, "");
  return isValidUuid(raw) ? raw : null;
}