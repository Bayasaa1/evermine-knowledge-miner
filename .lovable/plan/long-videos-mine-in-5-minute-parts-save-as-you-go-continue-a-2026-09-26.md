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
7. **Parts shown before mining starts.** When you add a video, it's split right away and you see its list: "Part 1 · 0:00–5:00, Part 2 · 5:00–10:00 …", each marked Waiting / Mining / Done / Failed, plus "12 / 36 parts mined" on the video and a total across your queue.
8. **Continues like a playlist when you open the app.** Opening Evermind picks up where it stopped: the next unmined part of the current video, then the next video in your queue, in the order you added them. Background mining still continues while the app is closed. Pause always wins.
9. **Miner model updates itself.** The app no longer relies on one fixed Gemini model name. It asks Google which free models your key can use, picks the best free Flash model, and remembers it. If Google retires a model, the app switches to the newest free one on its own and retries that part once — no error shown to you. It never picks a paid model by itself.


Nothing is auto-created, merged or deleted beyond the Mind for the video you chose to mine, filed into the persona/project you picked. No Lovable credits — only your own keys.

## Technical details
- `src/routes/api/public/cron/resume-mining.ts`: replace global `quotaHit` with a per-user set; classify daily vs per-minute quota (reuse `classifyGemini429` codes `quota` / `rate_minute`) and set `retry_after` to next Pacific midnight or +60s; after each part call a new `upsertPartialMind(job, results)`.
- `src/lib/mining-jobs.ts` / `finalizeMiningJob`: split into partial upsert (writes `mind_vaults` payload with `result` built from mined parts + `progress {done,total}`, stores `vault_id` on the job) and final save reusing the same vault.
- `mining-jobs.functions.ts`: same partial save in the in-tab mining path; add `continueNow(jobId)` clearing `retry_after` (owner-checked).
- Mining queue UI: progress, resume time in local time, Continue now; EN/MN/KO copy.
- Parts list: render `mining_jobs.chunks` with status from `next_index` / `results` / `last_error`; queue total = sum over jobs.
- Playlist resume: on app mount (signed in), a client hook picks the owner's oldest unfinished job by `queue_position` and continues it if no worker holds the lease (updated_at < 3 min), then advances to the next job.
- Self-updating model: `src/lib/gemini-models.ts` gets `resolveFreeGeminiModel(apiKey)` calling Google's models list (cached per key ~24h), filtering to free Flash / Flash-Lite models that support generateContent, excluding paid models; on a `model_retired` error, clear cache, re-resolve, retry the part once.
- Verify: mine a long video until quota stops it, confirm the partial Mind appears with mined parts, and that it resumes from the next part after the wait.
