# Clean up the mess in Saved Minds

## What the mess really is (checked in the account)

- bayasaa6161 has **1 real project** ("gremix mind") and **24 empty folders**.
- He didn't create those 24. The old mining made **one folder for every video**. When the videos were moved into his project, the old folders were left behind, empty.
- The rows that look like duplicates ("Хотод үл мэдэгдэх…" many times) are empty leftovers from mining that one video 9 times. "Cts" is empty too.
- All 26 mined videos and saved minds are safe under Mined videos. None are inside those folders.

## Fix

1. **Delete the 24 empty folders now (you approved this).** Only folders that hold no videos and no saved minds are removed. Right before deleting, each one is checked again. "gremix mind" and anything with content are left alone.
2. **Hide empty folders from Needs filing and from the "Move to this persona" list.** Empty folders have nothing to file, so they won't show up there. This covers every account.
3. **Stop mining from making these folders.** New mining puts the video into the persona and project the user picked. It never makes a folder per video.
4. **Folders a user made himself are never deleted automatically.** Only he can delete those, with a confirmation and Undo.
5. **Check it:** signed in as him, Needs filing and the persona list show no empty folders, "gremix mind" and all 26 videos are still there, and his videos appear in the feed.

## Technical details

- One-off data change: delete from `projects` (and their `project_concepts`) where user_id = b3679df0… and persona_id is null and there are no project_content or mind_vaults rows. Run a count before and after the change.
- `saved-minds.tsx`: filter empty lone projects out of Needs filing.
- `vault-hub.tsx`: filter empty projects out of the unfiled "Move to this persona" list.
- Mining paths (`mining-jobs.functions.ts`, `finalize-job.server.ts`, `guided-studio.tsx`): confirm that no per-video project gets created without the user choosing it, and remove any path that does.
- Update the user-decides memory: deleting mining-made empty leftovers is allowed. Anything a user created is still never deleted automatically.
