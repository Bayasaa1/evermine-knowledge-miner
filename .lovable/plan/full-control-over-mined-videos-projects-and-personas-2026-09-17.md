# Full control over mined videos, projects and personas

Six new actions, all reachable from the places you already use: the video table inside a project, and the persona/project cards in My Vaults.

## 1. Change persona for videos

In the "All videos" table, select any rows and pick **Move to persona**. The chosen videos are moved into that persona's space. If the target persona has no project yet, a project named after the persona is created automatically, so the videos always land somewhere visible.

## 2. Move videos between projects

The table already has "Move to project". It gets a wider picker: projects of the current persona plus **New project…** with a name box, so you never have to leave the page to create the destination.

## 3. Merge two projects

On a project card, **Merge into…** lets you pick another project of the same persona. All videos, saved minds and topics move over, then the emptied project is removed. A confirmation names both projects and how many videos will move. Merging only works inside one persona, so two personas never mix.

## 4. Split one project into two

Inside a project, select the videos you want to peel off and choose **Split into new project**, then type the new project's name. The selected videos (and their topics) move into the fresh project; the original keeps the rest.

## 5. Exclude a video without deleting it

New **Remove from project** action on selected rows. The video is unfiled — it keeps its mined result and stays in your account, and it shows up in the existing amber "Not filed" strip with a one-tap button to put it back into any persona or project. It disappears from the public feed while unfiled. Nothing is deleted.

## 6. Rename a persona

A pencil on the persona card opens a small box for name, handle and short bio. Saving renames the persona everywhere, including the creator name shown on that persona's published videos.

## Housekeeping after every action

Each of these actions rebuilds the knowledge map counts for both the source and the destination project, and refreshes the video lists, so the map never shows topics for videos that moved away.

## Suggested extras (included)

- **Re-mine selected** — one button on selected rows that re-runs mining with the newest key, so improved videos refresh their learned topics without you re-pasting links.
- **Rename a video** — pencil on a row edits the title and description shown in the feed.
- **Project rename & cover** — small edit box on the project card for title, description and cover picture.
- **Project counts on cards** — every project card shows "n videos · n topics · mined" so you see the result of a move or split instantly.
- **Select all of one kind** — one tap selects all "Training" or all "Feed" rows, which makes splits and merges fast on big projects.
- **Undo for 10 seconds** — exclude/move/merge actions show a toast with Undo that reverses the move (deletes stay final and always ask first).

## Technical notes

- `src/lib/projects.ts`: add `moveContentToPersona(ids, personaId)`, `unfileContent(ids)` (sets `project_id` to a per-user "Unsorted" project or a null-persona holder and flips the row out of the feed), `mergeProjects(sourceId, targetId)` (moves `project_content` + `mind_vaults` + `project_concepts` rows, then deletes the source), `splitProject(projectId, contentIds, newTitle)`. All owner-scoped via `currentOwnerId()` + `.eq("user_id", owner)`.
- `src/components/project-content-table.tsx`: bulk bar gains Move to persona, New project… in the project picker, Split into new project, Remove from project. Existing `runBulk` already re-runs `rebuildProjectConcepts` for source and target — extend it to the new targets and widen invalidation to `["project-overviews"]`, `["graph-summary"]`, `["cloud-vaults"]`, `["home-feed"]`.
- `src/components/vault-hub.tsx` / `project-manager.tsx`: project card menu gains Merge into…; persona card gains inline edit calling the existing `updatePersona`.
- Because a project row currently carries `persona_id`, moving videos to another persona means moving them into a project owned by that persona rather than editing the content row's persona — the plan creates/reuses that project.
- All new copy in English, Mongolian and Korean, short sentences.
- After building: open /vaults in the browser, run each action once, and confirm counts on the persona cards, the knowledge map and the feed all agree.
