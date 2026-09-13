# Fix step 3: one key store, one Gemini card, honest wording

## What's wrong on this screen

1. **Gemini says "NEEDS KEY" right below "Key tested and saved."**
   The key card and the AI list save into two different places. The card stores the key in the device vault used by all mining and chat; the AI list checks a separate "engine stack" list that the card never writes. So a working, tested key looks missing.

2. **Gemini is shown twice** — once as the required key card at the top, once as a pickable option in the list below. This is the same duplication just removed from step 1. It also lets someone "pick" Gemini as a miner while the card says the key is required anyway.

3. **A specialist can be selected while Gemini is missing.** Mistral is selected and the screen says "Ready as it is", even though the required Gemini key drives the actual video reading. The step never blocks continuing without Gemini, despite saying required.

4. **Two competing save/test controls.** The Gemini card has its own Test & save; the list has Save AI choice and Test key. Users cannot tell which one they must press.

5. **"Skip this step" contradicts "Required".** Skipping leaves mining impossible, but the wording implies it's fine.

6. **Wording promises that are not true for a selected specialist**: "Ready as it is … your Gemini key supplies any video material Mistral AI cannot reach" appears even when there's no usable Gemini key.

7. Minor: the ready/needs-key badges also use the wrong store, so Groq/Mistral look ready or not based on a list that the rest of the app doesn't read for Gemini.

## The fix

**One key store.** The device vault becomes the single source of truth for the Gemini key. The AI list reads Gemini readiness from the same vault the card writes, so the badge, the account-synced background key, and the mining calls always agree. Other providers keep their own key fields, but readiness for all of them is computed from one function.

**Remove Gemini from the pickable list.** Gemini stays only as the required card at the top, labelled "Required video engine". The list below becomes purely "Optional specialist AI" — every entry clearly extra, never a replacement.

**Gate the step properly.** Without a saved, working Gemini key, Next shows "Add your free Gemini key first" and the optional list is dimmed with an explanation. Once the key is saved, the list unlocks. The Skip line is rewritten to say what is true: you can skip the optional AI, not the key.

**One save flow.** The Gemini card keeps Test & save. The optional list keeps a single control per provider (paste key → Test & save), and the selected specialist is stored on change — no separate "Save AI choice" button to forget.

**Honest hints.** The "Ready as it is" / companion text only claims Gemini coverage when a Gemini key is actually present; otherwise it says the specialist alone cannot read the video.

## Technical notes

- `src/lib/miner-pool.ts`: `minerReadiness()` currently reads only `loadStack().keys[keyField]`. For `gemini` it must read `bestGeminiKey()` from `src/lib/api-keys.ts` (keystore). `existingKeyFor`/`storeKeyFor` for `gemini` route to `keystore.ts` instead of the engine stack; `MINERS` entry for `gemini` is flagged `required: true` and filtered out of `minersForCategory()` results used by the picker (kept for `findMiner`/sense planning and `DEFAULT_MINER`).
- `src/components/miner-pool.tsx`: drop the Gemini tile and its special-cases (`showKeyArea` gemini branch, default badge); add a `locked` prop set by the parent when no Gemini key exists; remove the standalone Save button in favour of saving on select plus per-provider Test & save; re-check readiness after the Gemini card saves (shared refresh via a `keysVersion` prop or a `window` event the card dispatches).
- `src/components/gemini-key-card.tsx`: after a successful save/delete, notify the parent so step 3 re-evaluates the gate.
- `src/components/guided-studio.tsx` step 3: hold `hasGeminiKey` state, pass it to `MinerPool`, and block `next()` with a localized message when false.
- `companionHint()` in `miner-pool.ts` takes the Gemini-present flag and returns the honest variant when absent.
- Copy updates in en/mn/ko for: list title ("Optional specialist AI"), skip line, gate message.
- No database or schema changes.
