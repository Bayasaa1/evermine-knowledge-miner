# Core Brain Knowledge Graph: built for 1000 videos, one project at a time

Today the graph loads one persona's entire world at once — every project, every
mined video and every extracted concept — and draws them all with labels. At
your current size it is already unreadable. At 1000 videos it would not just
look bad, it would freeze the page: every video's content row, every vault
payload and every concept is fetched and simulated on each render.

The fix is structural, not cosmetic.

## 1. The project is the unit, never the creator

Confirmed in the code: the graph is mounted with a persona, and `buildGraph`
puts the persona at the centre with all projects orbiting it. That is exactly
the mixing you described — two unrelated projects share one canvas and their
concepts merge into the same nodes.

Change:

- The graph is opened **inside a project**. One project = one graph = one
  knowledge space. Nothing from another project can ever appear in it.
- The project sits at the centre; its videos orbit it; concepts belong to that
  project only. Concept merging happens **within** a project, never across.
- The persona level gets a different, much simpler view: a small overview of
  projects as cards with counts ("Cooking — 412 videos, 1,830 concepts"), each
  opening its own graph. No mega-canvas.
- Custom links stay allowed only between nodes of the same project.

## 2. Built for 1000 videos

At that size you cannot draw everything, and you should not load everything.

- **Paged loading.** The graph loads the project's videos in pages, newest
  first, plus counts — not all rows at once. Concepts load only for the video
  you open.
- **Three zoom levels**, like a map:
  - *Project* — clusters by topic: "street vlogging (312)", "cooking (88)".
    Tens of nodes, not thousands.
  - *Cluster* — open a cluster to see its videos.
  - *Video* — open a video to see its own concepts, lessons and emotions.
  Each level replaces the previous, so the canvas never exceeds a few hundred
  nodes regardless of library size.
- **Hard render cap** (~300 nodes). Anything beyond becomes a "+N more" node
  that opens a searchable list panel.
- **Search is the real navigation** at this scale: typing jumps straight to
  matching videos or concepts and focuses the camera on them, rather than
  asking you to find a dot.

## 3. Manage and edit everything, not just look at it

A 1000-video library needs a list as much as a picture.

- A **table view** beside the graph: every video in the project with title,
  date, status, topic, kind (feed/training) and concept count. Sortable,
  searchable, filterable.
- **Multi-select and bulk actions**: move to another project, switch
  feed/training, re-mine, delete. Today these are one at a time.
- The graph and the table are two views of the same selection — select in one,
  act in the other.
- The node inspector keeps rename, reconnect, delete and raw payload.

## 4. How other tools solve this

Approaches worth copying, each already proven:

- **Obsidian** ships a "local graph" (one note plus its neighbours) precisely
  because the global graph stops being useful past a few hundred notes. Our
  per-project + per-video expansion is the same idea.
- **Maps** (Google/Mapbox) use zoom levels and tiles: you never load the whole
  planet, only the detail for the current view. That is our three levels.
- **Figma / Miro** use level-of-detail: labels and fine geometry only render
  past a zoom threshold, and off-screen items are skipped entirely.
- **Gephi / large graph tools** rely on community clustering — group first,
  expand later — which is our topic-cluster layer.
- **Notion / Airtable** prove the other half: at scale, people manage through a
  filterable table and use the visual view for insight, not for work.

## 5. Existing Core Brains keep working

Nothing you have mined is thrown away or re-mined.

- Concepts are re-derived from the data you already have (`project_content`
  tags, timeline, emotion timeline, and vault `.json.md` payloads) — the same
  sources used today, so old brains appear in the new view immediately.
- Older content rows without a project are gathered into a clearly labelled
  "Unsorted" project so they remain visible and can be moved in bulk.
- Concept names are normalized (lowercase, trimmed) when grouping, so the same
  topic written differently across old videos merges into one node instead of
  several near-duplicates. Your stored data is not rewritten; only the grouping
  is normalized at read time.
- Custom links you drew earlier are preserved; any link that crossed two
  projects is kept but shown only in the overview, with a note.

## 6. Where the new work lives

- **Cluster counts and concept indexes are computed and stored**, not
  recalculated on every page open. A new table holds one row per
  (project, concept) with its count and the videos it appears in, written when
  a mining job finishes and rebuilt on demand from existing data for old
  projects. This is what makes 1000 videos open instantly.
- Heavy grouping runs **server-side** in a server function, so the browser
  receives a few hundred summarised nodes rather than megabytes of payloads.
- Nothing is duplicated that can be derived cheaply; the index is a cache with
  a "rebuild" action.

## Technical notes

- New migration: `public.project_concepts` (`project_id`, `user_id`,
  `concept` normalized, `label` display, `kind`, `count`, `content_ids uuid[]`,
  timestamps), unique on `(project_id, concept)`, owner-scoped RLS plus GRANTs
  for `authenticated`/`service_role`. Written from `finalize-job.server.ts`
  after a job completes; a `rebuildProjectConcepts` server function backfills
  existing projects from `project_content` + `mind_vaults`.
- `src/lib/knowledge-graph.ts`: `buildGraph` becomes project-scoped with a
  `level` (`project` | `cluster` | `video`) and an `openKey`; concept keys
  normalized with lowercase-trim; emits at most `MAX_NODES` with aggregate
  overflow nodes.
- `src/lib/knowledge-graph.functions.ts` (new): authenticated server functions
  for cluster summaries, paged video lists and per-video concepts.
- `src/components/knowledge-graph.tsx`: project prop instead of persona,
  breadcrumb for the current level, level-of-detail labels (hidden until hover
  or zoom threshold), collision-aware label pass, node size by degree,
  simulation paused when hidden, camera-focus on search hit.
- `src/components/project-graph-overview.tsx` (new): persona-level project
  cards with counts.
- `src/components/project-content-table.tsx` (new): the manage/bulk-edit table.
- `src/components/vault-hub.tsx`: mounts the overview at persona level and the
  graph inside a project.
- All new copy localized in English, Mongolian and Korean.
- `roadmap.md` gains this work as a tracked item.

## Verify

- Open a project with your real data: readable at a glance, clusters not a wall
  of text; opening a cluster, then a video, works and goes back.
- Two projects never show each other's videos or concepts.
- Seeded load of ~1000 content rows: first paint stays fast, node count stays
  capped, search still finds items.
- An old project with no stored index rebuilds and renders correctly.
- Bulk move / feed-training switch / delete work on a multi-selection.
- Type check passes; owner-scoped security check on the new table.
