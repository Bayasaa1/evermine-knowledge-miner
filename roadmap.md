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

## Full control over mined videos, projects and personas
- [x] Bulk move videos to another persona or project, or into a brand-new project
- [x] Split selected videos off into a new project; merge one project into another (same persona)
- [x] Remove videos from a project without deleting (Unsorted holder + Not filed strip)
- [x] Rename persona (name, handle, bio) and project (title, description, cover)
- [x] Rename a video, re-mine selected, select all of one kind, 10-second Undo on moves

## API Manager as the real AI control centre
- [x] Make account-saved keys the single source used by every device and job
- [x] Wire all compatible text providers to translation and chat
- [x] Keep full-video mining on Gemini and rename face cloning to video-call sight
- [x] Add per-role key selection, automatic fallback setting, and end-to-end checks
- [x] Prove no AI job can call Lovable AI credits
- [x] Route Core Brain generation through the account resolver
- [x] Keep unavailable keys visible in role choices and test the assigned key without hidden Gemini fallback
- [x] Never cache failed subtitle output as a successful translation
- [x] Remove old device-only Gemini bypasses from chat, diagnostics, subtitle repair and mining setup
- [x] Route game-camera coaching through the video-call vision assignment, not the text-chat assignment
- [x] Make mining resolve its assigned account key and remove the obsolete Engines alert
- [x] Stop English pages translating themselves and wasting the user's quota
- [x] Treat Gemini per-minute throttling as a short cooldown, not daily exhaustion
- [x] Use Gemini Flash-Lite without hidden thinking tokens for translation
- [x] Make failed translation responses retry or show the real error instead of caching original text
- [x] Route Mind Auditor through the selected Core Brain AI
- [x] Add a separate text-engine role for organizing mined video notes
- [x] Let mining switch to another saved Gemini key when the selected key reaches its limit
- [ ] Verify real translation, Core Brain, chat, video mining and voice behavior through a signed-in customer account

## Chat audit and repair
- [x] Preserve real conversation turns and complete history when asking the selected AI
- [x] Reject empty AI replies instead of displaying an ellipsis
- [x] Use only the persona owner's transcript lines for voice samples
- [x] Show a Gemini recommendation for chat without changing the user's selection
- [x] Refresh missing personality data only on explicit user action, with Undo
- [ ] Pass the Elon chat flow twice on mobile with Cyrillic Mongolian replies

## Talk and play with Technoblade now
- [x] Persona rename must reach the project, chat self-intro and every mined file automatically
- [x] Fix the stale "Technobkade" name on the Technoblade project
- [x] Voice call + Game Coach usable right now for the gaming mind

## Voice calls that anyone can use
- [x] Understand any language the caller speaks, including mixed sentences
- [x] Reply in the same language the caller just used
- [x] Free voice reply with the phone's own voice when no paid voice is set up
- [x] Replace tap-to-call recording with hold-to-talk and release-to-send
- [x] Improve casual Khalkha Mongolian and mixed-language transcription

## Feed sequence and recommendations
- [x] Let creators control the video order inside each project
- [x] Swipe right for the project's next/newer video and left for its previous/older video
- [x] Rank the main feed with popularity, freshness, quality, and creator diversity without AI credits
