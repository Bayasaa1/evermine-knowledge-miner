# bayasaa6161: missing persona, 27 scattered projects, videos not in feed

## What I found in that account

- **0 personas.** I found no trace of a deleted persona: none of the 26 mining jobs ever had one. These were mined on Sep 8 through the old flow, which saved each video without asking whose it was.
- **27 projects with no owner.** The old flow made **one project per video** (26), plus an empty "Cts" project from Aug 28. That is why "Needs filing (53)" shows every video twice: once as a project, once as a video.
- **All 26 videos and 26 saved minds are still there.** Nothing was lost.
- **Feed:** all 26 videos are marked public, and the feed rules allow them. But the feed only loads the **newest 30 videos in the whole app**, and 9 of his are the same video ("Хотод үл мэдэгдэх…" mined 9 times), which get merged into one card. So most of his should appear, but the list is capped. I haven't confirmed yet what he actually sees; step 1 checks that.

## Fix

1. **Check the feed** signed in as him and as a visitor, and write down which of his videos are missing and why.
2. **Put his content back together** (one-off):
   - Create a persona for him (proposed name "Gremix", since most titles are Gremix vlogs).
   - Merge the 26 one-video projects into one project, "Gremix mind", owned by that persona.
   - Remove the 8 extra copies of "Хотод үл мэдэгдэх…" and keep the newest.
   - Delete the empty "Cts" project.
3. **Needs filing is easier to use:**
   - Show each video **once**. A one-video project and its video become a single row.
   - Add checkboxes and a **"File selected…" / "File all…"** button, so 50 items take one step instead of 50.
4. **The feed shows everyone fairly:**
   - Load more as you scroll instead of stopping at 30.
   - Mix creators, so one account's new batch can't push everyone else out.
5. **Stop it happening again:** mining always ends in a persona's project (the current flow already requires this). Old accounts like his get one "File all" prompt instead of dozens of rows.

## Technical details

- Data fix via SQL for user b3679df0: insert creator_personas; create one project; update project_content/mind_vaults/mining_jobs to that project and persona; delete duplicate content and vaults for the repeated youtube_id; delete the emptied projects and their project_concepts; rebuild concepts.
- saved-minds.tsx: dedupe unfiled project rows against video groups by project_id; add multi-select with a bulk FileThis that reuses fileProjectInto / fileGroup in a loop, with one Undo for the whole batch.
- feed.ts / listPublicVisualContentLight: cursor paging (created_at < cursor, limit 30) plus an infinite loader on home; interleave by project.user_id.
- No schema change.

## Question

The data fix touches another person's account. It is safe to proceed only because you're the admin. Is "Gremix" the right persona name for him?
