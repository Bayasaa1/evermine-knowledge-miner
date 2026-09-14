# Roadmap

## Vault ownership and project stability
- [x] Keep My Vaults scoped to the signed-in owner and selected persona
- [x] Show Step 3 mining choices only from the selected persona and saved project
- [x] Prevent mining and background finalization from creating projects
- [x] Require the owner to save and select a project before mining
- [x] Consolidate Digital Diary of Arika videos into the owner-created Arika mind project

## Permanent video deletion and multi-display feed
- [x] Delete the video, saved brain/version data, mining jobs, feed card, and interaction records together
- [x] Refresh every affected view immediately after deletion
- [x] Scale the vertical feed across phone, tablet, 1080p, 2K, and 4K displays

## Gaming Mind (Minecraft clone)
- [ ] Creation type "Gaming Mind" + mining schema (skills, tactics, decisions, tutorials, commentary voice) + vision-capable AI pool
- [ ] Gameplay tab in vault to inspect mined skills/tactics/tutorials
- [ ] Coach mode: watches and hears your gameplay, teaches and advises — never plays
- [ ] Teammate bot: Mineflayer agent that plays with you in a Minecraft Java server, driven by the mined mind; no watching, partner only
- [ ] Chat + voice call for the gaming mind
- [ ] Token-scoped gaming mind package export (mirror robot package security)

## Per-account privacy (each customer their own space)
- [x] Clear every private screen the instant the signed-in account changes
- [x] File private lists (vaults, minds, versions, jobs, notifications, content) under the owner
- [x] Give every browser-stored record an owner and erase it on sign-out
- [x] Projects and mined videos private until the creator publishes them
- [x] Owner filter on every edit/delete sent from the app
- [x] Gemini key test limited to two calls, stops on rate limit
- [x] No server-stored or shared AI key in any chat path
- [x] Require the active owner on every remaining project, persona, and graph mutation
- [x] Make “Move to feed” publish the selected video’s project
- [x] Refresh Groq key testing so retired models do not reject valid keys

## Knowledge map built for 1000 videos
- [x] Project is the unit — one project, one knowledge space, never mixed
- [x] Three zoom levels (project topics → videos → one video's concepts) with a hard node cap
- [x] Concept index table written as mining finishes, rebuildable for old Core Brains
- [x] Table view with search, paging and bulk move / feed-or-training / delete
- [x] Persona level shows project cards with counts instead of one huge canvas
