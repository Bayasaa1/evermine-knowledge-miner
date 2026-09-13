# Fix the false "Gemini quota used up" error

## What is actually happening

The toast appears only when Google's servers answer with a 429. But the free tier has two limits: **per-minute** (about 10 requests/min) and **per-day**. Translation fires automatically in batches when a page opens, so the per-minute limit can be hit in seconds — with zero manual usage. The app currently treats every 429 as "daily quota used up", which is wrong and scary. The Google sign-in token path has an even tighter allowance, making it worse.

## Changes

**1. Tell the two 429s apart — `src/lib/user-ai.server.ts`**
Gemini's 429 body names which limit was hit (`...PerMinute...` vs `...PerDay...` quota ids) and often includes a `retryDelay`. Parse it and raise two distinct errors:
- `rate_minute` — "Too many requests in one minute — retrying automatically in a few seconds."
- `quota` — only when it is genuinely the daily limit.

**2. Auto-retry per-minute limits — `src/lib/translate.functions.ts` (and shared helper)**
On `rate_minute`, wait the server's suggested delay (capped ~30s) and retry the batch once before giving up. Translation batches then mostly recover on their own and no toast appears.

**3. Honest message for true daily quota**
Keep the "add another key in Engines" toast only for confirmed daily-limit 429s, and say *which* credential hit the limit (your pasted key vs your Google sign-in) so the cause is clear. Same distinction applied to the other AI endpoints' error text where they surface quota errors.

**4. Soften the burst source**
Small guard in `src/lib/dynamic-translate.ts`: send translation batches sequentially with a short gap instead of back-to-back, so opening a page does not instantly burst past 10 req/min.

## Technical notes

- Parse `error.details[].quotaId` / `retryDelay` from the Gemini 429 JSON in `raiseForGemini`.
- Retry once with the suggested delay; if it still 429s, surface the minute-limit message, not the daily one.
- No new keys, no schema changes, no behavior change to which credential is used.
- Verified by checking the repo-wide rule still holds: zero `LOVABLE_API_KEY` / `ai.gateway.lovable.dev` references.

## Out of scope

- Changing the free-tier limits themselves (Google's side).
- Automatic key rotation across multiple saved keys (can be added later if wanted).
