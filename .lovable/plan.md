# Rebuild API Manager as the real AI control centre

## What is wrong now

You are right: this is not a display problem. The connection is incomplete.

Your keys are saved in **two different places** and only one of them is shown.

- When you add a key, it is written to the browser you added it in **and** copied to your account.
- The "My AI keys" list only reads the browser copy.
- The role picker reads the account copy, but supports only a small provider list. Keys such as Groq, Mistral, Cerebras, Together and OpenRouter therefore never appear there.
- Translation always asks the browser for a Gemini key. It does not use the account key or the selected role.
- Mining reads the account's Gemini key, but the rest of the app can still show "add Gemini" because those screens check the empty browser copy.
- Core Brain and camera vision are hard-wired to Gemini. Chat supports only Gemini, OpenAI, Claude and DeepSeek. The other saved APIs are not connected to these roles.

So on your phone at ever-mind.dev the page says "No keys yet" even though your account holds every key you added. The role rows may know a key exists while the feature itself asks somewhere else. That is why selecting a role has not proved the feature will use it.

The six role rows have the opposite problem: they read the **account** list, and when a job allows only one engine the row shows plain text instead of a dropdown, so there is nothing to change.

And the screen opens with a wall of mining advice that belongs in the upload flow, not here.

## What will change

**1. One key list, with one source of truth.**
The account becomes the only source used by the app. API Manager lists every saved key on every signed-in device, with provider, last 4 characters, status, order, enabled state, model, limit and today's calls. Features stop reading a separate browser-only key vault. Raw keys stay server-side; the page receives only safe labels and endings.

**2. Connect each role to the provider call that actually runs it.**

- **Translate:** any connected text provider; selected key is resolved on the server and used by the translation request.
- **Mine video:** Gemini only, because it is the connected engine here that can read a complete YouTube video. Text-only APIs may help after Gemini extracts the video, but cannot replace the video reader.
- **Core Brain:** any connected text provider.
- **Chat:** any connected text provider, including Groq, Mistral, Cerebras, Together, GitHub Models, OpenRouter, OpenAI, Claude, Moonshot, DeepSeek, xAI, Perplexity, Cohere and a valid custom OpenAI-compatible endpoint.
- **Voice clone:** ElevenLabs only; without it, free device speech remains available but is clearly labelled as not cloned.
- **Seeing on video calls:** a provider/key that passes a real image test. Gemini can inspect camera frames; it **cannot clone a face**. The existing role is renamed and never described as face cloning.

Every row is a real dropdown. Incompatible keys are visible under "Cannot do this job" with the reason, rather than hidden. Under the dropdown, one line names the exact key and model that will run the next request.

**3. Auto-switch checkbox with real fallback.**
One checkbox per row: "If this key runs out, use my next compatible key." On (default), a 429/quota response marks that key as waiting and retries once with the next compatible key in the saved order. Off means the job stops and names the failed key. Invalid keys never silently fall through. Paid keys are never entered automatically unless the user enabled that key and set a spending limit.

**4. Honest job names.**
"Face on calls" is not face cloning — Gemini cannot clone a face. It only **looks** at the caller's camera during a video call and describes mood and surroundings. It is renamed **"Seeing on video calls"**, with that sentence as its description. Real face cloning does not exist in the app; nothing will pretend it does. "Voice clone" keeps its honest note: with no ElevenLabs key of your own, minds speak with the free device voice.

**5. This page becomes only API management.**
The long mining-advice block ("Best first choice", "Faster mining", "Not worth it here") moves out of the API Manager. The page becomes: your keys → who runs what → tokens and cost. Nothing else.

**6. Proof the connection end to end before mining.**
A single **Check everything** button runs the real path for each role, not just a provider's model-list endpoint:

- translate one fixed sentence and show the returned translation;
- read one tiny image for video-call sight;
- generate one tiny Core Brain JSON result;
- answer one tiny chat message;
- check ElevenLabs voices;
- validate Gemini video access without starting or saving a mining job.

Each row shows green only when its real job path completed with the selected key. Red shows the provider response and preserves the selection.

**7. A hard no-Lovable-credit guard, not a promise.**
Remove every browser/device credential path and route all six jobs through one server-side resolver that can return only a row from the signed-in user's key table. Add an automated scan/test that fails if an AI job imports the Lovable AI client, calls its gateway, or reads a platform AI key. Before completion, run translation, chat and a dry mining access test and show which user-owned provider/key ending answered each one.

## Technical notes

- Extend `user_ai_keys` with safe operational fields: label, rank, enabled, model, endpoint, paid/free classification, monthly limit, current spend, status and cooldown. Existing rows are preserved and backfilled.
- Add `key_id` and `auto_fallback` to `user_ai_roles`; keep the existing provider/tail data long enough to migrate every current choice to its key row.
- Replace the split `keystore`/`key-manager` execution path with one server-side `resolveUserAiKey(userId, role)` and provider adapters. No raw account key is returned to the browser.
- Provider adapters cover OpenAI-compatible services together, with separate adapters for Gemini, Claude and ElevenLabs. Capabilities are explicit: text, video, image, voice clone.
- `translate.functions.ts`, mining functions, Core Brain routes, `mind-chat.ts`, `mind-vision.ts`, and voice clone routes all call the same resolver and record the actual role/provider/key ending used.
- `ai-roles-card.tsx` reads the same capability list as the resolver, so a choice shown in the UI cannot be rejected by the job later.
- Remove the stale Google-login-as-Gemini fallback from `ai-providers.ts`; Google sign-in is identity only and never counts as an API connection.
- Remove the upload/mining advice from `ai-keys-card.tsx`; keep that guidance only in the mining setup.
- Verification gate: existing account keys visible; each role change persists after refresh; auto-switch tested with a forced exhausted first key; translation visibly changes language; chat returns; mining dry-check names Gemini; no network request to Lovable AI Gateway; no role reports green from a model-list check alone.
