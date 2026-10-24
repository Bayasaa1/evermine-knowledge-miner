export function commentForest<T extends { id: string; parent_id: string | null }>(rows: T[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const row of rows) {
    // Missing or self-referencing parents fall back to the root, so no reply is ever dropped.
    if (row.parent_id && row.parent_id !== row.id && byId.has(row.parent_id)) {
      const siblings = children.get(row.parent_id) ?? [];
      siblings.push(row);
      children.set(row.parent_id, siblings);
    } else roots.push(row);
  }
  return { roots, children };
}