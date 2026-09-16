# Saved videos: pictures, nothing hidden, two clear lists

## What you reported

1. Some videos show a YouTube picture, some don't.
2. Arika mind has 8 videos but only 5 show; CTS mind has 2 but only 1 shows. Videos are hidden in other places.
3. You want two separate lists: videos already mined, and videos saved but not mined yet.
4. The not-mined list needs a small setup box before mining: mining type, which AI, and which persona and project it goes into.

## What I found

The missing videos are real. When a video was mined without a project chosen, the app quietly created a
one-off project with no persona for it. Those projects hold the "missing" videos:

- Arika's 3 extra videos sit in three separate one-off projects with no persona.
- CTS's extra 2 videos sit in two more one-off projects.

They are not deleted — they just never got filed under the persona, so the persona's list never shows them.

Pictures are missing for the same kind of row: a picture is only drawn when the saved-link record carries a
thumbnail. Rows that came straight from mining have no thumbnail stored, so they render blank.

## The fix

**Pictures always.** Every card falls back to the YouTube picture built from the video id
(`i.ytimg.com/vi/<id>/mqdefault.jpg`), so any video with a YouTube link shows a picture. Only a Drive upload
with no video id keeps the plain placeholder.

**Nothing hidden.** Two parts:

- A one-time cleanup that files every stray video under the right persona: a one-off project whose only
  video belongs to the same channel/persona as an existing project is merged into that persona, and its
  videos are attached to it. Where the owner persona is genuinely unknown, the project is left alone but
  surfaced (below) instead of disappearing.
- The persona view gains an always-visible "Not filed yet" strip listing every video that belongs to no
  persona, each with a one-tap "Move to this persona". Saved Minds does the same: when a persona is
  selected, unfiled videos are still listed, marked "Not filed", never silently dropped.

**Two lists.** Saved Minds splits into two labelled sections with counts:
`Mined (n)` and `Saved, not mined yet (n)`. Same cards, same actions, just separated, so you always know
what still needs work.

**Mini setup box.** Each not-mined card gets a small "Set up & mine" panel (closed by default, opens in
place) with four choices and a Start button:

- Mining type — the creation type list (Knowledge, Robot, Sales, Gaming).
- AI — your saved Gemini keys listed by their last 4 characters, default the newest.
- Persona — your personas, default the current one.
- Project — projects of the chosen persona, plus "New project…" with a name box.

Pressing Start queues mining right there, with no jump to Creator Studio. The batch "Mine selected" button
keeps working and uses the same panel values at the top of the list.

## Technical notes

- `src/components/saved-minds.tsx`: `thumbFor(group)` fallback; split `groups` into `minedGroups` /
  `pendingGroups` with section headers; new `MineSetup` sub-component calling `startMiningJobs` directly
  (category, personaId, projectId, apiKey, `defaultAssessmentFor(category)` seeded with the saved video's
  title/description/duration/channel and current language); unfiled rows stay visible under a persona filter.
- `src/lib/mining-jobs.functions.ts`: `startSchema` accepts an optional `apiKeyTail` so the server picks the
  exact saved Gemini key the creator chose (client never handles other people's keys); no other behaviour change.
- `src/lib/cloud-vault.functions.ts` `listVaults`: when scoped to a persona, also return rows with no persona
  so they can be shown as "Not filed" instead of vanishing.
- New server fn `adoptOrphanProjects` in `src/lib/projects.ts`-adjacent functions file: moves projects with
  `persona_id = null` (and their content and vault rows) to a chosen persona; used by the "Move to this
  persona" buttons.
- Copy in English, Mongolian and Korean, short sentences.
- After the change: open the vaults page in the browser, check Arika shows 8 and CTS 2, every card has a
  picture, and mining from the new panel actually queues a job.
