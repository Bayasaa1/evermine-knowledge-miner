# Full audit, then fix

Two phases. **Phase 1 is audit only** — I look at everything and report what is wrong. **Phase 2 is the fixing pass** — I repair what Phase 1 found, in one go.

## Already verified (before this plan)

- **No Lovable credit leakage left in the app.** A repo-wide search for the shared AI connection returns zero results. Mining, chat, voice, video, coach, auditor, translation and diagnostics all run on your own Gemini or provider key. Credits used while I build the app are separate and unavoidable — the app's own leak is closed.
- **Database checks are clean.** The backend linter reports no issues.
- **Review "verified buyer" badges are safe.** A database trigger recomputes them from real purchase and deployment records before every write, so they cannot be faked.

---

# Phase 1 — Audit

Each area below produces a written verdict: working, broken, or needs your decision.

### Functionality
Walk every main flow end to end in the running app: sign in, create persona, save project, pick creation type, mine a video, watch progress, open the result, edit and save a version, publish, view in feed, subscribe, chat, voice call, video call, coach, auditor, robot deploy, profile and viewer Core Brain.

### Connections
Check every outside link the app depends on: Gemini (key and Google sign-in), ElevenLabs voice, YouTube metadata and playback, the backend database/auth, the scheduled mining worker, the robot package endpoint and the app's own MCP endpoint. For each: is it reachable, does it fail clearly, and does it say the right thing when not configured.

### System
Backend health: table policies, permissions, indexes on the tables the app reads constantly, the scheduled job that resumes mining, and whether anything runs without an owner.

### Results and mining
Does a mined result open fully (story, topics, emotions, voice/face data, raw JSON, playback)? Do fixes create a new version without losing the old one? Is there duplicate mining, lost persona/project targeting, or a job that hangs or retries forever?

### Subtitles
Alignment after re-timing, correct splitting, readable on phone, and that switching language switches subtitles, answers and spoken voice together.

### Privacy
Viewer Core Brains stay private unless shared. Saved AI keys never reach the browser. Sign-out and account switch wipe every stored key, token and cached vault. Creator-facing aggregates exclude private brains.

### Security
Owner-read paths for hidden rows, caller checks on every public endpoint, server-side enforcement of paid access, and no token or key in any response.

### Lag and performance
Timed refreshes that keep running while hidden (analytics every 4s, token usage every 5s, explore every 45s), first-load work before the first feed video can play, and delay before a Mind answers in chat/voice/video.

### Errors and bugs
Sign-in-required calls made while signed out, duplicate session saves when switching between chat/voice/video, and anything that throws in the browser console or server log during the walkthrough.

### Engines
Does the Engines screen tell the truth per provider, does the "add your free Gemini key" card appear exactly where a feature is blocked, and is "no key" distinguished from "quota used up"?

**Phase 1 output:** one report in chat, grouped into **Broken**, **Risky**, **Slow**, and **Verified fine** — with a one-line plain explanation each. No code changes in this phase.

---

# Phase 2 — Fixing

After you see the report, I fix everything in Broken, Risky and Slow in a single pass, in this order:

1. Anything that blocks a user completing a flow (functionality, mining, results).
2. Privacy and security items.
3. Subtitles and language correctness.
4. Lag and performance.
5. Engine/connection messaging.

Items needing a product decision from you (for example: should users see their own activity log) stay listed and unbuilt until you answer.

Nothing is deferred to a later turn except those decision items, and every fix is re-checked in the running app before I report it done.

## Technical notes

- Live walkthrough driven by Playwright against localhost, capturing console errors and network failures per flow.
- Visibility-gated polling helper replacing raw `setInterval` in `analytics-panel.tsx`, `token-usage-panel.tsx`, `explore.tsx`, `youtube-stage.tsx`.
- Cross-reference `requireSupabaseAuth` server fns against their `useServerFn` callers to find unauthenticated call sites.
- Session flush guard in `talk-to-mind-modal.tsx` (atomic reset of `sessionStartRef` / `turnsRef`).
- Index review on `project_content`, `mining_jobs`, `mind_purchases`, `viewer_brains` for the feed and monitor queries.
