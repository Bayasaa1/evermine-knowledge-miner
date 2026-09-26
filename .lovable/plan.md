# "Where does this go?" — filing for unplaced videos

## Goal
Nothing mined ever sits hidden or unowned. The vault gets a clear "Needs filing" place that asks the creator where each unplaced video belongs.

## What exists today
- Unfiled projects (no persona) only appear inside a persona's vault view, with a "Move here" button that files the whole project into that one persona.
- Problems: you must open the right persona to even see them; whole projects move at once (no per-video choice); videos stuck under the wrong persona have no "send elsewhere" action.

## What to build

### 1. "Needs filing" section at the top of My Vaults
- A global list (not tied to one persona) of everything unplaced:
  - projects with no persona, and
  - videos whose project has no persona.
- Each row shows the video title, thumbnail, and when it was mined.
- Empty state: "Everything is filed." — the section disappears when there's nothing to file.

### 2. "File this…" picker on each unplaced item
Tap "File this…" → a small sheet asks two questions:
1. **Whose mind is this?** — pick a persona (or "New persona…").
2. **Which project?** — pick one of that persona's projects, or "New project…" (name field).

On confirm:
- the video (or whole unfiled project) is moved into the chosen persona + project,
- the now-empty one-video leftover project is removed,
- knowledge maps and project counts recalculate,
- a 10-second Undo is offered (same pattern as move/exclude/merge).

### 3. "Send to…" on already-filed videos
On any mined video (in a project's video list), add "Send to…" next to the existing actions — same picker as above — so a video filed under the wrong creator can be re-filed without deleting anything. (Move exists for same-persona projects; this covers cross-persona.)

### 4. Never hidden, ever
- The unfiled list loads on vault open (no Refresh needed) and after every mining job finishes.
- Counts stay truthful: unfiled items count in the vault total with an amber "Not filed" badge until placed.

## Technical notes
- Reuse `assignProjectToPersona` for whole-project filing; add a per-video move (update `project_content.project_id`, then rebuild source + destination project concept maps, invalidate graph/overview queries).
- Picker data: `listPersonas(userId)` + `listProjectsByPersona`; creating a new persona/project reuses existing create functions.
- All labels in EN/MN/KO.
- No schema changes; existing RLS already scopes everything to the owner.

## Verification
- Mint a session, file a real unfiled video into a persona + project via the UI, confirm it appears there, the leftover project is gone, and Undo restores it.
- Confirm the "Needs filing" section appears on vault open without pressing Refresh.
