# Fix the AI key step: one key list, simpler screen, real control

## What's wrong today

1. **You can only ever see one key.** After the first Gemini key is saved, the paste box disappears, so a second or third key cannot be added, and re-pasting the same key silently replaces it instead of saying "already added".
2. **Groq and Mistral keys are invisible.** They are written into a different place (the engine stack) than the Gemini card uses, and they are only ever shown as a small "ready" badge on a tile. There is no list of saved keys anywhere.
3. **Keys can disappear after sign-in.** Keys are saved per account in the browser only. A key pasted before signing in lands in the signed-out vault; after signing in the app looks in the account vault and the key looks gone. Keys are also not carried to another device or browser — only Gemini is copied to the account today.
4. **Gemini shows "NEEDS KEY" right under "Key tested and saved"** — same split-storage cause.
5. **Too much text.** A nine-tile grid plus three explanation panels plus tips, all expanded.
6. **No status per key**: no name, no "used up today", no usage.
7. **No recommendation per creation type**, so people pick an AI that cannot do their job.
8. **No control over paid keys**: no on/off, no spending limit, no fallback when the free Gemini quota runs out.

## The new step

One short intro line, then two cards:

```text
┌ My AI keys ──────────────────────────────────────┐
│ Gemini   Key 1 ••••aAog  working   today: 14 used│
│ Gemini   Key 2 ••••7f21  used up · resets in 6h  │
│ Groq     ••••c40a        working          free   │
│ Mistral  ••••9b12        working          free   │
│ Claude   ••••1d77        paid   [off] cap $10/mo │
│ [+ Add a key]                                    │
└──────────────────────────────────────────────────┘

┌ Which AI for this creation type ─────────────────┐
│ Recommended: Gemini + Claude    [Show all]       │
└──────────────────────────────────────────────────┘
```

### 1. One list of every key
Every saved key from every provider appears in a single list, with provider name, masked ending, free/paid, state and the date added. Adding a key that is already saved shows "You already added this key" and nothing is overwritten. Delete is per row.

### 2. Keys stop vanishing
- Keys pasted while signed out are carried over to the account vault on the next sign-in instead of being orphaned.
- All providers (not just Gemini) are saved to the account, so keys follow the creator to another device and background mining can use them.
- The list reads from one shared source, so what the list shows and what mining uses can never disagree.

### 3. Short status per key
Provider name, masked ending, working / used up / rejected, added date, and today's request count as counted by Evermind (Google does not expose a live balance — it is labelled as our own tally, not an official Google number). When a key is used up, it shows when it resets.

### 4. Recommendations per purpose
The chosen creation type marks the AIs that fit with a one-line reason; everything else hides behind "Show all".

| Creation type | Recommended |
|---|---|
| AI Assistant / Knowledge | Gemini alone; Groq for faster free reasoning |
| Product & Sales | Gemini + ChatGPT (reliable structure over offers and product shots) |
| Gaming / Player Clone | Gemini (only engine that watches continuous gameplay) + Claude for tactics |
| Voice Calling Agent | Gemini + Groq Whisper for accurate speech and timing |
| Robot Brain | Gemini (native video) + Claude for spatial reasoning |

Gemini stays required for Gaming and Robot because it is the only engine that watches the footage; the partner reasons over what Gemini extracts.

### 5. Paid keys: switch and spending cap
Each paid provider gets an on/off switch, off by default even after the key is saved, plus a monthly spending cap in dollars. Estimated spend is tracked per provider and that key stops being used at the cap, showing "Monthly cap reached — raise it or wait".

### 6. Automatic switching
When a Gemini key hits its daily quota, mining moves to the next Gemini key automatically. If all free keys are used up, it uses a paid key only when that key is switched on and under its cap; otherwise the job pauses with "All free keys are used up; mining resumes after reset" and a one-tap "use my paid key this time". Money is never spent silently.

### 7. Less text
Each tile keeps one line. Capability, trade-off, limits and tips collapse into a "Details" link. The intro is one sentence.

## Technical notes

- **Single source of truth.** `minerReadiness()`, `existingKeyFor()` and `storeKeyFor()` in `src/lib/miner-pool.ts` use `loadStack()` (engine stack); `GeminiKeyCard` uses `keystore.ts`. Route Gemini through `keystore.ts` in all three, and expose one `listAllKeys()` that merges keystore Gemini entries with engine-stack provider keys for the new list.
- **Scope carry-over.** `src/lib/user-scope.ts` namespaces IndexedDB per account; on sign-in, migrate `anon:`-scoped `engine-stack` and `gemini-api-keys` records into the new account scope (one-time, only when the account scope is empty).
- **Account sync for all providers.** `user_ai_keys` currently only accepts `provider: "gemini"` in `src/lib/user-ai-keys.functions.ts`; widen the enum to the supported provider ids and drop the one-row-per-user assumption so multiple Gemini keys sync. Keys are never returned to the client — only provider, masked tail, state and updated_at.
- **`gemini-key-card.tsx`** becomes the generic key list: always render the add box, provider select, reject duplicates by value, per-row `label`/`maskedTail`/`createdAt`/`state`/reset countdown.
- **Usage counters**: `ApiKeyEntry` in `src/lib/keystore.ts` gains `usage: { day, calls, estCostUsd }`, incremented by a `recordKeyUse(id, cost)` helper called from the mining and chat paths.
- **Paid controls**: engine stack entries gain `enabled` (default false) and `monthlyCapUsd`; credential resolution skips a provider that is off or over cap.
- **Fallback chain**: `nextCredential()` in `src/lib/api-keys.ts` walks Gemini keys by state, then enabled paid providers within cap. `src/lib/user-ai.server.ts` already separates `quota` from `rate_minute`; on `quota` the caller retries with the next credential.
- **Gemini leaves the pickable grid** (kept for `findMiner`/`sensePlan`/`DEFAULT_MINER`), removing the duplicate tile and the "NEEDS KEY" contradiction.
- **Recommendations**: `MinerOption` gains `recommendedFor: CreationCategory[]` and a one-line `why`; the picker sorts recommended first and collapses the rest.
- One small migration to widen the `user_ai_keys` provider constraint and allow multiple rows per provider; existing RLS and grants stay owner-only.
