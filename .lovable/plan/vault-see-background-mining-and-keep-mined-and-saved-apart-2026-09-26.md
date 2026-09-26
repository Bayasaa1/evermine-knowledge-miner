# Vault: see background mining, and keep Mined and Saved apart

## What changes

1. **Background mining comes back**
   - Undo the last change. Mining keeps going while the app is closed, and it picks up again on its own when you open the app, like a playlist.
   - The fix for the video length stays, so your 3-hour video gets 40 parts.

2. **New "Mining now" section at the top of My Vaults**
   - Every video that is mining, waiting or stopped shows here with its thumbnail and title, plus:
     - "12 / 40 parts mined" and a progress bar
     - the current state: Mining now, Waiting for free tokens (continues at 15:00), Paused, Stopped or Failed (with the reason in plain words)
     - a list of parts you can open (Part 1 · 0:00–5:00 … Done / Mining / Waiting / Failed)
     - buttons: Continue now, Pause, Stop
   - It updates by itself every few seconds, so you can watch background work without leaving the vault.
   - Nothing is hidden: failed and waiting videos stay in the list until you remove them yourself.
   - It follows the persona you pick at the top of the vault. With no persona picked, it shows all of them.

3. **Mined and Saved become two separate sections**
   - **Mined videos:** videos the AI has mined, including ones only partly mined. They keep the Core Brain, Auditor, Fix, Compare and Send buttons.
   - **Saved videos:** videos you saved but haven't mined yet, each with a "Mine this" button.
   - Right now both sit together under "Saved minds". After this, each gets its own heading and count. Needs filing stays as it is.

Order on the vault page: Mining now, Mined videos, Saved videos, Needs filing, Subtitle timing.

Nothing in your minds, projects or personas is moved, renamed or deleted.

## Technical details

- Remove the early `disabled` return from `src/routes/api/public/cron/resume-mining.ts`, and put `<MiningAutoResume />` back in `mining-status-pill.tsx`.
- New `src/components/vault-mining-queue.tsx`: the user's `mining_jobs` rows (every status except done-and-finalized), polled with `useQuery` about every 5s. It reuses `jobParts`, `quotaRetryAfter` labels, `continueMiningNow`, and the pause/stop server functions already used by `mining-monitor.tsx`. Filtered by `persona_id` when one is selected. It goes at the top of `src/routes/vaults.tsx`.
- `saved-minds.tsx`: split each grouped row by `kind` into two sections, mined (`kind !== "source"`) and saved-only (a source with no mined copy). All copy in EN/MN/KO.
- Check with a Playwright pass on the vault as the signed-in user: the queue shows the Elon Musk job, and both sections render with the right counts.
