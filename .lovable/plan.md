# Full audit: privacy, security, credits, performance, mining, subtitles

A single pass over the whole app. Below is what I already checked (confirmed now), and what the audit pass will actually fix.

## Already verified this session

- **No Lovable credit leakage left in the app.** A repo-wide search for the shared AI connection (`LOVABLE_API_KEY`, `ai.gateway.lovable.dev`) returns zero results. Every AI feature — mining, chat, voice, video, coach, auditor, translation, diagnostics — now runs on the user's own Gemini key or provider key. Note: credits used while *I build* the app are separate and unavoidable; only the app's own features were the leak, and that is closed.
- **Database checks are clean.** The backend linter reports no issues.
- **Review "verified buyer" badges are safe.** The scanner warns they could be faked, but a database trigger already recomputes both flags from real purchase and deployment records before every write. No change needed; I'll record it as reviewed.

## What the audit will fix

### Privacy
- Confirm every viewer Core Brain stays private unless the viewer shares it, including in the creator-facing aggregate views.
- Confirm saved AI keys are never returned to the browser (only a "configured" flag and last 4 characters).
- Confirm sign-out and account switching wipe every device-stored key, token and cached vault.
- Decide and document the one open access question: users currently cannot read their own activity log. I'll leave it locked unless you want a personal activity view.

### Security
- Re-check that every table with hidden states (unpublished projects, private brains) has both a public policy and an owner-read policy, so owners can still see their own hidden rows.
- Re-check that all public endpoints (robot package, cron, ping) verify their caller and leak no tokens.
- Confirm paid-content access checks run on the server, not the browser.

### Lag and performance
- Several screens refresh on short timers (analytics every 4s, token usage every 5s, explore every 45s) and keep running while hidden. These get paused when the tab or panel is not visible, which is the main source of background lag and wasted requests.
- Check the home feed's first-load work: how much is fetched before the first video can play, and trim anything not needed for the first card.
- Check the chat/voice/video call path for redundant round-trips that add delay before the Mind answers.

### Errors and bugs
- Sweep for server functions that require sign-in but can be called while signed out (the cause of the earlier blank screen), and gate them.
- Check the talk-to-Mind session save: switching between chat, voice and video can currently save the same turns twice. Fix with a single guarded flush per session.
- Walk the mining flow end to end in the running app and capture anything that fails or hangs.

### Engines and credentials
- Verify the Engines screen truthfully reports each provider's state, and that the "add your free Gemini key" card appears wherever a feature is blocked for a missing key — with the right message for "no key" vs "quota used up".
- Verify background mining jobs use the job owner's stored credential and pause with a readable reason instead of failing silently.

### Subtitles, results and mining
- Verify subtitles stay aligned after re-timing, in all three languages, and that the selected language really switches subtitles, answers and voice.
- Verify a mined result opens fully in Mind Explorer (story, topics, emotions, raw JSON, playback) and that saving a fix creates a new version without losing the old one.
- Verify no duplicate mining of an already-finished video, and that a job's persona/project target is never reassigned.

## How it will be delivered

One report in chat listing every issue found, grouped as **fixed**, **needs your decision**, and **not a problem (verified)**. Fixes land in the same pass; nothing is deferred to a later turn except items that need a decision from you.

## Technical notes

- Visibility-gated polling via a shared `useVisiblePolling` helper replacing the raw `setInterval` calls in `analytics-panel.tsx`, `token-usage-panel.tsx`, `explore.tsx`, `youtube-stage.tsx`.
- Auth-gated server fn calls audited by cross-referencing `requireSupabaseAuth` usages against their `useServerFn` callers.
- Session flush guard in `talk-to-mind-modal.tsx`: reset `sessionStartRef` and `turnsRef` atomically on flush.
- Live verification through Playwright against localhost for mining, subtitles, language switching and the call path.
