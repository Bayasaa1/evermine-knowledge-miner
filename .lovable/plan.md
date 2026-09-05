# Gaming Mind: a Minecraft player clone — Coach and Teammate

Yes, this is buildable in Evermind on top of what you already have. You gave me the final shape: two modes, not one.

Scope for this first build: Minecraft only, demo-grade, one clone end to end.

## 1. New creation type: "Gaming Mind"

A fifth type next to Knowledge, Robot Brain, Voice and Sales. Picking it changes what mining looks for in the footage:

- Play style and habits (how the player fights, builds, farms, escapes)
- Named tactics and setups, each with the moment in the video it came from
- Decision moments: what the situation was, what they did, why it worked
- Commentary voice: humour, catchphrases, pacing, how they explain things
- Step-by-step tutorials pulled out of long videos
- Mistakes and how they recovered

Same eight-AI pool rules as the other types: gameplay must be *seen*, so only AIs with eyes appear (3 free, 4 paid, 1 add-your-own), and the free built-in engine does the watching before any thinker reasons over it.

## 2. Coach mode — watches and hears you, never plays

The Coach lives in the website. You share your screen and mic (browser screen capture), and the clone:

- Watches your live gameplay in short snapshots and hears your voice
- Calls out advice in the player's voice: "don't trade there, back off and heal"
- Teaches: pick a skill, it builds a lesson with drills, a checklist and your mined tutorial clips
- Review afterwards: what you did well, what lost you the fight, with clips of the original player doing it right

This is the "teach, guide, help" part, and it works entirely inside the browser.

## 3. Teammate bot — plays with you, never watches

The website cannot press keys in a game, so the teammate is a small program you download and run on your own PC — same shape as the robot package you already ship.

- The mind exports a **Gaming Mind package** (skills, tactics, decision rules, priorities) at a private token-protected link.
- A downloadable agent built on Mineflayer joins your Minecraft Java server as a player, pulls the package, and acts as your partner: mines, builds, follows, fights beside you, and answers chat in the clone's voice.
- It never sees your screen — it perceives the world through the game itself (blocks, entities, health, inventory).
- Copy-paste setup: install, paste the link, run. It appears in-game as a bot player.
- Mobile/Bedrock is out of scope for now; Java + Mineflayer is the only path that works without fragile screen capture.

## 4. Honest limits

- The teammate plays at "competent partner" level, driven by rules and mined priorities — not a trained RL agent; it will not beat good PvP players.
- The clone's knowledge is only as good as the videos mined into it.
- Cloning a real creator like Technoblade is fan-made tribute content and will be labelled as such; revisit properly before a wide launch.

## Technical notes

- `src/lib/creation-category.ts`: add `gaming` with labels in en / mn / ko; `src/lib/capabilities.ts`: capabilities `chat`, `voice`, `coach`, `game`, `asset`, primary action "Deploy Teammate".
- `src/lib/miner-pool.ts`: `gaming` pool requires the `video` sense — same 3 free / 4 paid / 1 manual shape as `robot`.
- `src/lib/gemini.ts`: gaming extraction schema (`skills[]`, `tactics[]`, `decisions[]`, `tutorials[]`, `commentaryStyle`) with required timestamps, same repair path as subtitles.
- Coach: `src/components/game-coach.tsx` — getDisplayMedia screen share + mic, snapshot frames on an interval, sends them with the mind's mined brain to a new `src/routes/api/mind-coach.ts` (authenticated, rate-limited, Lovable AI vision model), speaks replies via the existing voice-dub path. No persistence of screen frames.
- `src/lib/game-mind.ts` (new): builds `evermind.gaming_mind/v1` package from mined chunks, mirroring `src/lib/robot-deploy.ts`.
- `src/routes/api/public/v1/mind/$token/game[.]json.ts`: token-scoped server-only pull route, same guard as the robot package route (no token column exposed).
- `src/components/game-deployment-studio.tsx`: token issue/revoke, copy link, download the Mineflayer agent script, QR.
- Agent script generated as text (like `rosClientScript`): Mineflayer + pathfinder + a small planner loop reading the package's priorities; chat answers routed through the mind-chat style endpoint. No new runtime in the Worker.
- `src/components/mind-explorer.tsx`: add a Gameplay tab (skills, tactics with clip playback, tutorials).
- Copy for everything in en / mn / ko.

## Suggested order

1. Gaming creation type + mining schema + AI pool (mine one Minecraft video end to end).
2. Gameplay tab in the vault so you can see what it learned.
3. Coach mode (screen watch + voice teach).
4. Package export + downloadable Mineflayer teammate bot.
