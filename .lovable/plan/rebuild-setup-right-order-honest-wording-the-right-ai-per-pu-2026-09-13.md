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

**More AI can improve the result, but more keys do not automatically mean more quota.**
Gemini limits are applied per Google Cloud project, not per API key. Two Gemini keys from the same project share the same limit, so the setup will never promise that another key makes mining faster. A key from a genuinely separate Google Cloud project can provide a separate allowance; the app labels this clearly instead of encouraging duplicate keys. Adding a different thinking AI can improve reasoning or provide a fallback, but may make a job slower and may cost money.

**Optional thinking AI (free or paid), chosen per purpose:**

| Mind type | What the video needs | Free options | Paid options (better quality) |
|---|---|---|---|
| AI Assistant / Knowledge | Words and meaning | Gemini; optional Groq or Mistral reasoning | ChatGPT, Claude, Kimi or OpenRouter reasoning |
| Product & Sales Mind | Words, offers and product shots | Gemini; optional Groq or Mistral reasoning | ChatGPT or Claude reasoning over extracted text and still frames |
| Gaming Mind / Player Clone | Gameplay, movement and tactics | Gemini native video | Experimental Qwen-VL/Llama Vision still-frame analysis; paid vision reasoning |
| Voice Calling Agent | Speech, timing, tone and emotion | Gemini; optional Groq Whisper transcription | Paid transcription/audio reasoning; live calling is configured separately |
| Robot Brain / Embodied VLA | Space, objects and movement | Gemini native video | Experimental Qwen-VL/Llama Vision still-frame analysis; paid vision reasoning |

An AI that cannot do the job never appears in that list. Qwen-VL and Llama Vision are labeled **experimental, still frames only**; they do not independently watch continuous video. For Robot and Gaming Minds, Gemini remains the required video engine. The Voice list is explicitly for mining voice material; it does not claim that a transcription key enables live two-way calling.

### Built-in tips for smooth, fast operation

Step 3 includes a compact guide that changes with the chosen mind type, plus a details panel for users who want the limits:

- **Start simple:** use Gemini alone for the first video. Add one optional thinking AI only when deeper comparison is useful; extra AIs add work and can slow completion.
- **Use the right source:** direct Gemini processing supports public YouTube videos only—not private or unlisted links. The current free limit is shown honestly as up to 8 total YouTube hours per day, not “two hours per video.”
- **Keep long jobs reliable:** recommend one active video at a time on the free tier. Short clips use the fast path; long videos use reusable uploads/background processing where supported.
- **Handle limits correctly:** a per-minute pause is retried automatically and shown as temporary. A daily limit tells the user when to try again. Adding a duplicate key from the same Google project is never suggested as a fix.
- **Choose by purpose:** Knowledge and Sales favor transcript reasoning; Robot and Gaming favor native video; Voice favors accurate speech and timing. Each optional provider says exactly whether it reads text, still frames, audio or native video.
- **Know the trade-off before connecting:** every provider shows “What it adds,” “What it cannot do,” “Free limits or paid,” and a Test button. Experimental free vision options warn that availability can change.
- **Protect the key:** explain that keys are private credentials, display only a masked ending and saved date, and provide clear Replace/Delete controls.

The guide uses short checklists rather than a long tutorial, with a “Why this setup?” expander for the technical detail.

Each row states plainly what it adds, what it costs (free tier / your own paid account), and what it cannot do. Each has a Test button that verifies the key against the provider before it is saved. Paid keys are never required; the screen says so, and says what you gain: no daily limits, longer videos, better reasoning on hard footage.

### Remove the false fallback
Calling Google's AI with the sign-in token is dropped. With no key, the app says "Add your free Gemini key" with a button to step 3 instead of a misleading quota error.

## Technical notes

- Wizard `src/components/guided-studio.tsx`: 3 → 5 steps; new `StepCategory` (reuse the existing chooser instead of the modal); `StepGoogle` becomes sign-in only with `linked` derived from `hasGeminiOauth()` alone; new `StepKeys` combining `GeminiKeyCard` (required, multi-key) and `MinerPool` filtered by the chosen category.
- Pool wiring already exists: `minersForCategory`, `sensesForCategory`, `testMinerKey` in `src/lib/miner-pool.ts`. Correct its outdated claims before rendering: Gemini has no built-in/shared mode; YouTube is public-only with an 8-hour daily free allowance; Qwen/Llama are still-frame analyzers; and optional engines reason over Gemini's extracted material rather than mining raw video themselves.
- Copy in en / mn / ko: `src/lib/i18n.ts` (`step1Title`, `step1Sub`, `tipGoogle`, new step keys), `googleCopy` in guided-studio, `COPY` in `src/components/gemini-key-card.tsx`.
- `src/lib/user-ai.server.ts`: drop `google_token` from `AiCredential`, `resolveGeminiCredential` and `geminiUrl`; missing credential throws the existing `no_credential` error, which already renders an "Add key" action.
- Key management: `src/lib/keystore.ts` entries gain `maskedTail`, `createdAt`, `lastStatus` and an optional user-entered label. Multiple Gemini keys can be saved, but the screen states that same-project keys share quota. Credential resolution can fail over after a rejected/limited key without calling that “more performance.” One small migration removes the current one-key-per-provider constraint only if multi-key account syncing is retained.
- Provider tests should run through authenticated server functions rather than directly exposing provider keys from the browser. OpenRouter free vision choices use a maintained fallback/router rather than one hard-coded model that may disappear.
- Add a purpose-aware `SetupGuide` inside Step 3 with concise speed, source, quota and capability tips in English, Mongolian and Korean.
- No new tables.
