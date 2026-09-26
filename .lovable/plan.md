# Replace the retired Gemini model with a FREE-tier model

## The problem

Google retired `gemini-2.5-flash` for new users. The app hardcodes it in ~20 places (mining, translation, chat, audit, vision, key tests). Every call fails with "model no longer available", retries burn your key's free daily quota, and mining stops at "Алдаа · хэсэг 0 / 4".

## Important clarification on credits

The app calls Google **directly with your own Gemini key** — mining never touches Lovable credits. The only Lovable credits spent were mine while building/testing code, not your app's AI calls. That stays true after this fix.

## The fix — free tier only

1. **Default model: `gemini-3.1-flash-lite`** — Google's cost-efficient free-tier model, already working in this app for translation (verified live earlier). It becomes the single shared default for mining, chat, audit, vision, retime, and key tests, replacing every hardcoded `gemini-2.5-flash`. Files: `src/lib/user-ai.server.ts`, `youtube-mine.server.ts`, `mind-audit.ts`, `miner-reason.ts`, `miner-pool.ts`, `timeline.server.ts`, `retime.server.ts`, `engines.ts`, `key-manager.ts`, `src/routes/api/mind-vision.ts`, `mind-chat.ts`, `mind-coach.ts`, `src/components/guided-studio.tsx`, `src/components/ai-keys-card.tsx`.

2. **Model pickers show free vs paid clearly** — in `src/lib/ai-providers.ts` and `src/routes/creator.tsx`, the Gemini dropdown lists:
   - `gemini-3.1-flash-lite` — "Free tier" (default, recommended)
   - `gemini-3.8-flash` — "Paid" (only if the user explicitly chooses it)
   - No paid model is ever selected automatically.

3. **Wasted-quota guard** — when Google answers "model no longer available" (permanent), stop retrying that model immediately instead of re-asking until the daily quota is gone. Show the error once; fall back to the next assigned key/model if one exists.

4. **Verify live** — run one real mining pass on your own Gemini key and confirm the job completes (sections progress past 0/4) and usage history shows successful free-tier calls, not errors.

## What does not change

- Everything runs on your own Gemini key's free tier — no Lovable credits, no paid Google models unless you pick one yourself.
- Your other providers (Mistral, OpenRouter, Groq) and role assignments stay as they are.
- No videos, projects, or minds are created, moved, or deleted.
