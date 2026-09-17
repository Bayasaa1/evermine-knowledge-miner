# The two extra tabs: what they are, and what to do with them

Inside Creator Studio there are two tabs you don't recognise: **Projects** and **Versions**.

## Projects — delete it

It is an old, plainer copy of what My Vaults already does. It lists every project with a small "add a YouTube link" box and a delete bin. It has no personas, no pictures, no counts, no move/merge/split, no knowledge map. That is why the first screenshot shows "Unsorted", "Technoblade gaming style" and "Arika mind" all flat in one pile — the same projects you manage properly in My Vaults.

Keeping two places to edit the same projects is how videos end up "hidden" in the wrong pile. So: remove the Projects tab from Creator Studio. Nothing is lost — every project stays exactly where it is and is managed from My Vaults.

## Versions — keep it, but move it and make it plain

This one does something real and nothing else in the app does it:

- every mined video keeps a saved copy of what was learned (v1.0, v1.1, …)
- **Rollback** puts an older copy back if a re-mine made the mind worse
- **Delete update** throws away a bad update
- **Open JSON editor** (the third screenshot) is the useful part: it lists the video's 5‑minute chunks with one line describing each, and lets you **erase a bad chunk**, **correct a wrong statement**, or **add a question and the right answer**. Saving makes a new version.

The problem is where it lives and how it talks. It sits in a tab nobody opens, the header says "Mind Versioning & Creator Hub", and the four boxes say "Knowledge Graph 287 / Voice Embeddings 15 / Emotion Timeline 0 / VLA Trajectories 0" — numbers with no meaning to a person.

Changes:

1. Move it out of Creator Studio and into **My Vaults**, on the mind itself: each mined video card gets a **Fix this mind** button that opens the same panel for that one mind.
2. Rename everything in plain words:
   - "Mind Versioning & Creator Hub" → **History & fixes**
   - "Open JSON editor" → **Fix this mind**
   - "Rollback" → **Go back to this version**
   - "Chunk Eraser" → **Bad part? Remove it**
   - "Conflict Annotations" → **Something wrong? Correct it**
   - "FAQ Patch Injector" → **Add a question and answer**
   - "Release notes" → **What changed**
3. Replace the four jargon boxes with one honest line: "Learned 287 things · 15 voice samples · saved 9/8/2026". Boxes showing 0 are hidden instead of displayed as empty stats.
4. Old versions stay collapsed behind "Earlier versions (3)" — only the current one shows by default.

## Result

Creator Studio goes from four tabs to two (Guided setup, Advanced dashboard). Project management lives in one place only. The fixing tools stop hiding in a tab and appear on the mind you want to fix.

## Technical notes

- `src/routes/creator.tsx`: drop the `projects` and `versions` buttons from the view switcher, remove those two branches and the `ProjectManager` / `MindVersioningHub` imports; narrow the `view` union to `guided | advanced`.
- Delete `src/components/project-manager.tsx` after checking no other route imports it.
- `src/components/mind-versioning-hub.tsx`: accept an optional `mindId` so it can render a single mind; new copy keys in EN/MN/KO; hide zero-value data cards; collapse non-current versions.
- `src/components/saved-minds.tsx`: on each mined card add a "Fix this mind" button opening the hub in a sheet scoped to that mind.
- `src/components/json-surgical-editor.tsx`: copy-only rewrite of the section headings and the save button; logic untouched.
- No database or server-function change; `mind-versions.functions.ts` stays as is.
- After building: open /vaults, open one mined video, erase a chunk, save, and confirm a new version appears and the mind still answers.
