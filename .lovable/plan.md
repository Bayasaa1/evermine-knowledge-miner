# Cut Lovable credits out of Evermind completely

Every AI feature in the app currently falls back to the built-in Lovable AI connection, which is why your build credits drain. This plan removes that connection from every feature and runs everything on the user's own Google/Gemini access.

## One honest limitation up front

Signing in with Google does **not** automatically create a Gemini API key — Google has no such API. What signing in with Google *can* give us is a Google access token with the Gemini permission, which works for many text calls but not reliably for every task (video mining especially).

So the app will do this, in order, per user:

1. Signed in with Google → use that Google session for Gemini. No key typing, no cost.
2. If the app can't use the Google session (video mining, quota used up, permission missing) → a simple card appears right where the user is: "Paste your free Gemini key", a Get my free key button opening Google AI Studio, one input, a Test button that confirms it works, saved once and reused everywhere. Written in their language (en/mn/ko).
3. If the user wants a stronger/paid engine (OpenAI, Claude, DeepSeek, ElevenLabs voice) they add their own key in Engines. Nothing is billed to the app.

At no point does anything fall back to Lovable credits.

## What changes

**Remove the shared AI connection from all 11 places that use it:**
mining (YouTube analysis, timeline, subtitle re-timing), Mind chat, video-call vision, coach, voice, user mind-miner, mind auditor, translation, diagnostics.

Each of these gets rewritten to call Google's Gemini API directly with the current user's credentials.

**Per-user credentials resolver.** A single place decides which credential to use for a request: the signed-in user's Google token, else their saved Gemini key, else their saved key for another provider they picked. If none works, the feature stops with a specific message ("Your free Gemini quota is used up — wait for reset, or add a key in Engines") instead of silently returning nothing.

**Language/translation.** Runs on the same user credential. If the user has no working credential, the app keeps the original text and says so once, rather than pretending.

**Voice.** Cloned voice keeps working only when the creator connected their own voice service key. Otherwise the reply is spoken with the device's built-in voice (free, no key). No paid speech through the app.

**Engines screen.** Becomes the single place to see credential status per provider: Google connected / Gemini key added / other keys, with a test button and a plain-language explanation of where to get a free Gemini key.

**Mining.** Long jobs and the background worker use the job owner's credential, saved with the job, so background mining continues without any shared key. A job whose owner has no working credential pauses with a clear reason instead of failing silently.

## Technical notes

- Delete every `process.env["LOVABLE_API_KEY"]` read and every `ai.gateway.lovable.dev` fetch from: `src/lib/youtube-mine.server.ts`, `timeline.server.ts`, `retime.server.ts`, `mind-audit.functions.ts`, `translate.functions.ts`, and routes `api/mind-chat.ts`, `mind-coach.ts`, `mind-vision.ts`, `mind-voice.ts`, `user-mine.ts`, `diagnose-chat.ts`.
- New `src/lib/user-ai.server.ts`: resolves `{ provider, model, credential }` for a request from (a) `Authorization`-verified user → their stored provider key row, (b) a `googleToken` supplied by the client from the Supabase session `provider_token`, and calls `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with either `Authorization: Bearer <oauth>` or `?key=`. Vision/audio use inline `inline_data` parts on `gemini-2.5-flash`.
- Store per-user provider keys server-side in a new owner-scoped `user_ai_keys` table (RLS: owner only, no anon grant) so background mining jobs can use them; keys are never returned to the client, only a "configured" flag.
- Typed error contract: `{ error, code: "no_credential" | "quota" | "unsupported_task" }` so the UI can show the right localized message (en/mn/ko) and offer "Add a key".
- `guardApi` stays; per-user rate limits stay.

## Nothing left behind

This is done as one complete pass, not feature by feature:

- Every place still touching the shared AI connection is found by a repo-wide search for `LOVABLE_API_KEY` and `ai.gateway.lovable.dev`, and the change is only finished when that search returns zero results.
- The client callers of each changed endpoint are updated in the same pass (chat, voice call, video call, coach, gaming bot, auditor, diagnostics, translation, mining wizard, Vault Hub, Mind Explorer) so no screen keeps calling an old shape.
- Every changed feature is exercised once end to end in the running app before I report it done, and the "add your Gemini key" card is checked on the small phone layout you use.

## Out of scope

- Auto-creating Gemini API keys from a Google login (not possible).
- Any app-provided shared key.
