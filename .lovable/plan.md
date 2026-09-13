# Rebuild setup: right order, honest wording, the right AI per purpose

## What's wrong today

1. **"One tap links your Google account's free Gemini API — no API keys, no setup."** Not true. Signing in with Google does not give any app access to Gemini. Only a free key from Google AI Studio does — and the same screen then asks for one.
2. **The tip box repeats it** ("revoke it any time from your Google account") — nothing was granted, so nothing can be revoked.
3. **"Google account linked" shows for anyone signed in**, even by email — the check is "signed in at all", not "signed in with Google".
4. **The app really does call Google's AI with the sign-in token** when no key is saved. Google rejects that and the user sees a quota error — the likely source of "quota used up but I never used my key today".
5. **"Free tier · nothing to maintain"** sits right above a card asking you to create and maintain a key.
6. **Saved key shows only "Key 1"** — no masked preview, no date, no second key, no sign of which is in use.
7. **"What are you creating today?" is a pop-up over step 1** instead of being the first step.
8. **Nothing tells you which AI your chosen purpose actually needs.** The AI pool already knows this internally (each AI declares whether it can read text, see images, hear audio, watch video), but the setup flow never shows it, so people add a key that cannot do their job.

## The new setup flow

```text
Step 1  What are you creating today?      the five mind types, as a real step
Step 2  Sign in or create your account    Google or email
Step 3  Add the AI keys this type needs   required vs optional, free vs paid
Step 4  Add your videos
Step 5  Price & publish
```

### Step 1 — What are you creating today?
The five choices become the first step, not a modal. The pick is remembered and drives everything after it.

### Step 2 — Sign in or sign up
Honest copy: signing in saves your minds and keeps mining running in the background. No Gemini claims. The Google badge appears only after a real Google sign-in.

### Step 3 — The keys your purpose needs
This is the part that answers "every video is different". Every mind type gets its own short list, split into three clear groups:

**Required (free, everyone needs it): your Gemini key.**
Gemini is the only engine that actually watches the video — subtitles with timestamps, faces, emotions, voice, scenes. Every mind type depends on it, so one free Gemini key is required and the flow will not continue without it.

**Better with more keys (free): add several Gemini keys.**
Yes — more keys means better performance. Each key carries its own free per-minute and per-day allowance, so several keys let mining run more videos at once and keep going when one hits its limit. The app spreads work across them and rotates automatically instead of stopping.

**Optional thinking AI (free or paid), chosen per purpose:**

| Mind type | What the video needs | Free options | Paid options (better quality) |
|---|---|---|---|
| AI Assistant / Knowledge | Words and meaning | Gemini, Groq, Mistral | ChatGPT, Claude, Kimi, OpenRouter |
| Product & Sales Mind | Words, plus product shots | Gemini, Groq, Mistral | ChatGPT, Claude, Kimi, OpenRouter |
| Gaming Mind / Player Clone | Watching gameplay + tactics | Gemini, Qwen-VL, Llama Vision | ChatGPT vision, Claude vision, paid Gemini |
| Voice Calling Agent | Hearing the voice | Gemini, Groq Whisper, Qwen Audio | ChatGPT audio, paid Gemini, voice services |
| Robot Brain / Embodied VLA | Seeing space and movement | Gemini, Qwen-VL, Llama Vision | ChatGPT vision, Claude vision, paid Gemini |

An AI that cannot do the job never appears in that list — a text-only AI is never offered for a Robot Brain.

Each row states plainly what it adds, what it costs (free tier / your own paid account), and what it cannot do. Each has a Test button that verifies the key against the provider before it is saved. Paid keys are never required; the screen says so, and says what you gain: no daily limits, longer videos, better reasoning on hard footage.

### Remove the false fallback
Calling Google's AI with the sign-in token is dropped. With no key, the app says "Add your free Gemini key" with a button to step 3 instead of a misleading quota error.

## Technical notes

- Wizard `src/components/guided-studio.tsx`: 3 → 5 steps; new `StepCategory` (reuse the existing chooser instead of the modal); `StepGoogle` becomes sign-in only with `linked` derived from `hasGeminiOauth()` alone; new `StepKeys` combining `GeminiKeyCard` (required, multi-key) and `MinerPool` filtered by the chosen category.
- Pool wiring already exists: `minersForCategory`, `sensesForCategory`, `testMinerKey` in `src/lib/miner-pool.ts`. The step renders the pool grouped required / free / paid with the per-AI `capability`, `downside` and `limits` text already present.
- Copy in en / mn / ko: `src/lib/i18n.ts` (`step1Title`, `step1Sub`, `tipGoogle`, new step keys), `googleCopy` in guided-studio, `COPY` in `src/components/gemini-key-card.tsx`.
- `src/lib/user-ai.server.ts`: drop `google_token` from `AiCredential`, `resolveGeminiCredential` and `geminiUrl`; missing credential throws the existing `no_credential` error, which already renders an "Add key" action.
- Multi-key: `src/lib/keystore.ts` entries gain `maskedTail`, `createdAt`, `lastStatus`; allow several `user_ai_keys` rows per user; credential resolution picks the least-recently-limited key and retries the next on a quota error. One small migration only if a unique (user, provider) constraint exists.
- No new tables.
