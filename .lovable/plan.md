# bayasaa6161: missing persona, 27 scattered projects, videos not in feed

Rule for this work: **the app and I decide nothing.** Nothing about his minds gets created, merged, renamed or deleted unless he chooses it himself.

## What I found in that account

- **0 personas.** I found no trace of a deleted persona: none of the 26 mining jobs ever had one. These were mined on Sep 8 through the old flow, which saved each video without asking whose it was.
- **27 projects with no owner.** The old flow made **one project per video** (26), plus an empty "Cts" project from Aug 28. That is why "Needs filing (53)" shows every video twice: once as a project, once as a video.
- **All 26 videos and 26 saved minds are still there.** Nothing was lost.
- **Feed:** all 26 videos are marked public, and the feed rules allow them. But the feed only loads the **newest 30 videos in the whole app**, and 9 of his are the same video ("Хотод үл мэдэгдэх…" mined 9 times), which get merged into one card. I haven't confirmed yet what he actually sees; step 1 checks that. Checking changes nothing.

## Fix (no changes to his data by me)

1. **Check the feed** signed in as him and as a visitor, and write down which of his videos are missing and why. Nothing is changed while checking.
2. **Needs filing shows each video once.** A one-video project and its video become one row, so 53 becomes 26 real items. This only changes how the list looks, not his data.
3. **Tools he can use himself, all with confirmation and Undo:**
   - Checkboxes plus **"File selected…"**: he picks the persona and the project, or types a new name himself. The app never suggests or pre-fills a name.
   - Repeated copies of the same video are **labelled "Same video ×9"** so he can see them. Removing a copy happens only if he presses Delete and confirms.
   - Empty projects like "Cts" get an **"Empty"** label. They are removed only if he chooses to.
   - Before anything is saved, a summary shows exactly what will move ("12 videos → Gremix / Gremix mind"). Nothing happens until he confirms, and one Undo reverses the whole batch.
4. **The feed shows everyone fairly** (display only): load more as you scroll instead of stopping at 30, and mix creators so one account's batch can't push others out.
5. **The app never files things for him.** The cleanup of empty leftovers I added in the last change will be switched off. An empty project stays until its owner deletes it.

## Technical details

- saved-minds.tsx: dedupe unfiled project rows against video groups by project_id; multi-select plus a bulk FileThis with a confirm summary step; a single batched Undo; "Same video ×N" and "Empty" badges; no pre-filled names in FileThis.
- Remove the automatic deleteProjectIfEmpty calls (listUnfiledProjects, fileGroup, Undo, Edit save). Keep deletion only behind explicit user action.
- feed.ts / listPublicVisualContentLight: cursor paging plus interleaving by owner. Read-only.
- No SQL on his account, no schema change.
