# Audit of the last two changes, and what to do next

## What was built

**API Manager → "Who runs what"** — six jobs (translating, mining, core brain, chatting, voice clone, face on calls), each with a dropdown to pick one of your saved keys or leave it on "Pick for me". Choices are saved to your account only, and each job now asks for its assigned key before falling back to your newest one.

**Chat → "AI 100%"** — a slider from 0 to 100. The chosen level is written into the mind's instructions: at 0 it may only use the mined records and must say "This is not in this mind's records yet"; at 100 it fills gaps freely.

## How well it is made

Solid:
- Choices are stored per account with owner-only access; a job can never be pointed at another person's key.
- A job only offers engines that can actually do it, and the server refuses a mismatched pair.
- No platform key anywhere — an unassigned job still uses your own newest key.
- The slider is a real instruction, not decoration, and it applies to typed chat, voice calls and video calls alike.
- Verified live: six dropdowns save, the slider changes the wording, no errors.

Weak spots found while auditing:
1. **One chat screen was missed.** Chat inside Search/Explore still uses the old engine picker, so it ignores both the "Chatting" choice and the AI slider. Its comments even mention a platform fallback that no longer exists.
2. **The slider is English only.** Its description does not exist in Mongolian or Korean, unlike the rest of the app.
3. **A key can be chosen but not usable.** The dropdown lists keys saved to your account, while translating and mining pick from the copy held on this device. Pick a key that only exists on the account and the job quietly uses a different one, with no warning.
4. **No proof it worked.** After choosing, there is no "Test" and no line saying which key actually answered the last call, so a silent fallback looks identical to success.
5. **"Pick for me" says nothing.** It does not show which key it would pick, so you cannot tell what is running.
6. **Two rows have nothing to choose.** Voice clone and Face on calls each allow exactly one engine, so the dropdown is decoration until more are supported.
7. **A background "not signed in" error** appears in the preview when signed-out visitors trigger a settings read. It is swallowed, but it pollutes the error list.
8. **The AI level is one setting for the whole device.** It is not remembered per mind, and a creator cannot set a default or a maximum for their own mind.

## Proposed upgrade

**Fix first (small, all found above)**
- Route the Search/Explore chat through the same path as the feed chat: the assigned chatting key plus the AI slider; delete the stale engine-picker comment.
- Translate the slider description into Mongolian and Korean.
- When an assigned key is not available for a job, show an amber line on that row: "This key is not on this device — <other key> is running it".
- Skip the settings read entirely for signed-out visitors so the error stops appearing.

**Then make it provable**
- A "Test" button per row that runs one tiny call with the assigned key and turns the row green or red with a plain reason.
- Under "Pick for me", a grey line naming the key it would use.
- Show today's calls and cost per job in the Tokens and cost block, so you can see which job burns your quota.
- Hide the dropdown on rows with a single option and show the engine name with an "Add key" link instead.

**Then make the AI level smarter**
- Remember the level per mind instead of once per device.
- Let a creator set their mind's default level and a maximum, so a knowledge mind can be locked to "records only".
- Mark added sentences in the answer when the level is between 40 and 70, so you can see what came from the AI rather than the videos.
- Show the level inside voice and video calls too, where it currently applies but is invisible.

## Technical notes

- `src/routes/explore.tsx` (~line 486): replace `brainEngineRoute(loadStack())` with `credentialPayload("chat")` and add `aiLevel`; drop the obsolete comment about a backend secret.
- Slider copy moves into `pickCopy` blocks in `src/components/talk-to-mind-modal.tsx` (EN/MN/KO), with the level persisted per `mindId`.
- `src/components/ai-roles-card.tsx`: cross-check each assigned tail against `geminiKeyChain()` from `@/lib/api-keys` to render the "not on this device" warning; render single-option roles as static text; gate the initial load behind `isAuthenticated` (already present) and also guard `tailForRole` in `src/lib/api-keys.ts` against signed-out calls.
- Per-role test reuses the existing key-test call in `src/components/ai-keys-card.tsx`, scoped to the assigned tail.
- Per-job usage needs a `role` column on the usage rows written in `src/lib/token-usage.ts`; per-mind default/maximum level needs two columns on the mind/persona record plus enforcement in `src/routes/api/mind-chat.ts` (clamp the incoming `aiLevel`).
- No change to how keys are stored; `user_ai_roles` stays as is.
