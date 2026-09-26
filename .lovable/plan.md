# Long videos: mine in 5-minute parts, save as you go, continue after tokens run out

## What already works
- Every video is already split into 5-minute parts.
- Each finished part is stored the moment it's done, so a stop never loses mined parts.
- A background worker picks up stopped videos and continues from the next unmined part.

## What's missing (and what this plan fixes)
1. **Mined parts are invisible until the whole video finishes.** A 3-hour video that stops at part 20 of 36 shows nothing in My Vaults. Fix: after each part, update a "partial" Mind so you can see, open and chat with what's mined so far, labelled "Mining 20 / 36 parts".
2. **Waiting is too short and wasteful.** When Gemini's free daily tokens run out, the worker retries every 15 minutes all day, each retry failing. Fix: when the error says the *daily* limit is used up, wait until Google's daily reset (midnight US Pacific, 15:00 Ulaanbaatar); for a per-minute limit, wait ~1 minute. No calls are made while waiting.
3. **One person's empty key stops everyone.** Today, if one user hits their limit, the worker stops mining for all users. Fix: pause only that user's videos; others continue.
4. **Order across many videos.** Queue videos in the order you added them; one video at a time per user, parts in order.
5. **Clear status for you.** Each video shows: parts done / total, "Waiting for free tokens — continues at 15:00", and a "Continue now" button (e.g. after you add another key). Your Pause / Stop always wins.
6. **Other keys first.** Before waiting, try your other saved keys for the Mining role (only if auto-switch is on), as today.

Nothing is auto-created, merged or deleted beyond the Mind for the video you chose to mine, filed into the persona/project you picked. No Lovable credits — only your own keys.

## Technical details
- `src/routes/api/public/cron/resume-mining.ts`: replace global `quotaHit` with a per-user set; classify daily vs per-minute quota (reuse `classifyGemini429` codes `quota` / `rate_minute`) and set `retry_after` to next Pacific midnight or +60s; after each part call a new `upsertPartialMind(job, results)`.
- `src/lib/mining-jobs.ts` / `finalizeMiningJob`: split into partial upsert (writes `mind_vaults` payload with `result` built from mined parts + `progress {done,total}`, stores `vault_id` on the job) and final save reusing the same vault.
- `mining-jobs.functions.ts`: same partial save in the in-tab mining path; add `continueNow(jobId)` clearing `retry_after` (owner-checked).
- Mining queue UI: progress, resume time in local time, Continue now; EN/MN/KO copy.
- Verify: mine a long video until quota stops it, confirm the partial Mind appears with mined parts, and that it resumes from the next part after the wait.
