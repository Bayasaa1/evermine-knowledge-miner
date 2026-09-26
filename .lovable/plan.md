# Replace the retired Gemini model so mining works on your free key

## The problem

Google retired `gemini-2.5-flash` for new users. The app hardcodes it in ~20 places (mining, translation, chat, audit, vision, key tests). Every call fails with "model no longer available", the retry loop keeps re-asking, and your Gemini key's free daily quota gets burned on requests that can never succeed. That is the "Алдаа · хэсэг 0 / 4" failure in your screenshot.

## The fix

Switch every Gemini call to `gemini-3.8-flash` — the current fast model with a free tier, available in this project's model catalog.

1. **One shared default** — introduce a single `GEMINI_DEFAULT_MODEL = "gemini-3.8-flash"` constant and point every hardcoded `"gemini-2.5-flash"` at it, so this never has to be fixed in 20 places again. Files: `src/lib/user-ai.server.ts`, `youtube-mine.server.ts`, `mind-audit.ts`, `miner-reason.ts`, `miner-pool.ts`, `timeline.server.ts`, `retime.server.ts`, `engines.ts`, `key-manager.ts`, `src/routes/api/mind-vision.ts`, `mind-chat.ts`, `mind-coach.ts`, `src/components/guided-studio.tsx`, `src/components/ai-keys-card.tsx`.

2. **Model pickers** — update the dropdowns in `src/lib/ai-providers.ts` and `src/routes/creator.tsx`: replace "Gemini 2.5 Flash" with "Gemini 3.8 Flash (free tier)" and "Gemini 2.5 Pro" with "Gemini 3.1 Pro". Keys saved with the old model name get the new default automatically.

3. **Wasted-quota guard** — when Google answers "model no longer available" (a permanent error), stop retrying that model immediately instead of re-asking until the daily quota is gone. The error message is shown once, and the job falls back to the next assigned key/model if one exists.

4. **Verify live** — run a real mining pass on one of your videos using your saved Gemini key and confirm the job completes (sections progress past 0/4) and usage history shows successful Gemini 3.8 Flash calls, not errors.

## What does not change

- No Lovable credits are touched — everything stays on your own Gemini key.
- Your other providers (Mistral, OpenRouter, Groq) and role assignments stay as they are.
- No videos, projects, or minds are created, moved, or deleted.

## Technical notes

- `gemini-3.8-flash` is in the project's approved model list (Google Gemini family, free tier eligible).
- Translation already uses `gemini-3.1-flash-lite` for Gemini keys; left as-is since it works.
- The retired-model error string is matched and treated as terminal-permanent (no retry), distinct from 429 quota errors which keep the existing cooldown behavior.
