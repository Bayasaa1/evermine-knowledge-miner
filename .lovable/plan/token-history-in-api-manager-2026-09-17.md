# Token history in API Manager

Today the "AI tokens & spend" panel only reads a ledger stored in the current browser, and most real work (translation, mining, chat, video-call sight, voice) happens on the server, where nothing is recorded. So the numbers are incomplete and disappear on another device.

The fix: record every AI call on your account, then show a real history session in API Manager.

## What you will see

A new **History** section inside API Manager, with three depths:

1. **Top line (simple)**
   - Tokens used today / this month / all time
   - Estimated money spent, split into free vs paid keys
   - What is left today on each free key (e.g. Gemini free quota)
   - Biggest spender of the week, in one sentence

2. **Where it went (by job)**
   - One row per role: Translation, Mining, Chat, Core Brain, Seeing on video calls, Voice clone
   - Each row: tokens, calls, estimated cost, which key did the work
   - Mining expands into a per-video list: video title, tokens, cost, when
   - Voice clone counts characters (that is how ElevenLabs bills) and shows the dollar estimate, not tokens

3. **Every call (expanded)**
   - Scrollable list: time, role, what it was for (video/mind/project name), AI + key tail, in/out tokens, cost, success or failure
   - Filters by date range, role, key, and "only failures"
   - Export to CSV

## Leak detection

A small "Where you are losing tokens" card that flags, from the same history:
- Failed and retried calls that still burned tokens (repeat cost, no result)
- The same video mined more than once
- Calls that ran on a paid key when a free key with room was available
- Unusually large single calls (very long videos or oversized prompts)
- A key approaching its monthly limit at the current pace

Each flag shows the wasted tokens and estimated money, plus a one-tap action where one exists (turn on auto-switch, remove duplicate mining).

## Technical section

**Storage** — new owner-scoped table `public.ai_usage_events`:
`id, user_id, role, provider, key_id, key_tail, model, subject_kind (video|mind|project|test|other), subject_id, subject_label, input_tokens, output_tokens, char_count, estimated_cost_usd, free_tier, status (ok|error|quota), error_code, job_id, created_at`.
Grants for `authenticated`/`service_role`, RLS `auth.uid() = user_id` for select/insert only (no update/delete except a user-triggered clear). Indexes on `(user_id, created_at desc)` and `(user_id, role)`.

**Recording** — a single `recordAiUsage()` helper in `src/lib/ai-usage.server.ts`, called from the central resolver/generation paths so nothing has to be instrumented twice: `user-ai.server.ts` (`geminiGenerate`, `geminiStream`, provider adapters), `translate.functions.ts`, `routes/api/mind-chat.ts`, `routes/api/mind-vision.ts`, `routes/api/user-mine.ts` / mining finalize, and the ElevenLabs voice path. Token counts come from the existing `readTokens()` shape reader; cost from the existing `PROVIDER_RATES` table, moved to a shared module so server and client price identically. Recording is best-effort and never fails a job.

**Reading** — `src/lib/ai-usage.functions.ts` with `requireSupabaseAuth`: `getUsageSummary(range)`, `getUsageByRole(range)`, `getUsageByVideo(range)`, `listUsageEvents(filters, page)`, `getUsageLeaks(range)`. Aggregation happens in SQL, not in the browser.

**UI** — `src/components/token-history.tsx` rendered inside `/keys` under the existing `TokenUsagePanel`; the current device-only ledger stays as an immediate live counter but the history section is the source of truth. EN/MN/KO copy.

**Retention** — keep 180 days of per-call rows; older data is rolled into a monthly total so history never grows unbounded. "Clear history" wipes the account rows too.
