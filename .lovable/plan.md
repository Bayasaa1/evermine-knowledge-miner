# Fix the setup step: honest wording, one working path

## What I found

I audited the first setup screen and the code behind it. The screen makes promises the app cannot keep.

1. **"One tap links your Google account's free Gemini API — no API keys, no copy-pasting, no setup."**
   Not true. Signing in with Google does not give any app access to Gemini. Only a free key from Google AI Studio does. The screen then immediately asks for that key, contradicting itself.

2. **"Signing in with Google automatically gives Evermind access to your free-tier Gemini API."**
   Same false claim, repeated in the tip box. Nothing is revoked "from your Google account" because nothing was granted.

3. **"Google account linked" appears for anyone signed in.**
   The check is "OAuth linked OR signed in at all", so an email/password user sees a green Google-linked badge that means nothing.

4. **The app really does try to call Gemini with the Google sign-in token.**
   When no key is saved, requests go to Google with the sign-in token as authorization. Google rejects those for ordinary accounts, and the user sees quota/permission errors that look like their key is broken. This is the likely source of the "quota used up but I never used it" reports.

5. **"Free tier · your own access · nothing to maintain"** sits above a card that asks you to create, paste and maintain a key.

6. **Saved key shows only "Key 1"** — no masked value, no date, no way to tell which key is active or to add a second one as a backup.

## The fix

**Rewrite step 1 as one honest flow**

- New title and subtitle: signing in saves your work; your free Gemini key is what powers the AI.
- Tip box rewritten: the key is free from Google AI Studio, takes one minute, and stays yours.
- Remove the "no API keys, no setup" and "automatically gives access" claims in all three languages (English, Mongolian, Korean).
- "Google account linked" only shows when Google sign-in actually happened; a plain signed-in user sees their account, not a Google badge.
- The green "nothing to maintain" pill moves to describe the key (free, your own quota), not the sign-in.

**Stop pretending the sign-in token works for AI**

- Drop the Google-sign-in-token path for Gemini calls entirely. Without a saved key the app says clearly: "Add your free Gemini key to turn this on", with a button that jumps straight to the key card — instead of failing with a misleading quota error.

**Improve the saved-key list**

- Show a masked preview (AIza…7cQ2) and the date added.
- Allow more than one key, mark which is in use, and fall back to the next key when one hits its daily limit.
- Keep removal per key.

## Technical notes

- Copy: `src/lib/i18n.ts` (`step1Title`, `step1Sub`, `tipGoogle`), `googleCopy` in `src/components/guided-studio.tsx`, `COPY` in `src/components/gemini-key-card.tsx`.
- `StepGoogle`: `linked` must be `oauthLinked` only; body copy split into sign-in state vs key state.
- `src/lib/user-ai.server.ts`: remove `google_token` from `AiCredential` and `resolveGeminiCredential`/`geminiUrl`; unresolved credential throws the existing `no_credential` error, which already surfaces the "Add key" action.
- Key vault (`src/lib/keystore.ts` + `gemini-key-card.tsx`): store label, masked tail, `createdAt`; rotate to the next key on a `quota` error.
- No database or schema changes.
