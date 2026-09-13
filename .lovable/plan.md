# Fix the "Add AI key" step: simpler, honest, and actually useful

## What's wrong today

1. **Too much text.** The step is a wall of paragraphs: a key card, a nine-tile grid, a "what this AI can mine" panel, a hint box, a team box, tips. Most of it is read once and never again.
2. **Only one key shows.** After the first key is saved, the paste box disappears — there is no way to add a second or third, and saving the same key twice replaces it. That's why three added keys look like one.
3. **Gemini says "NEEDS KEY" right under "Key tested and saved."** The key card and the AI list use two different storage places, so a working key looks missing.
4. **No status per key.** No AI name, no remaining free usage, no "this one is used up today".
5. **No recommendation.** Nothing tells you which AI suits Gaming, Robot, Voice, etc.
6. **No control over paid keys.** A paid key, once added, is simply live. No on/off, no spending cap.
7. **No fallback.** When the free Gemini quota runs out, mining just stops instead of moving to another key.

## The new step 3

One short intro line, then two cards:

```text
┌ Your Gemini keys (required, free) ───────────────┐
│ Key 1  ••••aAog   working   today: 14 of 50 used │
│ Key 2  ••••7f21   used up · resets in 6h         │
│ Key 3  ••••be03   working                        │
│ [+ Add another key]                              │
└──────────────────────────────────────────────────┘

┌ Extra AI (optional) ─────────────────────────────┐
│ Recommended for Gaming Mind:  Gemini + Claude    │
│ [Groq free] [Mistral free] [Claude paid ⏻] ...   │
│ paid ones: on/off switch + monthly spend cap     │
└──────────────────────────────────────────────────┘
```

### 1. Less text
Every tile keeps one line. The long "what this AI can mine", trade-off and tips blocks collapse into a "Details" link that opens only when tapped. The step intro becomes one sentence.

### 2. Multiple keys, visible
The Add-another-key box stays available after the first key. Each key is listed separately with its own row. A duplicate paste is rejected with "you already added this key" instead of silently replacing.

### 3. Short status per key
Each row shows: name/label, masked ending, state (working / used up / rejected), when it was added, and today's usage counted by the app (requests used today, and time until reset when it's used up). Google does not publish a live quota balance, so the count is Evermind's own tally of calls made with that key — labelled as such, not presented as an official Google number.

### 4. Recommendations per purpose
The chosen creation type puts a "Recommended" badge and a one-line reason on the AIs that fit, and pushes the rest below a "Show all" link:

| Creation type | Recommended |
|---|---|
| AI Assistant / Knowledge | Gemini alone; Groq for faster free reasoning |
| Product & Sales | Gemini + ChatGPT (reliable structure over offers and product shots) |
| Gaming / Player Clone | Gemini (only one that watches continuous gameplay) + Claude for tactics |
| Voice Calling Agent | Gemini + Groq Whisper for accurate speech and timing |
| Robot Brain | Gemini (native video) + Claude for spatial reasoning |

Honest note where it matters: for Gaming and Robot, Gemini stays required because it is the only engine that watches the video itself; the recommended partner reasons over what Gemini extracts.

### 5. Paid keys: switch + spend cap
Every paid provider gets an on/off switch (off by default, even after the key is saved) and a monthly spending cap the creator sets in dollars. Evermind tracks estimated spend per provider from token counts and stops using that key when the cap is reached, showing "Monthly cap reached — raise it or wait". Free providers have no cap field.

### 6. Automatic switching
A fallback order the creator can see and reorder. When a Gemini key hits its daily quota, mining moves to the next Gemini key automatically. If all free keys are used up, it only moves to a paid key when that key's switch is on and its cap allows — otherwise the job pauses with "All free keys are used up; mining resumes after reset" plus a one-tap "use my paid key this time" button. Paid money is never spent silently.

## Technical notes

- **Single key store.** `minerReadiness()` in `src/lib/miner-pool.ts` reads `loadStack().keys[keyField]`; for `gemini` it must read the keystore (`bestGeminiKey()` / `loadApiKeys()`), which is where `GeminiKeyCard` writes. `existingKeyFor`/`storeKeyFor` for `gemini` route to `keystore.ts`.
- **Gemini leaves the pickable grid**: filtered out of `minersForCategory()` for the picker, kept for `findMiner`/`sensePlan`/`DEFAULT_MINER`. Removes the duplicate tile and the "NEEDS KEY" contradiction.
- **`gemini-key-card.tsx`**: always render the add box (not only when `keys.length === 0`); reject duplicates by `value`; per-key rows show `label`, `maskedTail`, `createdAt`, `state`, `exhaustedAt` countdown and today's usage.
- **Usage counters**: extend `ApiKeyEntry` in `src/lib/keystore.ts` with `usage: { day: string; calls: number; estCostUsd: number }`, incremented where calls are made (`api-keys.ts` credential picker returns the entry id so callers can report back, or a small `recordKeyUse(id, cost)` helper called from the mining/chat paths).
- **Paid controls**: engine stack entries gain `enabled: boolean` (default false) and `monthlyCapUsd: number`; `src/lib/engines.ts` `loadStack`/`saveStack` carry them, and credential resolution skips a provider that is off or over cap.
- **Fallback chain**: a `nextCredential()` helper in `api-keys.ts` walks Gemini keys by state, then enabled paid providers within cap; server side, `src/lib/user-ai.server.ts` already classifies `quota` vs `rate_minute` — on `quota` the caller retries with the next credential instead of failing.
- **Recommendations**: add `recommendedFor: CreationCategory[]` plus a one-line `why` to each `MinerOption`; the picker sorts recommended first, collapses the rest behind "Show all".
- **Collapse copy**: move `capability`, `downside`, `limits` and the tips list into a `<details>`-style disclosure; en/mn/ko copy trimmed to one line per tile.
- No database or schema changes; account-synced keys keep using the existing `user_ai_keys` table (extended to store more than one Gemini row if multi-key account sync is kept).
