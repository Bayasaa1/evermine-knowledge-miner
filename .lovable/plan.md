# Clean up the mess in Saved Minds (you decide everything)

## What the mess really is (checked in the account)

- The account has **1 real project** ("gremix mind") and **24 empty leftover folders**.
- You didn't create those 24. The old mining made **one folder for every video** it mined. When you moved the videos into your project, each old folder was left behind, empty.
- The rows that look like duplicates ("Хотод үл мэдэгдэх…" many times) are the leftover folders from mining that one video 9 times. They are empty. **None of your videos or saved minds are inside them.** All 26 mined videos are safe under Mined videos.
- "Cts" is also an empty folder from Aug 28.
- The same 24 empty folders show up twice: in **Needs filing** and in the persona's orange **"Move to this persona"** list.

## Fix

1. **Take empty folders out of both lists.** Needs filing and "Move to this persona" show only folders that actually hold a video or a saved mind. Empty folders have nothing to file, so they don't belong there. This only changes what the screen shows. Nothing is deleted.
2. **One clear place for leftovers.** A small line at the bottom of Saved Minds: "24 empty leftover folders from old mining. [Show]". Tapping Show lists them, each with Delete, plus a **"Delete all empty folders"** button.
3. **You decide, always.** Delete only happens when you press it and confirm ("Delete 24 empty folders? No videos or minds are inside."). One Undo puts them all back. The app never deletes them by itself. Folders with anything inside can never be removed this way.
4. **Future mining won't create these.** New mining always asks which persona and project first, and puts the video straight there, so no new one-video folders appear.
5. **Check it myself** signed in on a test account: the lists show no empty folders, Delete all + Undo works, and every mined video is still there.

## Technical details

- `saved-minds.tsx`: filter `loneProjects` by `emptyIds` out of Needs filing; new collapsible "Empty leftovers" block with per-row Delete and bulk delete (confirm + batched Undo re-inserts the rows).
- `vault-hub.tsx`: filter the `listUnfiledProjects` "Move to this persona" list to non-empty projects (same emptiness check: no project_content, no mind_vaults).
- `projects.ts`: bulk `deleteEmptyProjects(ids)` that re-checks emptiness server-side per id before deleting and returns the deleted rows for Undo.
- Verify mining paths never create a project without the user's chosen project id.
- No SQL on anyone's data. EN/MN/KO copy.
