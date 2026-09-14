# Make the Core Brain Knowledge Graph readable

The graph currently renders every extracted concept from every mined video at
once, each with its full label. With real usage that is hundreds of nodes drawn
on top of each other — a wall of text instead of a map of knowledge. The plan
is progressive disclosure: start simple, reveal detail only when asked.

## Layered view instead of everything at once

- **Level 1 (default):** persona at the centre, projects orbiting, one node per
  mined video. No raw concepts. This is the view a creator recognizes: "my
  work".
- **Level 2:** tapping a video node (or an "Expand" button) reveals that
  video's concepts only — the rest of the graph stays clean. Tapping again, or
  pressing "Collapse", folds them back.
- **Concepts merged across videos:** the same topic found in 8 videos becomes
  ONE node with a count badge (e.g. "street vlogging ×8"), linked to all 8
  videos — not 8 duplicate labels.

## Labels that don't collide

- Labels hidden by default on concept nodes; they appear on hover/tap, on the
  currently expanded video, and automatically once you zoom in past a
  threshold.
- Video/project labels truncate to ~18 characters with the full title in the
  inspector.
- A light label-collision pass: when two labels would overlap, only the larger
  node's label draws.

## Performance and caps

- Cap total rendered nodes (e.g. 250); beyond that, least-connected concept
  nodes group into "+N more concepts" aggregate nodes per video. The inspector
  on an aggregate lists them all.
- Topic filter already exists — keep it, and make it also collapse everything
  outside the chosen topic.
- Pause the force simulation when the tab is hidden or the graph is idle.

## Small usability wins

- Node size reflects connection count so important hubs stand out visually.
- A short "What am I looking at?" hint line localized in English, Mongolian
  and Korean, replacing the current long description.
- Keep all existing powers: search, link mode, inspector, rename/delete,
  pinch/zoom, reset view.

## Technical notes

- All changes in `src/components/knowledge-graph.tsx` (rendering, layering,
  caps, label logic) and `src/lib/knowledge-graph.ts` (`buildGraph` merges
  duplicate concept keys — it mostly does via the `nodes` map already, but the
  per-video concept labels differ by casing/whitespace, so normalize with
  lowercase-trim before keying).
- `buildGraph` gains an `expandedVideoIds: Set<string>` parameter; nodes for
  collapsed videos emit only the video node, not its concepts.
- Aggregate "+N more" nodes get `kind: "concept"` with a `meta.aggregate`
  list so the inspector can render them without schema changes.
- No database changes. No changes to mining or data — purely how the graph is
  drawn.

## Verify

- With the master account's real data: default view shows only persona,
  projects, videos — readable at a glance.
- Expanding one video shows its concepts; collapsing restores the clean view.
- Duplicate topics merge into one node with a count.
- Type check passes; graph still works on a fresh persona with 0, 1, and many
  videos.
