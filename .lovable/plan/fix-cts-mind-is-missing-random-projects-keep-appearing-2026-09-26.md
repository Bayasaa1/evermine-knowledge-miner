# Fix: CTS mind is missing, random projects keep appearing

## What is actually wrong (checked in your account)

- **Your CTS mind exists** — project "CTS chit chat" with 2 saved minds ("ЭНЭ ЖИЛ ЮУ ХИЙВ? | CTS 2025 RECAP" and "CTS recaps highlights…"). It is hidden behind a mismatch, not lost.
- **"Үхэр Монголчуудын галзуу comment ууд"** says CTS on the mind itself, but its project has no owner. So under CTS it looks like a random project, and it also shows in Needs filing.
- **3 empty leftover projects** are making noise:
  - a second empty "Үхэр Монголчуудын…" and an empty "Unsorted" — both created today by my filing test + Undo (my fault, Undo didn't clean up)
  - the empty "The speaker reflects on how casual labeling…" folder from September
- The **Edit** box lets you pick CTS as persona but still lists projects from other places, so you can't pick "CTS chit chat".

## Fix

1. **Clean your data now**
   - Move the "Үхэр…" video and mind into **CTS chit chat**, then remove its empty project.
   - Delete the 3 empty leftovers (second "Үхэр…", "Unsorted", "casual labeling").
   - Result under CTS: one project, 3 minds, nothing in Needs filing.
2. **Stop leftovers from being made**
   - Undo removes any project that filing created and is now empty.
   - "Unsorted" holder is never shown when empty, and is deleted when it empties.
   - Empty projects with no videos and no minds are not listed as projects.
3. **Keep persona and project in agreement**
   - When a mind's persona changes, its project changes with it (and the reverse), so a mind can never say CTS while sitting in an unowned project.
   - Needs filing uses the project's owner as the truth.
4. **Edit box**
   - After picking a persona, the Project list shows only that persona's projects plus "New project…"; default is the persona's main project (e.g. CTS chit chat).
5. **Verify** signed in as you: open CTS → see CTS chit chat with 3 minds; no random projects; file + undo leaves no new project.

## Technical details

- One-off data fix via SQL: update project_content/mind_vaults project_id 845c064a → 5a7f3d33 (persona 73a31a04); delete projects 845c064a, 34862ccd, 5b16f133, 5e15ac77 and their project_concepts; rebuild concepts for 5a7f3d33.
- saved-minds.tsx Edit dialog: project options from listProjectsByPersona(selected persona); on save update both persona_id and project_id together.
- projects.ts: track created project ids in fileProjectInto/moveContentToPersona return so Undo deletes them; unfileContent deletes "Unsorted" when empty; listing filters projects with 0 content and 0 vaults (except the currently selected one).
- No schema change.
