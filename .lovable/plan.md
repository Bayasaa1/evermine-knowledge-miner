# Gaming Mind: a Minecraft player clone that talks, teaches and plays

Yes, this is buildable in Evermind. It reuses the exact machinery you already have: mine gameplay videos, build a brain, chat and voice-call it, and hand a package to something outside the browser (today a robot, now a Minecraft bot).

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

## 2. What the clone can do once mined

- **Chat**: ask it "how do I win a crystal fight" and it answers in the player's voice with a clip timestamp.
- **Voice call**: same as your existing voice minds, so it can commentate.
- **Teach mode**: a guided lesson view — pick a skill, it gives drills, a checklist and the clips to watch. This is the "teach, guide, help" part and it is the strongest demo, because it works fully inside the website.
- **Live coach**: during a call you tell it what is happening; it advises next move.

## 3. The bot that actually plays

The website cannot press keys in a game, so this is a small program the creator downloads and runs on their own PC — the same shape as the robot OTA package you already ship.

- The mind exports a **Gaming Mind package** (skills, tactics, decision rules, priorities) at a private link.
- A downloadable Node.js agent built on Mineflayer joins a Minecraft Java server as a player, pulls that package, and acts on it: mining, building, following, fighting, and answering chat in the clone's voice.
- Copy-paste setup: install, paste the link, run. It appears in-game as a bot player.
- Mobile/Bedrock and screen-reading bots are out of scope for now; Java + Mineflayer is the only path that works without fragile screen capture.

## 4. Honest limits

- The bot plays at "helpful competent teammate" level, driven by rules and the mined priorities — it is not a trained reinforcement-learning agent and will not beat good players in PvP.
- The clone's knowledge is only as good as the videos mined into it.
- Cloning a real creator like Technoblade is fan-made tribute content and will be labelled as such in the app; revisit properly before any wide launch.

## Technical notes

- `src/lib/creation-category.ts`: add `gaming` with labels in en / mn / ko; `src/lib/capabilities.ts`: capabilities `chat`, `voice`, `game`, `asset`, primary action "Deploy to Minecraft".
- `src/lib/miner-pool.ts`: `gaming` pool requires the `video` sense — same 3 free / 4 paid / 1 manual shape as `robot`.
- `src/lib/gemini.ts`: gaming extraction schema (`skills[]`, `tactics[]`, `decisions[]`, `tutorials[]`, `commentaryStyle`) alongside the existing knowledge/VLA schemas; timestamps required, same repair path as subtitles.
- `src/lib/game-mind.ts` (new): builds `evermind.gaming_mind/v1` package from mined chunks, mirroring `src/lib/robot-deploy.ts`.
- `src/routes/api/public/v1/mind/$token/game[.]json.ts`: token-scoped server-only pull route, same guard as the robot package route (no token column exposed).
- `src/components/game-deployment-studio.tsx`: token issue/revoke, copy link, download the Mineflayer agent script, QR.
- Agent script generated as text (like `rosClientScript`), Mineflayer + a small planner loop; no new runtime in the Worker.
- `src/components/mind-explorer.tsx`: add a Gameplay tab (skills, tactics with clip playback, tutorials).
- Teach mode as a new panel in the mind view, reusing the existing chat endpoint with a lesson system prompt.
- Copy for everything in en / mn / ko.

## Suggested order

1. Gaming creation type + mining schema + AI pool (mine one Minecraft video end to end).
2. Gameplay tab in the vault so you can see what it learned.
3. Chat, voice and teach mode on the gaming mind.
4. Package export + downloadable Mineflayer bot.
