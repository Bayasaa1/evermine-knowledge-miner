# Why it says Mistral when you picked Gemini — and why only some videos translate

## What is actually happening

Two separate faults, both confirmed in the code.

**1. Your pick is silently replaced.**
When the Gemini key you chose is temporarily parked (a minute-burst cooldown, an hourly
limit, or a one-day park after a refusal), the app does not tell you. It quietly walks
down the list of your other saved keys instead — Groq, OpenRouter, Mistral — and the
message you finally see is the complaint of the *last* engine it tried. So you read
"Mistral is out of tokens" while believing Gemini is doing the work. Nothing tells you
Gemini was skipped, or until when.

**2. A line that fails once can stay in the original language for good.**
When a batch fails, the app retries it once. After that it writes the original text into
the device's translation memory as if it were the finished translation. That line is then
never asked for again — even after you fix the key or switch engines. There is also a
five-minute freeze after a quota error: any video opened in that window gets its lines
saved as "already done" in the original language. That is exactly why some videos read
correctly and others stay untranslated forever.

There is also a hard ceiling of four engine calls per request. A long subtitle batch that
needs more than that comes back half-done, which looks like "part of the video translated".

## What to change

**Say what really ran.**
Every translation and every job result reports the engine that actually did the work, and
names the chosen one when it was skipped, with the plain reason and when it comes back:
"Gemini …aAog is resting until 02:14 (daily limit). Mistral answered instead." The API
Manager shows the same line next to the job, with a link to change the engine.

**Respect the choice.**
If auto-switching is unchecked for a job, the app stops with the chosen engine's own
reason instead of spending another key's quota. If it is checked, switching still happens
— it is just announced, not hidden.

**Never remember a failure as a translation.**
Failed lines are recorded as "not translated yet", not as finished text. They are asked
for again when: the viewer reopens the video later, an engine or key changes in the API
Manager, or the five-minute freeze ends. A line only enters the permanent memory when an
engine genuinely returned it.

**Finish long videos.**
The call ceiling becomes per-batch rather than per-request, and a part that fails no
longer discards the parts that succeeded — the translated lines show and only the missing
ones are re-requested.

## Technical notes

- `src/lib/user-ai.server.ts`: `resolveUserAiKey` returns why the assigned key was
  unusable (`skippedAssigned: {tail, reason, until}`); `generateRoleText` carries that
  plus the engine that finally answered back to callers.
- `src/lib/translate.functions.ts`: return `skipped`/`reason` alongside `provider`/`tail`;
  keep partial results from a split batch instead of returning `null` for the whole run;
  raise the call budget per split rather than per request.
- `src/lib/dynamic-translate.ts`: drop `cache[src] = src` on repeated misses; hold failed
  keys in a separate in-memory "missed" set that is cleared on
  `evermind:ai-keys-changed`, when the block expires, and on reload.
- `src/components/ai-roles-card.tsx` and the subtitle panel surface the "who answered /
  who was skipped" line.
- No schema or backend change; no Lovable credits involved.
