# Rebuild setup: right order, honest wording, multiple keys

## What's wrong today

The first setup screen makes promises the app cannot keep, and it asks things in the wrong order.

1. **"One tap links your Google account's free Gemini API — no API keys, no copy-pasting, no setup."** Not true. Signing in with Google does not give any app access to Gemini. Only a free key from Google AI Studio does — and the same screen then asks for one.
2. **The tip box repeats the false claim** ("revoke it any time from your Google account") — nothing was granted, so nothing can be revoked.
3. **"Google account linked" shows for anyone signed in**, even by email — the check is "signed in at all", not "signed in with Google".
4. **The app really does try to call Google's AI with the sign-in token** when no key is saved. Google rejects that, and the user sees a quota error — this is the likely source of "quota used up but I never used my key today".
5. **"Free tier · nothing to maintain"** sits directly above a card asking you to create and maintain a key.
6. **Saved key shows only "Key 1"** — no masked preview, no date, no second key, no sign of which one is in use.
7. **"What are you creating today?" appears on top of step 1**, as a pop-up over the sign-in screen, instead of being its own first step.

## The new setup flow

```text
Step 1  What are you creating today?   (the five mind types, as a full step)
Step 2  Sign in or create an account   (Google or email)
Step 3  Add your free Gemini key(s)    (one required, more = faster)
Step 4  Add your videos
Step 5  Price & publish
```

**Step 1 — What are you creating today?**
The five choices (AI Assistant, Robot Brain, Voice Calling Agent, Sales Mind, Gaming Mind) become the first real step instead of a pop-up. The pick is remembered and drives the mining schema, as it already does. Picking is required to move on.

**Step 2 — Sign in or sign up**
Honest title: "Sign in or create your account". Google and email both offered. Copy says what sign-in actually does: saves your minds, keeps mining running in the background. No Gemini claims. The "Google account linked" badge only appears after a real Google sign-in.

**Step 3 — Your free Gemini keys**
- Clear statement: one free key is required; the AI runs entirely on your own free Google quota.
- **Yes — more keys means better performance.** The screen says so: each key has its own free per-minute and per-day allowance, so with several keys mining runs more videos at once and doesn't stall when one hits its limit.
- Add as many keys as you like. Each row shows a masked preview (AIza…7cQ2), the date added, a live OK/limit status, and a remove button.
- The app rotates: it spreads work across keys, and when one hits a limit it moves to the next automatically instead of stopping.
- Cannot continue past this step with zero working keys — that is the one thing the app truly needs.

**Remove the false fallback**
Calling Google's AI with the sign-in token is dropped. With no key, the app says "Add your free Gemini key" with a button to step 3, instead of a misleading quota error.

## Technical notes

- Wizard: `src/components/guided-studio.tsx` — step count 3 → 5, new `StepCategory` (reuse the existing category chooser instead of the modal), `StepGoogle` split into sign-in only, `GeminiKeyCard` becomes its own step; `linked` derives from `hasGeminiOauth()` only.
- Copy in all three languages: `src/lib/i18n.ts` (`step1Title`, `step1Sub`, `tipGoogle` and new step keys), `googleCopy` in guided-studio, `COPY` in `src/components/gemini-key-card.tsx`.
- `src/lib/user-ai.server.ts`: drop `google_token` from `AiCredential`, `resolveGeminiCredential` and `geminiUrl`; missing credential throws the existing `no_credential` error that already renders an "Add key" action.
- Multi-key: `src/lib/keystore.ts` entries gain `maskedTail`, `createdAt`, `lastStatus`; `user_ai_keys` allows several rows per user (drop the single-row assumption in the save/read path); credential resolution picks the least-recently-limited key and retries the next key on a quota error.
- No new tables; one small migration only if `user_ai_keys` has a unique constraint on (user, provider).
